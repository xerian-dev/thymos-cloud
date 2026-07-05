import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/dynamodb-client.js", () => ({
  docClient: { send: vi.fn() },
  TABLE_NAME: "test-table",
}));

import { nextItemSku } from "../../src/routes/next-item-sku.js";
import { docClient } from "../../src/dynamodb-client.js";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockedSend = vi.mocked(docClient.send);

function makeEvent(): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/items/next-sku",
  } as APIGatewayProxyEventV2;
}

describe("GET /api/items/next-sku", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns value + 1 from existing counter", async () => {
    mockedSend.mockResolvedValueOnce({ Item: { value: 42 } } as never);

    const response = await nextItemSku(makeEvent());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ nextSku: 43 });
  });

  it("returns 1 when counter item does not exist", async () => {
    mockedSend.mockResolvedValueOnce({ Item: undefined } as never);

    const response = await nextItemSku(makeEvent());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ nextSku: 1 });
  });

  it("returns 500 on DynamoDB error", async () => {
    mockedSend.mockRejectedValueOnce(new Error("DynamoDB failure"));

    const response = await nextItemSku(makeEvent());

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "internal_error",
    });
  });
});
