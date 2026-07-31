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

  it("returns 400 when neither categoryId nor description is provided", async () => {
    const result = await suggestPrice(makeEvent({ brand: "Nike" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("validation_error");
    expect(body.fields).toContain(
      "At least one of categoryId or description is required",
    );
  });

  it("returns 400 when no query params are provided", async () => {
    const result = await suggestPrice(makeEvent());

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("validation_error");
  });

  it("accepts request with only description (no categoryId)", async () => {
    // Level 1: brand×desc — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 2: desc-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 5: brand×desc unsold — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 6: desc-only unsold — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBeNull();
  });

  it("returns null suggestion when no pricing data exists", async () => {
    // Level 1: brand×desc — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 2: desc-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 3: brand×cat — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 4: cat-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 5: brand×desc unsold — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 6: desc-only unsold — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBeNull();
    expect(body.confidence).toBeNull();
    expect(body.source).toBeNull();
    expect(body.warning).toBeNull();
    expect(body.explanation).toBe(
      "No pricing data available for this category",
    );
    expect(body.adjustments).toBeNull();
    expect(body.groupInfo).toBeNull();
  });

  it("returns suggestion at fallback level 1 (brand×description)", async () => {
    // Level 1: brand×desc — found with sampleSize > 0
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 45.0,
        medianTagPrice: 50.0,
        medianSalePrice: 45.0,
        sellThroughRate: 0.7,
        medianDaysOnShelf: 18,
        sampleSize: 15,
        totalItems: 20,
        unsoldCount: 5,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBe(45.0);
    expect(body.source).toBe("sold");
    expect(body.warning).toBeNull();
    expect(body.groupInfo.fallbackLevel).toBe(1);
    expect(body.groupInfo.description).toBe("Hose");
    expect(body.groupInfo.brand).toBe("Nike");
  });

  it("returns suggestion at fallback level 2 (description-only)", async () => {
    // Level 1: brand×desc — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 2: desc-only — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#_NONE_#DESC#Hose",
        SK: "METADATA",
        brand: "_NONE_",
        description: "Hose",
        referencePrice: 40.0,
        medianTagPrice: 48.0,
        medianSalePrice: 40.0,
        sellThroughRate: 0.6,
        medianDaysOnShelf: 22,
        sampleSize: 30,
        totalItems: 50,
        unsoldCount: 20,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBe(40.0);
    expect(body.source).toBe("sold");
    expect(body.groupInfo.fallbackLevel).toBe(2);
    expect(body.groupInfo.brand).toBeNull();
    expect(body.groupInfo.description).toBe("Hose");
  });

  it("returns suggestion at fallback level 3 (brand×category)", async () => {
    // Level 1: brand×desc — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 2: desc-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 3: brand×cat — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 50.0,
        medianTagPrice: 55.0,
        medianSalePrice: 50.0,
        sellThroughRate: 0.65,
        medianDaysOnShelf: 20,
        sampleSize: 25,
        totalItems: 40,
        unsoldCount: 15,
        velocityMultiplier: 1.0,
        colorAdjustments: { Black: 1.05 },
        sizeAdjustments: { M: 0.98 },
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBe(50.0);
    expect(body.source).toBe("sold");
    expect(body.groupInfo.fallbackLevel).toBe(3);
    expect(body.groupInfo.brand).toBe("Nike");
    expect(body.groupInfo.category).toBe("Shoes");
  });

  it("returns suggestion at fallback level 4 (category-only)", async () => {
    // Level 1: brand×desc — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 2: desc-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 3: brand×cat — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 4: cat-only — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#_NONE_#cat-456",
        SK: "METADATA",
        brand: "_NONE_",
        categoryId: "cat-456",
        categoryName: "Bags",
        referencePrice: 30.0,
        medianTagPrice: 35.0,
        medianSalePrice: 30.0,
        sellThroughRate: 0.4,
        medianDaysOnShelf: 30,
        sampleSize: 12,
        totalItems: 30,
        unsoldCount: 18,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({
        brand: "UnknownBrand",
        categoryId: "cat-456",
        description: "Tasche",
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBe(30.0);
    expect(body.source).toBe("sold");
    expect(body.groupInfo.fallbackLevel).toBe(4);
    expect(body.groupInfo.brand).toBeNull();
    expect(body.groupInfo.category).toBe("Bags");
  });

  it("returns suggestion at fallback level 5 (unsold brand×description)", async () => {
    // Level 1: brand×desc — found but sampleSize = 0
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 0,
        medianTagPrice: 60.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 8,
        unsoldCount: 8,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);
    // Level 2: desc-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 3: brand×cat — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 4: cat-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 5: brand×desc unsold — same record, unsoldCount > 0
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 0,
        medianTagPrice: 60.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 8,
        unsoldCount: 8,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.source).toBe("unsold");
    expect(body.groupInfo.fallbackLevel).toBe(5);
    expect(body.groupInfo.brand).toBe("Nike");
    expect(body.groupInfo.description).toBe("Hose");
  });

  it("applies 10% discount to medianTagPrice for Tier 2 unsold fallback", async () => {
    // Level 1: brand×desc — found but sampleSize = 0
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 0,
        medianTagPrice: 50.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 10,
        unsoldCount: 10,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);
    // Level 2: desc-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 3: brand×cat — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 4: cat-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 5: brand×desc unsold — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 0,
        medianTagPrice: 50.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 10,
        unsoldCount: 10,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    // medianTagPrice (50.0) * 0.90 = 45.0
    expect(body.suggestedPrice).toBe(45.0);
    expect(body.adjustments.referencePrice).toBe(45.0);
    expect(body.source).toBe("unsold");
  });

  it("sets confidence to 'low' for Tier 2 regardless of sample size", async () => {
    // Level 1: brand×desc — found but sampleSize = 0
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 0,
        medianTagPrice: 80.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 25,
        unsoldCount: 25,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);
    // Level 2: desc-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 3: brand×cat — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 4: cat-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 5: brand×desc unsold — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 0,
        medianTagPrice: 80.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 25,
        unsoldCount: 25,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    // Tier 2 always returns "low" confidence regardless of data
    expect(body.confidence).toBe("low");
  });

  it("includes warning message when source is 'unsold'", async () => {
    // Level 1: brand×desc — found but sampleSize = 0
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 0,
        medianTagPrice: 45.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 6,
        unsoldCount: 6,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);
    // Level 2: desc-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 3: brand×cat — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 4: cat-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 5: brand×desc unsold — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 0,
        medianTagPrice: 45.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 6,
        unsoldCount: 6,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.warning).toBe(
      "Price based on unsold items. Similar items in this group haven't sold yet — consider pricing below CHF 45.00 (median tag price of unsold items).",
    );
  });

  it("does not include warning when source is 'sold'", async () => {
    // Level 1: brand×desc — found with sales
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 45.0,
        medianTagPrice: 50.0,
        medianSalePrice: 45.0,
        sellThroughRate: 0.7,
        medianDaysOnShelf: 18,
        sampleSize: 15,
        totalItems: 20,
        unsoldCount: 5,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.warning).toBeNull();
    expect(body.source).toBe("sold");
  });

  it("returns suggestion at fallback level 6 (unsold description-only)", async () => {
    // Level 1: brand×desc — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 2: desc-only — found but sampleSize = 0
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#_NONE_#DESC#Sandalen",
        SK: "METADATA",
        brand: "_NONE_",
        description: "Sandalen",
        referencePrice: 0,
        medianTagPrice: 35.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 5,
        unsoldCount: 5,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);
    // Level 3: brand×cat — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 4: cat-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 5: brand×desc unsold — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 6: desc-only unsold — found with unsoldCount > 0
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#_NONE_#DESC#Sandalen",
        SK: "METADATA",
        brand: "_NONE_",
        description: "Sandalen",
        referencePrice: 0,
        medianTagPrice: 35.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 5,
        unsoldCount: 5,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({
        brand: "Nike",
        categoryId: "cat-123",
        description: "Sandalen",
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.source).toBe("unsold");
    expect(body.groupInfo.fallbackLevel).toBe(6);
    expect(body.groupInfo.brand).toBeNull();
    expect(body.groupInfo.description).toBe("Sandalen");
  });

  it("skips description levels when description is not provided", async () => {
    // No description provided, so skips levels 1,2,5,6
    // Level 3: brand×cat — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 50.0,
        medianTagPrice: 55.0,
        medianSalePrice: 50.0,
        sellThroughRate: 0.65,
        medianDaysOnShelf: 20,
        sampleSize: 25,
        totalItems: 40,
        unsoldCount: 15,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.suggestedPrice).toBe(50.0);
    expect(body.source).toBe("sold");
    expect(body.groupInfo.fallbackLevel).toBe(3);
  });

  it("falls back to category-only when brand×category not found (no description)", async () => {
    // Level 3: brand×cat — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 4: cat-only — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#_NONE_#cat-456",
        SK: "METADATA",
        brand: "_NONE_",
        categoryId: "cat-456",
        categoryName: "Bags",
        referencePrice: 30.0,
        medianTagPrice: 35.0,
        medianSalePrice: 30.0,
        sellThroughRate: 0.4,
        medianDaysOnShelf: 30,
        sampleSize: 12,
        totalItems: 30,
        unsoldCount: 18,
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
    expect(body.confidence).toBe("high");
    expect(body.source).toBe("sold");
    expect(body.groupInfo.brand).toBeNull();
    expect(body.groupInfo.category).toBe("Bags");
    expect(body.groupInfo.fallbackLevel).toBe(4);
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
        medianTagPrice: 45.0,
        medianSalePrice: 40.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 20,
        sampleSize: 30,
        totalItems: 50,
        unsoldCount: 20,
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
        medianTagPrice: 45.0,
        medianSalePrice: 40.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 20,
        sampleSize: 30,
        totalItems: 50,
        unsoldCount: 20,
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

  it("applies creator adjustment when employee has >= 10 sample size", async () => {
    // Level 3: brand×cat — found
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 100.0,
        medianTagPrice: 110.0,
        medianSalePrice: 100.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 20,
        sampleSize: 25,
        totalItems: 50,
        unsoldCount: 25,
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
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#cat-123",
        SK: "METADATA",
        brand: "Nike",
        categoryId: "cat-123",
        categoryName: "Shoes",
        referencePrice: 100.0,
        medianTagPrice: 110.0,
        medianSalePrice: 100.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 20,
        sampleSize: 25,
        totalItems: 50,
        unsoldCount: 25,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);
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
    expect(body.suggestedPrice).toBe(100.0);
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
        medianTagPrice: 35.0,
        medianSalePrice: 30.0,
        sellThroughRate: 0.2,
        medianDaysOnShelf: 40,
        sampleSize: 3,
        totalItems: 15,
        unsoldCount: 12,
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

  it("prefers Tier 1 category match over Tier 2 unsold description match", async () => {
    // Level 1: brand×desc — found but sampleSize = 0 (no sold items)
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Nike#DESC#Hose",
        SK: "METADATA",
        brand: "Nike",
        description: "Hose",
        referencePrice: 0,
        medianTagPrice: 60.0,
        medianSalePrice: 0,
        sellThroughRate: 0,
        medianDaysOnShelf: 0,
        sampleSize: 0,
        totalItems: 8,
        unsoldCount: 8,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);
    // Level 2: desc-only — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 3: brand×cat — not found
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);
    // Level 4: cat-only — found with sampleSize > 0 (Tier 1 match!)
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#_NONE_#cat-123",
        SK: "METADATA",
        brand: "_NONE_",
        categoryId: "cat-123",
        categoryName: "Pants",
        referencePrice: 35.0,
        medianTagPrice: 40.0,
        medianSalePrice: 35.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 25,
        sampleSize: 10,
        totalItems: 20,
        unsoldCount: 10,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    const result = await suggestPrice(
      makeEvent({ brand: "Nike", categoryId: "cat-123", description: "Hose" }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    // Tier 1 level 4 (category-only) should win over Tier 2 (unsold description)
    expect(body.source).toBe("sold");
    expect(body.groupInfo.fallbackLevel).toBe(4);
    expect(body.suggestedPrice).toBe(35.0);
    expect(body.warning).toBeNull();
    expect(body.confidence).not.toBe("low");
  });

  it("queries correct DynamoDB keys for brand×description", async () => {
    mockedSend.mockResolvedValueOnce({
      Item: {
        PK: "PRICING_REF#Adidas#DESC#Sandalen",
        SK: "METADATA",
        brand: "Adidas",
        description: "Sandalen",
        referencePrice: 25.0,
        medianTagPrice: 30.0,
        medianSalePrice: 25.0,
        sellThroughRate: 0.5,
        medianDaysOnShelf: 15,
        sampleSize: 10,
        totalItems: 20,
        unsoldCount: 10,
        velocityMultiplier: 1.0,
        colorAdjustments: {},
        sizeAdjustments: {},
      },
    } as never);

    await suggestPrice(
      makeEvent({
        brand: "Adidas",
        categoryId: "cat-789",
        description: "Sandalen",
      }),
    );

    // First call should be for brand×description (level 1)
    expect(mockedSend).toHaveBeenCalledTimes(1);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input).toMatchObject({
      TableName: "test-pricing-table",
      Key: {
        PK: "PRICING_REF#Adidas#DESC#Sandalen",
        SK: "METADATA",
      },
    });
  });
});
