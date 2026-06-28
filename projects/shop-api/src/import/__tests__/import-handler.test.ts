import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockFetchFromConsignCloud = vi.hoisted(() => vi.fn());
const mockSyncToShopTable = vi.hoisted(() => vi.fn());

vi.mock("../fetch-from-consigncloud", () => ({
  fetchFromConsignCloud: mockFetchFromConsignCloud,
}));

vi.mock("../sync-to-shop-table", () => ({
  syncToShopTable: mockSyncToShopTable,
}));

import { handler } from "../../import-handler";

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

describe("import-handler routing", () => {
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
  });

  describe("POST /api/import/sync", () => {
    it("routes to syncToShopTable", async () => {
      const event = createEvent("POST", "/api/import/sync");
      mockSyncToShopTable.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify({ added: 5, updated: 2, skipped: 1, errored: 0 }),
      });

      const result = await handler(event);

      expect(mockSyncToShopTable).toHaveBeenCalledWith(event);
      expect(result).toEqual({
        statusCode: 200,
        body: JSON.stringify({ added: 5, updated: 2, skipped: 1, errored: 0 }),
      });
    });
  });

  describe("unknown route", () => {
    it("returns 404 for unrecognized paths", async () => {
      const event = createEvent("POST", "/api/import/unknown");

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 404,
        body: JSON.stringify({ message: "Not Found" }),
      });
      expect(mockFetchFromConsignCloud).not.toHaveBeenCalled();
      expect(mockSyncToShopTable).not.toHaveBeenCalled();
    });
  });

  describe("wrong HTTP method", () => {
    it("returns 405 for GET on /api/import/fetch", async () => {
      const event = createEvent("GET", "/api/import/fetch");

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
      });
      expect(mockFetchFromConsignCloud).not.toHaveBeenCalled();
    });

    it("returns 405 for PUT on /api/import/sync", async () => {
      const event = createEvent("PUT", "/api/import/sync");

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
      });
      expect(mockSyncToShopTable).not.toHaveBeenCalled();
    });
  });
});
