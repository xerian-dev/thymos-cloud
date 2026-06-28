import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockFetchFromConsignCloud = vi.hoisted(() => vi.fn());
const mockSyncToShopTable = vi.hoisted(() => vi.fn());

vi.mock("../import/fetch-from-consigncloud", () => ({
  fetchFromConsignCloud: mockFetchFromConsignCloud,
}));

vi.mock("../import/sync-to-shop-table", () => ({
  syncToShopTable: mockSyncToShopTable,
}));

import { handler } from "../import-handler";

beforeEach(() => {
  vi.clearAllMocks();
});

function createEvent(method: string, path: string): APIGatewayProxyEventV2 {
  return {
    rawPath: path,
    requestContext: {
      http: { method },
    },
  } as unknown as APIGatewayProxyEventV2;
}

describe("import-handler", () => {
  describe("POST /api/import/fetch", () => {
    it("routes to fetchFromConsignCloud", async () => {
      const event = createEvent("POST", "/api/import/fetch");
      mockFetchFromConsignCloud.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify({ status: "success" }),
      });

      const result = await handler(event);

      expect(mockFetchFromConsignCloud).toHaveBeenCalledWith(event);
      expect(result).toEqual({
        statusCode: 200,
        body: JSON.stringify({ status: "success" }),
      });
    });

    it("returns 405 for non-POST methods", async () => {
      const event = createEvent("GET", "/api/import/fetch");

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
      });
      expect(mockFetchFromConsignCloud).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/import/sync", () => {
    it("routes to syncToShopTable", async () => {
      const event = createEvent("POST", "/api/import/sync");
      mockSyncToShopTable.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify({ added: 1 }),
      });

      const result = await handler(event);

      expect(mockSyncToShopTable).toHaveBeenCalledWith(event);
      expect(result).toEqual({
        statusCode: 200,
        body: JSON.stringify({ added: 1 }),
      });
    });

    it("returns 405 for non-POST methods", async () => {
      const event = createEvent("PUT", "/api/import/sync");

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
      });
      expect(mockSyncToShopTable).not.toHaveBeenCalled();
    });
  });

  describe("unknown routes", () => {
    it("returns 404 for unknown paths", async () => {
      const event = createEvent("POST", "/api/import/unknown");

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 404,
        body: JSON.stringify({ message: "Not Found" }),
      });
    });

    it("returns 404 for root path", async () => {
      const event = createEvent("GET", "/");

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 404,
        body: JSON.stringify({ message: "Not Found" }),
      });
    });
  });
});
