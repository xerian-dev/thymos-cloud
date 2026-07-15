import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockFetchFromConsignCloud = vi.hoisted(() => vi.fn());
const mockSyncToShopTable = vi.hoisted(() => vi.fn());
const mockHandleScheduledSync = vi.hoisted(() => vi.fn());
const mockHandleResumeInternal = vi.hoisted(() => vi.fn());
const mockHandleSaleResumeInternal = vi.hoisted(() => vi.fn());

vi.mock("../import/fetch-from-consigncloud", () => ({
  fetchFromConsignCloud: mockFetchFromConsignCloud,
  fetchAccountsInternal: vi.fn(),
}));

vi.mock("../import/sync-to-shop-table", () => ({
  syncToShopTable: mockSyncToShopTable,
  syncAccountsInternal: vi.fn(),
}));

vi.mock("../import/sync-orchestrator", () => ({
  handleScheduledSync: mockHandleScheduledSync,
}));

vi.mock("../import/item-import-handler", () => ({
  handleItemImportStart: vi.fn(),
  handleItemImportSync: vi.fn(),
  handleItemImportResume: vi.fn(),
  handleItemImportStatus: vi.fn(),
  handleResumeInternal: mockHandleResumeInternal,
}));

vi.mock("../import/sale-import-handler", () => ({
  handleSaleImportStart: vi.fn(),
  handleSaleImportSync: vi.fn(),
  handleSaleImportResume: vi.fn(),
  handleSaleImportStatus: vi.fn(),
  handleSaleImportCancel: vi.fn(),
  handleSaleResumeInternal: mockHandleSaleResumeInternal,
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

  describe("scheduled-sync action", () => {
    it("routes { action: 'scheduled-sync' } event to handleScheduledSync", async () => {
      const event = {
        action: "scheduled-sync",
      } as unknown as APIGatewayProxyEventV2;
      const mockResult = {
        correlationId: "test-uuid",
        elapsedMs: 150,
        phases: {
          accounts: { status: "success" },
          items: { status: "success" },
          sales: { status: "success" },
        },
      };
      mockHandleScheduledSync.mockResolvedValueOnce(mockResult);

      const result = await handler(event);

      expect(mockHandleScheduledSync).toHaveBeenCalled();
      expect(result).toEqual({
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockResult),
      });
    });

    it("does not route to handleScheduledSync for regular API Gateway events", async () => {
      const event = createEvent("POST", "/api/import/fetch");
      mockFetchFromConsignCloud.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify({ status: "success" }),
      });

      await handler(event);

      expect(mockHandleScheduledSync).not.toHaveBeenCalled();
    });
  });

  describe("resume-internal action", () => {
    it("routes resume-internal with type=item to item handler", async () => {
      const event = {
        action: "resume-internal",
        jobId: "job-123",
        phase: "fetch",
        type: "item",
      } as unknown as APIGatewayProxyEventV2;
      mockHandleResumeInternal.mockResolvedValueOnce({ status: "resumed" });

      const result = await handler(event);

      expect(mockHandleResumeInternal).toHaveBeenCalledWith("job-123", "fetch");
      expect(result).toEqual({
        statusCode: 200,
        body: JSON.stringify({ status: "resumed" }),
      });
    });

    it("routes resume-internal with type=sale to sale handler", async () => {
      const event = {
        action: "resume-internal",
        jobId: "job-456",
        phase: "sync",
        type: "sale",
      } as unknown as APIGatewayProxyEventV2;
      mockHandleSaleResumeInternal.mockResolvedValueOnce({
        status: "resumed-sale",
      });

      const result = await handler(event);

      expect(mockHandleSaleResumeInternal).toHaveBeenCalledWith(
        "job-456",
        "sync",
      );
      expect(result).toEqual({
        statusCode: 200,
        body: JSON.stringify({ status: "resumed-sale" }),
      });
    });

    it("routes resume-internal without type to item handler by default", async () => {
      const event = {
        action: "resume-internal",
        jobId: "job-789",
        phase: "fetch",
      } as unknown as APIGatewayProxyEventV2;
      mockHandleResumeInternal.mockResolvedValueOnce({
        status: "resumed-default",
      });

      const result = await handler(event);

      expect(mockHandleResumeInternal).toHaveBeenCalledWith("job-789", "fetch");
      expect(mockHandleSaleResumeInternal).not.toHaveBeenCalled();
      expect(result).toEqual({
        statusCode: 200,
        body: JSON.stringify({ status: "resumed-default" }),
      });
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
