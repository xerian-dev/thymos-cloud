import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("../dynamodb-client", () => ({
  docClient: { send: mockSend },
  TABLE_NAME: "test-table",
}));

import { routeRequest } from "../router";

function buildEvent(
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/employees",
    rawPath: "/api/employees",
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

describe("routeRequest — GET /api/employees", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("dispatches GET /api/employees to listEmployees handler", async () => {
    mockSend.mockResolvedValue({ Items: [], Count: 0 });

    const event = buildEvent();
    const result = await routeRequest(event);

    expect(result).toEqual({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employees: [], nextCursor: null, hasMore: false }),
    });
  });

  it("returns 404 for an unknown route key", async () => {
    const event = buildEvent({ routeKey: "GET /api/nonexistent" });
    const result = await routeRequest(event);

    expect(result).toEqual({
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "not_found" }),
    });
  });
});
