import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

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
    mockedSend.mockImplementation(((cmd: unknown) => {
      const command = cmd as { input: Record<string, unknown> };
      // Scan for accounts
      if ("FilterExpression" in command.input) {
        return Promise.resolve({
          Items: [
            {
              PK: "ACCOUNT#0000042",
              SK: "METADATA",
              uuid: "uuid-123",
              name: "Jane Smith",
              address: "123 Main St",
              telephone: "555-0100",
            },
          ],
        });
      }
      // Query for comments (COUNT)
      const keyExpr = command.input.KeyConditionExpression as string;
      const exprValues = command.input.ExpressionAttributeValues as Record<
        string,
        string
      >;
      if (keyExpr && exprValues[":prefix"] === "COMMENT#") {
        return Promise.resolve({ Count: 5 });
      }
      // Query for tags
      if (keyExpr && exprValues[":prefix"] === "TAG#") {
        return Promise.resolve({
          Items: [{ label: "vip" }, { label: "wholesale" }],
        });
      }
      return Promise.resolve({});
    }) as typeof mockedSend);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0]).toEqual({
      uuid: "uuid-123",
      shopUid: 42,
      name: "Jane Smith",
      address: "123 Main St",
      telephone: "555-0100",
      commentCount: 5,
      tags: ["vip", "wholesale"],
    });
  });

  it("includes correct commentCount and tags", async () => {
    mockedSend.mockImplementation(((cmd: unknown) => {
      const command = cmd as { input: Record<string, unknown> };
      if ("FilterExpression" in command.input) {
        return Promise.resolve({
          Items: [
            {
              PK: "ACCOUNT#0000001",
              SK: "METADATA",
              uuid: "uuid-a",
              name: "Account A",
              address: "",
              telephone: "",
            },
          ],
        });
      }
      const exprValues = command.input.ExpressionAttributeValues as Record<
        string,
        string
      >;
      if (exprValues[":prefix"] === "COMMENT#") {
        return Promise.resolve({ Count: 0 });
      }
      if (exprValues[":prefix"] === "TAG#") {
        return Promise.resolve({ Items: [] });
      }
      return Promise.resolve({});
    }) as typeof mockedSend);

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accounts[0].commentCount).toBe(0);
    expect(body.accounts[0].tags).toEqual([]);
  });

  it("returns 500 on DynamoDB error", async () => {
    mockedSend.mockRejectedValueOnce(new Error("DynamoDB unavailable"));

    const result = await listAccounts(makeEvent());

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body as string);
    expect(body).toEqual({ error: "internal_error" });
  });
});

describe("Feature: accounts-api-backend, Property 9: Comment count aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commentCount equals number of COMMENT# items for any N", () => {
    /** Validates: Requirements 10.1, 10.3 */
    return fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100 }),
        async (commentCount) => {
          mockedSend.mockImplementation(((cmd: unknown) => {
            const command = cmd as { input: Record<string, unknown> };
            if ("FilterExpression" in command.input) {
              return Promise.resolve({
                Items: [
                  {
                    PK: "ACCOUNT#0000001",
                    SK: "METADATA",
                    uuid: "uuid-prop9",
                    name: "Prop Test",
                    address: "addr",
                    telephone: "tel",
                  },
                ],
              });
            }
            const exprValues = command.input
              .ExpressionAttributeValues as Record<string, string>;
            if (exprValues[":prefix"] === "COMMENT#") {
              return Promise.resolve({ Count: commentCount });
            }
            if (exprValues[":prefix"] === "TAG#") {
              return Promise.resolve({ Items: [] });
            }
            return Promise.resolve({});
          }) as typeof mockedSend);

          const result = await listAccounts(makeEvent());
          const body = JSON.parse(result.body as string);

          expect(body.accounts[0].commentCount).toBe(commentCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: accounts-api-backend, Property 10: Tag extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tags array matches tag item labels exactly", () => {
    /** Validates: Requirements 10.2, 10.4 */
    return fc.assert(
      fc.asyncProperty(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0),
          { minLength: 0, maxLength: 10 },
        ),
        async (tagLabels) => {
          const tagItems = tagLabels.map((label) => ({ label }));

          mockedSend.mockImplementation(((cmd: unknown) => {
            const command = cmd as { input: Record<string, unknown> };
            if ("FilterExpression" in command.input) {
              return Promise.resolve({
                Items: [
                  {
                    PK: "ACCOUNT#0000001",
                    SK: "METADATA",
                    uuid: "uuid-prop10",
                    name: "Prop Test",
                    address: "addr",
                    telephone: "tel",
                  },
                ],
              });
            }
            const exprValues = command.input
              .ExpressionAttributeValues as Record<string, string>;
            if (exprValues[":prefix"] === "COMMENT#") {
              return Promise.resolve({ Count: 0 });
            }
            if (exprValues[":prefix"] === "TAG#") {
              return Promise.resolve({ Items: tagItems });
            }
            return Promise.resolve({});
          }) as typeof mockedSend);

          const result = await listAccounts(makeEvent());
          const body = JSON.parse(result.body as string);

          expect(body.accounts[0].tags).toEqual(tagLabels);
          expect(body.accounts[0].tags.length).toBe(tagLabels.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
