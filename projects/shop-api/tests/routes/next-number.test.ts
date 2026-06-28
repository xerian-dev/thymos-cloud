import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/dynamodb-client.js", () => ({
  docClient: { send: vi.fn() },
  TABLE_NAME: "test-table",
}));

import { nextNumber } from "../../src/routes/next-number.js";
import { docClient } from "../../src/dynamodb-client.js";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockedSend = vi.mocked(docClient.send);

function makeEvent(): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/accounts/next-number",
  } as APIGatewayProxyEventV2;
}

describe("GET /api/accounts/next-number", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns value + 1 from existing counter using 'value' attribute", async () => {
    mockedSend.mockResolvedValueOnce({ Item: { value: 42 } } as never);

    const response = await nextNumber(makeEvent());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ nextNumber: 43 });
  });

  it("returns nextValue + 1 from existing counter using legacy 'nextValue' attribute", async () => {
    mockedSend.mockResolvedValueOnce({ Item: { nextValue: 42 } } as never);

    const response = await nextNumber(makeEvent());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ nextNumber: 43 });
  });

  it("returns 1 when counter item does not exist", async () => {
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);

    const response = await nextNumber(makeEvent());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ nextNumber: 1 });
  });

  it("returns 500 on DynamoDB error", async () => {
    mockedSend.mockRejectedValueOnce(new Error("DynamoDB failure"));

    const response = await nextNumber(makeEvent());

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "internal_error",
    });
  });
});
