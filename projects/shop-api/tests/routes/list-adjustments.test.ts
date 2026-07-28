import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

vi.mock("../../src/dynamodb-client.js", () => ({
  docClient: { send: vi.fn() },
  TABLE_NAME: "test-table",
  PRICING_TABLE_NAME: "test-pricing-table",
}));

import { listAdjustments } from "../../src/routes/list-adjustments.js";
import { docClient } from "../../src/dynamodb-client.js";
import { encodeCursor } from "../../src/cursor-utils.js";

const mockedSend = vi.mocked(docClient.send);

function makeEvent(
  queryStringParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/pricing/adjustments",
    rawPath: "/api/pricing/adjustments",
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
        path: "/api/pricing/adjustments",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-1",
      routeKey: "GET /api/pricing/adjustments",
      stage: "$default",
      time: "01/Jan/2024:00:00:00 +0000",
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    version: "2.0",
  };
}

function makeAdjustmentItem(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    PK: "ADJUSTMENT#adj-1",
    SK: "METADATA",
    GSI1PK: "ADJUSTMENTS",
    GSI1SK: "ADJUSTMENT#2024-06-15T10:00:00.000Z",
    id: "adj-1",
    brand: "Nike",
    category: "Shoes",
    categoryId: "cat-123",
    previousPrice: 50.0,
    newPrice: 45.0,
    direction: "decrease",
    percentageChange: -10.0,
    reason: "Sell-through rate dropped below 30%",
    metrics: {
      sellThroughRate: 0.25,
      medianDaysOnShelf: 35,
      sampleSize: 28,
      discountFrequency: 0.4,
      priceRatio: 0.85,
    },
    timestamp: "2024-06-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("GET /api/pricing/adjustments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns adjustments with default pagination", async () => {
    const item = makeAdjustmentItem();
    mockedSend.mockResolvedValueOnce({
      Items: [item],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.adjustments).toHaveLength(1);
    expect(body.adjustments[0].id).toBe("adj-1");
    expect(body.adjustments[0].brand).toBe("Nike");
    expect(body.adjustments[0].direction).toBe("decrease");
    expect(body.adjustments[0].percentageChange).toBe(-10.0);
    expect(body.nextCursor).toBeNull();
    expect(body.hasMore).toBe(false);
  });

  it("strips DynamoDB key attributes from returned records", async () => {
    const item = makeAdjustmentItem();
    mockedSend.mockResolvedValueOnce({
      Items: [item],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    const adjustment = body.adjustments[0];
    expect(adjustment.PK).toBeUndefined();
    expect(adjustment.SK).toBeUndefined();
    expect(adjustment.GSI1PK).toBeUndefined();
    expect(adjustment.GSI1SK).toBeUndefined();
  });

  it("returns empty results when no adjustments exist", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.adjustments).toEqual([]);
    expect(body.nextCursor).toBeNull();
    expect(body.hasMore).toBe(false);
  });

  // --- Pagination ---

  it("returns nextCursor when more results available", async () => {
    const lastKey = {
      PK: "ADJUSTMENT#adj-5",
      SK: "METADATA",
      GSI1PK: "ADJUSTMENTS",
      GSI1SK: "ADJUSTMENT#2024-06-10T00:00:00.000Z",
    };
    mockedSend.mockResolvedValueOnce({
      Items: [makeAdjustmentItem()],
      LastEvaluatedKey: lastKey,
    } as never);

    const result = await listAdjustments(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.nextCursor).not.toBeNull();
    expect(body.hasMore).toBe(true);
  });

  it("passes cursor as ExclusiveStartKey to DynamoDB", async () => {
    const startKey = {
      PK: "ADJUSTMENT#adj-3",
      SK: "METADATA",
      GSI1PK: "ADJUSTMENTS",
      GSI1SK: "ADJUSTMENT#2024-06-12T00:00:00.000Z",
    };
    const cursor = encodeCursor(startKey);

    mockedSend.mockResolvedValueOnce({
      Items: [makeAdjustmentItem({ id: "adj-4" })],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(makeEvent({ cursor }));

    expect(result.statusCode).toBe(200);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input.ExclusiveStartKey).toEqual(startKey);
  });

  it("accepts pageSize=50", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(makeEvent({ pageSize: "50" }));

    expect(result.statusCode).toBe(200);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input.Limit).toBe(50);
  });

  it("accepts pageSize=100", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(makeEvent({ pageSize: "100" }));

    expect(result.statusCode).toBe(200);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input.Limit).toBe(100);
  });

  // --- Validation errors ---

  it("returns 400 for invalid pageSize", async () => {
    const result = await listAdjustments(makeEvent({ pageSize: "25" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("validation_error");
    expect(body.fields).toContain("pageSize must be one of 20, 50, 100");
  });

  it("returns 400 for invalid direction filter", async () => {
    const result = await listAdjustments(makeEvent({ direction: "sideways" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("validation_error");
    expect(body.fields).toContain("direction must be 'increase' or 'decrease'");
  });

  it("returns 400 for invalid fromDate", async () => {
    const result = await listAdjustments(makeEvent({ fromDate: "not-a-date" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("validation_error");
    expect(body.fields).toContain("fromDate must be a valid ISO 8601 date");
  });

  it("returns 400 for invalid toDate", async () => {
    const result = await listAdjustments(makeEvent({ toDate: "yesterday" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("validation_error");
    expect(body.fields).toContain("toDate must be a valid ISO 8601 date");
  });

  it("returns 400 for invalid cursor", async () => {
    const result = await listAdjustments(
      makeEvent({ cursor: "!!!invalid!!!" }),
    );

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("Invalid cursor");
  });

  // --- Filters ---

  it("filters by direction=decrease", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [makeAdjustmentItem({ direction: "decrease" })],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(makeEvent({ direction: "decrease" }));

    expect(result.statusCode).toBe(200);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input.FilterExpression).toContain(
      "#direction = :directionVal",
    );
    expect(command.input.ExpressionAttributeValues[":directionVal"]).toBe(
      "decrease",
    );
  });

  it("filters by direction=increase", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        makeAdjustmentItem({ direction: "increase", percentageChange: 5.0 }),
      ],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(makeEvent({ direction: "increase" }));

    expect(result.statusCode).toBe(200);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input.ExpressionAttributeValues[":directionVal"]).toBe(
      "increase",
    );
  });

  it("filters by brand", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [makeAdjustmentItem({ brand: "Adidas" })],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(makeEvent({ brand: "Adidas" }));

    expect(result.statusCode).toBe(200);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input.FilterExpression).toContain("#brand = :brandVal");
    expect(command.input.ExpressionAttributeValues[":brandVal"]).toBe("Adidas");
  });

  it("filters by date range (fromDate and toDate)", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [makeAdjustmentItem()],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(
      makeEvent({
        fromDate: "2024-06-01T00:00:00.000Z",
        toDate: "2024-06-30T23:59:59.000Z",
      }),
    );

    expect(result.statusCode).toBe(200);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input.KeyConditionExpression).toContain("BETWEEN");
    expect(command.input.ExpressionAttributeValues[":fromKey"]).toBe(
      "ADJUSTMENT#2024-06-01T00:00:00.000Z",
    );
    expect(command.input.ExpressionAttributeValues[":toKey"]).toBe(
      "ADJUSTMENT#2024-06-30T23:59:59.000Z",
    );
  });

  it("filters by fromDate only", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(
      makeEvent({ fromDate: "2024-06-01T00:00:00.000Z" }),
    );

    expect(result.statusCode).toBe(200);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input.KeyConditionExpression).toContain(">= :fromKey");
  });

  it("filters by toDate only", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(
      makeEvent({ toDate: "2024-06-30T23:59:59.000Z" }),
    );

    expect(result.statusCode).toBe(200);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input.KeyConditionExpression).toContain("<= :toKey");
  });

  it("combines multiple filters", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    } as never);

    const result = await listAdjustments(
      makeEvent({
        direction: "decrease",
        brand: "Nike",
        fromDate: "2024-06-01T00:00:00.000Z",
      }),
    );

    expect(result.statusCode).toBe(200);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input.FilterExpression).toContain("#brand = :brandVal");
    expect(command.input.FilterExpression).toContain(
      "#direction = :directionVal",
    );
    expect(command.input.KeyConditionExpression).toContain(">= :fromKey");
  });

  it("queries GSI1 in descending order (most recent first)", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    } as never);

    await listAdjustments(makeEvent());

    const command = mockedSend.mock.calls[0][0];
    expect(command.input.IndexName).toBe("GSI1");
    expect(command.input.ScanIndexForward).toBe(false);
  });

  // --- Error handling ---

  it("returns 500 on DynamoDB error", async () => {
    mockedSend.mockRejectedValueOnce(new Error("DynamoDB unavailable"));

    const result = await listAdjustments(makeEvent());

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("internal_error");
  });
});
