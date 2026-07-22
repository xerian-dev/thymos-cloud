import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

vi.mock("../../src/dynamodb-client.js", () => ({
  docClient: { send: vi.fn() },
  TABLE_NAME: "test-table",
}));

import { listAccounts } from "../../src/routes/list-accounts.js";
import { docClient } from "../../src/dynamodb-client.js";
import { encodeCursor } from "../../src/cursor-utils.js";

const mockedSend = vi.mocked(docClient.send);

function makeEvent(
  queryStringParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/accounts",
    rawPath: "/api/accounts",
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
        path: "/api/accounts",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-1",
      routeKey: "GET /api/accounts",
      stage: "$default",
      time: "01/Jan/2024:00:00:00 +0000",
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    version: "2.0",
  };
}

describe("listAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no accounts exist", async () => {
    mockedSend.mockResolvedValueOnce({ Items: [] } as never);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body).toEqual({ accounts: [], nextCursor: null, hasMore: false });
  });

  it("maps Account_Item fields correctly including accountNumber parsing", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        {
          PK: "ACCOUNT#abc-uuid",
          SK: "METADATA",
          uuid: "abc-uuid",
          accountNumber: "0000042",
          name: "Jane Smith",
          street: "123 Main St",
          place: "Zurich",
          postcode: "8001",
          canton: "ZH",
          email: "jane@example.com",
          telephone: "555-0100",
          GSI1PK: "ACCOUNT",
          GSI1SK: "0000042",
        },
      ],
    } as never);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0]).toEqual({
      uuid: "abc-uuid",
      accountNumber: 42,
      name: "Jane Smith",
      street: "123 Main St",
      place: "Zurich",
      postcode: "8001",
      canton: "ZH",
      email: "jane@example.com",
      telephone: "555-0100",
      company: "",
      createdBy: null,
      commentCount: 0,
      tags: [],
    });
  });

  it("defaults optional fields to empty string when missing", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        {
          PK: "ACCOUNT#uuid-a",
          SK: "METADATA",
          uuid: "uuid-a",
          accountNumber: "0000001",
          name: "Account A",
          GSI1PK: "ACCOUNT",
          GSI1SK: "0000001",
        },
      ],
    } as never);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accounts[0]).toEqual({
      uuid: "uuid-a",
      accountNumber: 1,
      name: "Account A",
      street: "",
      place: "",
      postcode: "",
      canton: "",
      email: "",
      telephone: "",
      company: "",
      createdBy: null,
      commentCount: 0,
      tags: [],
    });
  });

  it("does not include address field in response", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        {
          PK: "ACCOUNT#uuid-b",
          SK: "METADATA",
          uuid: "uuid-b",
          accountNumber: "0000001",
          name: "Account B",
          address: "Old address field",
          street: "New St",
          place: "Bern",
          postcode: "3000",
          canton: "BE",
          email: "b@example.com",
          telephone: "079123456",
          GSI1PK: "ACCOUNT",
          GSI1SK: "0000001",
        },
      ],
    } as never);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accounts[0]).not.toHaveProperty("address");
    expect(body.accounts[0].street).toBe("New St");
  });

  it("returns nextCursor and hasMore when LastEvaluatedKey is present", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        {
          PK: "ACCOUNT#uuid-1",
          SK: "METADATA",
          uuid: "uuid-1",
          accountNumber: "0000001",
          name: "First",
          GSI1PK: "ACCOUNT",
          GSI1SK: "0000001",
        },
      ],
      LastEvaluatedKey: {
        PK: "ACCOUNT#uuid-1",
        SK: "METADATA",
        GSI1PK: "ACCOUNT",
        GSI1SK: "0000001",
      },
    } as never);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(body.nextCursor).not.toBeNull();
  });

  it("returns nextCursor=null and hasMore=false when no LastEvaluatedKey", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        {
          PK: "ACCOUNT#uuid-1",
          SK: "METADATA",
          uuid: "uuid-1",
          accountNumber: "0000001",
          name: "First",
          GSI1PK: "ACCOUNT",
          GSI1SK: "0000001",
        },
      ],
    } as never);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("passes decoded cursor as ExclusiveStartKey", async () => {
    const startKey = {
      PK: "ACCOUNT#uuid-1",
      SK: "METADATA",
      GSI1PK: "ACCOUNT",
      GSI1SK: "0000001",
    };
    const cursor = encodeCursor(startKey);

    mockedSend.mockResolvedValueOnce({
      Items: [
        {
          PK: "ACCOUNT#uuid-2",
          SK: "METADATA",
          uuid: "uuid-2",
          accountNumber: "0000002",
          name: "Second",
          GSI1PK: "ACCOUNT",
          GSI1SK: "0000002",
        },
      ],
    } as never);

    const result = await listAccounts(makeEvent({ cursor }));

    expect(result.statusCode).toBe(200);
    expect(mockedSend).toHaveBeenCalledTimes(1);
    const command = mockedSend.mock.calls[0][0];
    expect(command.input).toMatchObject({
      IndexName: "GSI1",
      ExclusiveStartKey: startKey,
    });
  });

  it("uses default pageSize=20 when not provided", async () => {
    mockedSend.mockResolvedValueOnce({ Items: [] } as never);

    await listAccounts(makeEvent());

    const command = mockedSend.mock.calls[0][0];
    expect(command.input).toMatchObject({ Limit: 20 });
  });

  it("uses specified pageSize", async () => {
    mockedSend.mockResolvedValueOnce({ Items: [] } as never);

    await listAccounts(makeEvent({ pageSize: "50" }));

    const command = mockedSend.mock.calls[0][0];
    expect(command.input).toMatchObject({ Limit: 50 });
  });

  it("queries GSI1 with correct parameters", async () => {
    mockedSend.mockResolvedValueOnce({ Items: [] } as never);

    await listAccounts(makeEvent());

    const command = mockedSend.mock.calls[0][0];
    expect(command.input).toMatchObject({
      TableName: "test-table",
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": "ACCOUNT" },
      ScanIndexForward: true,
      Limit: 20,
    });
  });

  it("returns 500 on DynamoDB error", async () => {
    mockedSend.mockRejectedValueOnce(new Error("DynamoDB unavailable"));

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body as string);
    expect(body).toEqual({ error: "internal_error" });
  });
});

describe("listAccounts - validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid pageSize", async () => {
    const result = await listAccounts(makeEvent({ pageSize: "25" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("pageSize must be one of 20, 50, 100");
  });

  it("returns 400 for invalid cursor", async () => {
    const result = await listAccounts(
      makeEvent({ cursor: "not-valid-base64!" }),
    );

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("Invalid cursor");
  });

  it("returns 400 when legacy pageIndex parameter is provided", async () => {
    const result = await listAccounts(makeEvent({ pageIndex: "0" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("Unsupported parameter: pageIndex");
  });

  it("returns 400 when legacy sortColumn parameter is provided", async () => {
    const result = await listAccounts(makeEvent({ sortColumn: "name" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("Unsupported parameter: sortColumn");
  });

  it("returns 400 when legacy sortDirection parameter is provided", async () => {
    const result = await listAccounts(makeEvent({ sortDirection: "asc" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("Unsupported parameter: sortDirection");
  });
});
