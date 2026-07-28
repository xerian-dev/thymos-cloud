import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

vi.mock("../../src/dynamodb-client.js", () => ({
  docClient: { send: vi.fn() },
  TABLE_NAME: "test-table",
  PRICING_TABLE_NAME: "test-pricing-table",
}));

import { suggestPrice } from "../../src/routes/suggest-price.js";
import { docClient } from "../../src/dynamodb-client.js";

const mockedSend = vi.mocked(docClient.send);

function makeEvent(
  queryStringParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/pricing/suggest",
    rawPath: "/api/pricing/suggest",
    rawQueryString: "",
    headers: {},
    queryStringParameters,
    requestContext: {
      accountId: "123",
      apiId: "api",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method: "GET",
        path: "/api/pricing/suggest",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-1",
      routeKey: "GET /api/pricing/suggest",
      stage: "$default",
      time: "01/Jan/2024:00:00:00 +0000",
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    version: "2.0",
  };
}

describe("suggestPrice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when categoryId is missing", async () => {
    const result = await suggestPrice(makeEvent({ brand: "Nike" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("validation_error");
    expect(body.fields).toContain("categoryId is required");
  });

  it("returns 400 when no query params are provided", async () => {
    const result = await suggestPrice(makeEvent());

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("validation_error");
  });

  it("returns null suggestion when no pricing data exists", async () => {
    // First call: brand×category lookup — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Second call: category-only fallback — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBeNull();
    expect(body.confidence).toBeNull();
    expect(body.explanation).toBe(
      "No pricing data available for this category",
    );
    expect(body.adjustments).toBeNull();
    expect(body.groupInfo).toBeNull();
  });

  it("returns null suggestion when no brand and category-only fallback not found", async () => {
    // Only one call: category-only lookup — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);

    const result = await suggestPrice(makeEvent({ categoryId: "cat-123" }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBeNull();
    expect(body.confidence).toBeNull();
  });

  it("returns suggestion using brand×category reference data", async () => {
    // Brand×category lookup found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 50.0,
        sellThroughRate: 0.65,
        medianDaysOnShelf: 20,
        sampleSize: 25,
        velocityMultiplier: 1.0,
        colorAdjustments: { Black: 1.05 },
        sizeAdjustments: { M: 0.98 },
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBe(50.0);
    expect(body.confidence).toBe("high");
    expect(body.adjustments).toEqual({
      referencePrice: 50.0,
      velocityMultiplier: 1.0,
      creatorAdjustment: 1.0,
      colorAdjustment: 1.0,
      sizeAdjustment: 1.0,
    });
    expect(body.groupInfo).toEqual({
      brand: "Nike",
      category: "Shoes",
      sampleSize: 25,
      sellThroughRate: 0.65,
      medianDaysOnShelf: 20,
    });
  });

  it("applies color adjustment when color matches", async () => {
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 40.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 20,
        sampleSize: 30,
        velocityMultiplier: 1.0,
        colorAdjustments: { Black: 1.1 },
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", color: "Black" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    // 40 * 1.0 * 1.0 * 1.1 * 1.0 = 44.0
    expect(body.suggestedPrice).toBe(44.0);
    expect(body.adjustments.colorAdjustment).toBe(1.1);
  });

  it("applies size adjustment when size matches", async () => {
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 40.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 20,
        sampleSize: 30,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: { L: 1.05 },
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", size: "L" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    // 40 * 1.0 * 1.0 * 1.0 * 1.05 = 42.0
    expect(body.suggestedPrice).toBe(42.0);
    expect(body.adjustments.sizeAdjustment).toBe(1.05);
  });

  it("falls back to category-only when brand×category not found", async () => {
    // Brand×category lookup — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Category-only fallback — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#_NONE_#cat-456",
        SK: "METADATA",
        brand: "_NONE_",
        categoryId: "cat-456",
        categoryName: "Bags",
        referencePrice: 30.0,
        sellThroughRate: 0.4,
        medianDaysOnShelf: 30,
        sampleSize: 12,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "UnknownBrand", categoryId: "cat-456" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBe(30.0);
    expect(body.confidence).toBe("medium");
    expect(body.groupInfo.brand).toBeNull();
    expect(body.groupInfo.category).toBe("Bags");
    expect(body.explanation).toContain("insufficient brand-specific data");
  });

  it("applies creator adjustment when employee has >= 10 sample size", async () => {
    // Brand×category lookup — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 100.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 20,
        sampleSize: 25,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);
    // Employee pricing lookup
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "EMPLOYEE_PRICING#emp-1",
        SK: "METADATA",
        employeeId: "emp-1",
        creatorAdjustment: 0.9,
        sampleSize: 15,
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({
        brand: "Nike",
        categoryId: "cat-123",
        createdBy: "emp-1",
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    // 100 * 1.0 * 0.9 * 1.0 * 1.0 = 90.0
    expect(body.suggestedPrice).toBe(90.0);
    expect(body.adjustments.creatorAdjustment).toBe(0.9);
  });

  it("does not apply creator adjustment when employee has < 10 sample size", async () => {
    // Brand×category lookup — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 100.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 20,
        sampleSize: 25,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);
    // Employee pricing lookup — insufficient sample size
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "EMPLOYEE_PRICING#emp-2",
        SK: "METADATA",
        employeeId: "emp-2",
        creatorAdjustment: 0.85,
        sampleSize: 7,
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({
        brand: "Nike",
        categoryId: "cat-123",
        createdBy: "emp-2",
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    // Creator adjustment not applied — stays at 1.0
    expect(body.suggestedPrice).toBe(100.0);
    expect(body.adjustments.creatorAdjustment).toBe(1.0);
  });

  it("does not apply creator adjustment when employee not found", async () => {
    // Brand×category lookup — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 50.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 20,
        sampleSize: 25,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);
    // Employee not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);

    const result = await suggestPrice(
      makeEvent({
        brand: "Nike",
        categoryId: "cat-123",
        createdBy: "emp-unknown",
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBe(50.0);
    expect(body.adjustments.creatorAdjustment).toBe(1.0);
  });

  it("returns confidence 'low' for small sample sizes", async () => {
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 30.0,
        sellThroughRate: 0.2,
        medianDaysOnShelf: 40,
        sampleSize: 3,
        velocityMultiplier: 0.92,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.confidence).toBe("low");
  });

  it("returns 500 on DynamoDB error", async () => {
    mockedSend.mockRejectedValueOnce(new Error("DynamoDB unavailable"));

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123" }),
    );

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("internal_error");
  });

  it("queries correct DynamoDB keys for brand×category", async () => {
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Adidas#cat-789",
        SK: "METADATA",
        brand: "Adidas",
        categoryId: "cat-789",
        categoryName: "Tops",
        referencePrice: 25.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 15,
        sampleSize: 10,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    await suggestPrice(makeEvent({ brand: "Adidas", categoryId: "cat-789" }));

    expect(mockedSend).toHaveBeenCalledTimes(1);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input).toMatchObject({
      TableName: "test-pricing-table",
      Key: {
        PK: "PRICING_REF#Adidas#cat-789",
        SK: "METADATA",
      },
    });
  });
});
