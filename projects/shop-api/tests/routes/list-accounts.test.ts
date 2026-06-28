import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/dynamodb-client.js", () => ({
  docClient: { send: vi.fn() },
  TABLE_NAME: "test-table",
}));

import { listAccounts } from "../../src/routes/list-accounts.js";
import { docClient } from "../../src/dynamodb-client.js";

const mockedSend = vi.mocked(docClient.send);

function makeEvent(): import("aws-lambda").APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/accounts",
    rawPath: "/api/accounts",
    rawQueryString: "",
    headers: {},
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
    expect(body).toEqual({ accounts: [] });
  });

  it("maps Account_Item fields correctly including shopUid parsing", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        {
          PK: "ACCOUNT#0000042",
          SK: "METADATA",
          uuid: "uuid-123",
          name: "Jane Smith",
          street: "123 Main St",
          place: "Zurich",
          postcode: "8001",
          canton: "ZH",
          email: "jane@example.com",
          telephone: "555-0100",
        },
      ],
    } as never);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0]).toEqual({
      uuid: "uuid-123",
      shopUid: 42,
      name: "Jane Smith",
      street: "123 Main St",
      place: "Zurich",
      postcode: "8001",
      canton: "ZH",
      email: "jane@example.com",
      telephone: "555-0100",
      company: "",
      commentCount: 0,
      tags: [],
    });
  });

  it("defaults optional fields to empty string when missing", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        {
          PK: "ACCOUNT#0000001",
          SK: "METADATA",
          uuid: "uuid-a",
          name: "Account A",
        },
      ],
    } as never);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accounts[0]).toEqual({
      uuid: "uuid-a",
      shopUid: 1,
      name: "Account A",
      street: "",
      place: "",
      postcode: "",
      canton: "",
      email: "",
      telephone: "",
      company: "",
      commentCount: 0,
      tags: [],
    });
  });

  it("does not include address field in response", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        {
          PK: "ACCOUNT#0000001",
          SK: "METADATA",
          uuid: "uuid-b",
          name: "Account B",
          address: "Old address field",
          street: "New St",
          place: "Bern",
          postcode: "3000",
          canton: "BE",
          email: "b@example.com",
          telephone: "079123456",
        },
      ],
    } as never);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accounts[0]).not.toHaveProperty("address");
    expect(body.accounts[0].street).toBe("New St");
  });

  it("paginates through all scan results", async () => {
    mockedSend
      .mockResolvedValueOnce({
        Items: [
          {
            PK: "ACCOUNT#0000001",
            SK: "METADATA",
            uuid: "uuid-1",
            name: "First",
          },
        ],
        LastEvaluatedKey: { PK: "ACCOUNT#0000001", SK: "METADATA" },
      } as never)
      .mockResolvedValueOnce({
        Items: [
          {
            PK: "ACCOUNT#0000002",
            SK: "METADATA",
            uuid: "uuid-2",
            name: "Second",
          },
        ],
      } as never);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accounts).toHaveLength(2);
  });

  it("returns 500 on DynamoDB error", async () => {
    mockedSend.mockRejectedValueOnce(new Error("DynamoDB unavailable"));

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body as string);
    expect(body).toEqual({ error: "internal_error" });
  });
});
