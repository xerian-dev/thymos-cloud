import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("../dynamodb-client", () => ({
  docClient: { send: mockSend },
  TABLE_NAME: "test-table",
}));

import { listSales } from "../routes/list-sales";
import { nextSaleNumber } from "../routes/next-sale-number";
import { createSale } from "../routes/create-sale";
import { updateSale } from "../routes/update-sale";
import { deleteSale } from "../routes/delete-sale";

function buildEvent(
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/sales",
    rawPath: "/api/sales",
    rawQueryString: "",
    headers: {},
    queryStringParameters: null,
    isBase64Encoded: false,
    requestContext: {} as unknown,
    body: null,
    pathParameters: null,
    stageVariables: null,
    version: "2.0",
    ...overrides,
  } as unknown as APIGatewayProxyEventV2;
}

describe("listSales", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("uses default page size of 20 when no pageSize param provided", async () => {
    mockSend.mockResolvedValue({ Items: [], Count: 0 });

    const event = buildEvent({ queryStringParameters: undefined });
    await listSales(event);

    expect(mockSend).toHaveBeenCalledOnce();
    const command = mockSend.mock.calls[0][0];
    expect(command.input.Limit).toBe(20);
  });
});

describe("updateSale", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns 400 missing_uuid when no UUID path parameter provided", async () => {
    const event = buildEvent({
      routeKey: "PUT /api/sales/{uuid}",
      rawPath: "/api/sales/",
      pathParameters: undefined,
      body: JSON.stringify({ status: "open" }),
    });

    const result = (await updateSale(
      event,
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("missing_uuid");
  });

  it("returns 400 invalid_json when body is not valid JSON", async () => {
    const event = buildEvent({
      routeKey: "PUT /api/sales/{uuid}",
      rawPath: "/api/sales/abc-123",
      pathParameters: { uuid: "abc-123" },
      body: "{",
    });

    const result = (await updateSale(
      event,
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("invalid_json");
  });
});

describe("deleteSale", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns 400 missing_uuid when no UUID path parameter provided", async () => {
    const event = buildEvent({
      routeKey: "DELETE /api/sales/{uuid}",
      rawPath: "/api/sales/",
      pathParameters: undefined,
    });

    const result = (await deleteSale(
      event,
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("missing_uuid");
  });

  it("returns 204 and removes all records including line items", async () => {
    const uuid = "test-uuid-delete";
    const pk = `SALE#${uuid}`;

    // First call: GetCommand - sale exists
    mockSend.mockResolvedValueOnce({
      Item: { PK: pk, SK: "METADATA" },
    });

    // Second call: QueryCommand - returns METADATA + 2 LINE_ITEM records
    mockSend.mockResolvedValueOnce({
      Items: [
        { PK: pk, SK: "METADATA" },
        { PK: pk, SK: "LINE_ITEM#001" },
        { PK: pk, SK: "LINE_ITEM#002" },
      ],
    });

    // Third call: BatchWriteCommand - success
    mockSend.mockResolvedValueOnce({});

    const event = buildEvent({
      routeKey: "DELETE /api/sales/{uuid}",
      rawPath: `/api/sales/${uuid}`,
      pathParameters: { uuid },
    });

    const result = (await deleteSale(
      event,
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(204);

    // Verify BatchWriteCommand was called with all 3 items
    expect(mockSend).toHaveBeenCalledTimes(3);
    const batchCommand = mockSend.mock.calls[2][0];
    const requests = batchCommand.input.RequestItems["test-table"];
    expect(requests).toHaveLength(3);
    expect(requests).toEqual(
      expect.arrayContaining([
        { DeleteRequest: { Key: { PK: pk, SK: "METADATA" } } },
        { DeleteRequest: { Key: { PK: pk, SK: "LINE_ITEM#001" } } },
        { DeleteRequest: { Key: { PK: pk, SK: "LINE_ITEM#002" } } },
      ]),
    );
  });
});

describe("createSale", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns 400 invalid_json when body is not valid JSON", async () => {
    const event = buildEvent({
      routeKey: "POST /api/sales",
      rawPath: "/api/sales",
      body: "not json",
    });

    const result = (await createSale(
      event,
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("invalid_json");
  });
});

describe("nextSaleNumber", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns nextNumber = 1 when counter record does not exist", async () => {
    mockSend.mockResolvedValue({ Item: undefined });

    const event = buildEvent({
      routeKey: "GET /api/sales/next-number",
      rawPath: "/api/sales/next-number",
    });

    const result = (await nextSaleNumber(
      event,
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.nextNumber).toBe(1);
  });
});
