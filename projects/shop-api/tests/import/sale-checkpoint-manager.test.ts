import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  SaleFetchCheckpoint,
  SaleSyncCheckpoint,
} from "../../src/import/sale-checkpoint-manager";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDynamoDBClient {
    constructor() {}
  },
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: mockSend }),
  },
  PutCommand: class MockPutCommand {
    constructor(public input: unknown) {}
  },
  GetCommand: class MockGetCommand {
    constructor(public input: unknown) {}
  },
}));

describe("sale-checkpoint-manager", () => {
  let saveSaleFetchCheckpoint: typeof import("../../src/import/sale-checkpoint-manager").saveSaleFetchCheckpoint;
  let loadSaleFetchCheckpoint: typeof import("../../src/import/sale-checkpoint-manager").loadSaleFetchCheckpoint;
  let saveSaleSyncCheckpoint: typeof import("../../src/import/sale-checkpoint-manager").saveSaleSyncCheckpoint;
  let loadSaleSyncCheckpoint: typeof import("../../src/import/sale-checkpoint-manager").loadSaleSyncCheckpoint;

  beforeEach(async () => {
    vi.stubEnv("IMPORT_TABLE_NAME", "test-import-table");
    mockSend.mockReset();
    vi.resetModules();
    vi.useRealTimers();
    const mod = await import("../../src/import/sale-checkpoint-manager");
    saveSaleFetchCheckpoint = mod.saveSaleFetchCheckpoint;
    loadSaleFetchCheckpoint = mod.loadSaleFetchCheckpoint;
    saveSaleSyncCheckpoint = mod.saveSaleSyncCheckpoint;
    loadSaleSyncCheckpoint = mod.loadSaleSyncCheckpoint;
  });

  describe("fetch checkpoint save/load round trip", () => {
    it("saves fetch checkpoint with correct PutCommand item structure", async () => {
      mockSend.mockResolvedValue({});

      const checkpoint: SaleFetchCheckpoint = {
        jobId: "sale-job-001",
        cursor: "cursor-abc",
        progress: { processed: 50, imported: 40, skipped: 8, failed: 2 },
        lastUpdatedAt: "2026-06-01T10:00:00.000Z",
      };

      await saveSaleFetchCheckpoint(checkpoint);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const putCommand = mockSend.mock.calls[0][0];
      expect(putCommand.input.TableName).toBe("test-import-table");
      expect(putCommand.input.Item.PK).toBe("SALE_IMPORT#sale-job-001");
      expect(putCommand.input.Item.SK).toBe("CHECKPOINT");
      expect(putCommand.input.Item.jobId).toBe("sale-job-001");
      expect(putCommand.input.Item.cursor).toBe("cursor-abc");
      expect(putCommand.input.Item.progress).toEqual({
        processed: 50,
        imported: 40,
        skipped: 8,
        failed: 2,
      });
      expect(putCommand.input.Item.lastUpdatedAt).toBe(
        "2026-06-01T10:00:00.000Z",
      );
    });

    it("loads fetch checkpoint and returns correct data", async () => {
      mockSend.mockResolvedValue({
        Item: {
          PK: "SALE_IMPORT#sale-job-001",
          SK: "CHECKPOINT",
          jobId: "sale-job-001",
          cursor: "cursor-abc",
          progress: { processed: 50, imported: 40, skipped: 8, failed: 2 },
          lastUpdatedAt: "2026-06-01T10:00:00.000Z",
        },
      });

      const result = await loadSaleFetchCheckpoint("sale-job-001");

      expect(result).not.toBeNull();
      expect(result!.jobId).toBe("sale-job-001");
      expect(result!.cursor).toBe("cursor-abc");
      expect(result!.progress).toEqual({
        processed: 50,
        imported: 40,
        skipped: 8,
        failed: 2,
      });
      expect(result!.lastUpdatedAt).toBe("2026-06-01T10:00:00.000Z");
    });
  });

  describe("sync checkpoint save/load round trip", () => {
    it("saves sync checkpoint with correct PutCommand item structure", async () => {
      mockSend.mockResolvedValue({});

      const checkpoint: SaleSyncCheckpoint = {
        jobId: "sale-job-002",
        exclusiveStartKey: {
          PK: "IMPORT#CONSIGNCLOUD#SALE#s1",
          SK: "METADATA",
        },
        progress: { processed: 30, imported: 25, skipped: 3, failed: 2 },
        failures: [{ saleId: "sale-fail-1", error: "Mapping failed" }],
        lineItemsImported: 75,
        lastUpdatedAt: "2026-06-02T15:30:00.000Z",
      };

      await saveSaleSyncCheckpoint(checkpoint);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const putCommand = mockSend.mock.calls[0][0];
      expect(putCommand.input.TableName).toBe("test-import-table");
      expect(putCommand.input.Item.PK).toBe("SALE_IMPORT#sale-job-002");
      expect(putCommand.input.Item.SK).toBe("SYNC_CHECKPOINT");
      expect(putCommand.input.Item.jobId).toBe("sale-job-002");
      expect(putCommand.input.Item.exclusiveStartKey).toEqual({
        PK: "IMPORT#CONSIGNCLOUD#SALE#s1",
        SK: "METADATA",
      });
      expect(putCommand.input.Item.progress).toEqual({
        processed: 30,
        imported: 25,
        skipped: 3,
        failed: 2,
      });
      expect(putCommand.input.Item.failures).toEqual([
        { saleId: "sale-fail-1", error: "Mapping failed" },
      ]);
      expect(putCommand.input.Item.lineItemsImported).toBe(75);
      expect(putCommand.input.Item.lastUpdatedAt).toBe(
        "2026-06-02T15:30:00.000Z",
      );
    });

    it("loads sync checkpoint and returns correct data", async () => {
      mockSend.mockResolvedValue({
        Item: {
          PK: "SALE_IMPORT#sale-job-002",
          SK: "SYNC_CHECKPOINT",
          jobId: "sale-job-002",
          exclusiveStartKey: {
            PK: "IMPORT#CONSIGNCLOUD#SALE#s1",
            SK: "METADATA",
          },
          progress: { processed: 30, imported: 25, skipped: 3, failed: 2 },
          failures: [{ saleId: "sale-fail-1", error: "Mapping failed" }],
          lineItemsImported: 75,
          lastUpdatedAt: "2026-06-02T15:30:00.000Z",
        },
      });

      const result = await loadSaleSyncCheckpoint("sale-job-002");

      expect(result).not.toBeNull();
      expect(result!.jobId).toBe("sale-job-002");
      expect(result!.exclusiveStartKey).toEqual({
        PK: "IMPORT#CONSIGNCLOUD#SALE#s1",
        SK: "METADATA",
      });
      expect(result!.progress).toEqual({
        processed: 30,
        imported: 25,
        skipped: 3,
        failed: 2,
      });
      expect(result!.failures).toEqual([
        { saleId: "sale-fail-1", error: "Mapping failed" },
      ]);
      expect(result!.lineItemsImported).toBe(75);
      expect(result!.lastUpdatedAt).toBe("2026-06-02T15:30:00.000Z");
    });
  });

  describe("loadSaleFetchCheckpoint returns null for missing checkpoint", () => {
    it("returns null when no Item exists", async () => {
      mockSend.mockResolvedValue({});

      const result = await loadSaleFetchCheckpoint("non-existent-job");

      expect(result).toBeNull();

      const getCommand = mockSend.mock.calls[0][0];
      expect(getCommand.input.Key.PK).toBe("SALE_IMPORT#non-existent-job");
      expect(getCommand.input.Key.SK).toBe("CHECKPOINT");
    });
  });

  describe("loadSaleSyncCheckpoint returns null for missing sync checkpoint", () => {
    it("returns null when no Item exists", async () => {
      mockSend.mockResolvedValue({});

      const result = await loadSaleSyncCheckpoint("non-existent-sync-job");

      expect(result).toBeNull();

      const getCommand = mockSend.mock.calls[0][0];
      expect(getCommand.input.Key.PK).toBe("SALE_IMPORT#non-existent-sync-job");
      expect(getCommand.input.Key.SK).toBe("SYNC_CHECKPOINT");
    });
  });

  describe("failures list persisted correctly in sync checkpoint", () => {
    it("persists empty failures list", async () => {
      mockSend.mockResolvedValue({});

      const checkpoint: SaleSyncCheckpoint = {
        jobId: "sale-job-empty-failures",
        exclusiveStartKey: null,
        progress: { processed: 10, imported: 10, skipped: 0, failed: 0 },
        failures: [],
        lineItemsImported: 20,
        lastUpdatedAt: "2026-07-01T00:00:00.000Z",
      };

      await saveSaleSyncCheckpoint(checkpoint);

      const putCommand = mockSend.mock.calls[0][0];
      expect(putCommand.input.Item.failures).toEqual([]);
    });

    it("persists multiple failures", async () => {
      mockSend.mockResolvedValue({});

      const failures = [
        { saleId: "sale-a", error: "Mapping error: missing field" },
        { saleId: "sale-b", error: "Transaction write failed" },
        { saleId: "sale-c", error: "Number generation exhausted retries" },
      ];

      const checkpoint: SaleSyncCheckpoint = {
        jobId: "sale-job-multi-fail",
        exclusiveStartKey: {
          PK: "IMPORT#CONSIGNCLOUD#SALE#s5",
          SK: "METADATA",
        },
        progress: { processed: 20, imported: 15, skipped: 2, failed: 3 },
        failures,
        lineItemsImported: 45,
        lastUpdatedAt: "2026-07-02T12:00:00.000Z",
      };

      await saveSaleSyncCheckpoint(checkpoint);

      const putCommand = mockSend.mock.calls[0][0];
      expect(putCommand.input.Item.failures).toEqual(failures);
      expect(putCommand.input.Item.failures).toHaveLength(3);
    });
  });

  describe("PK and SK patterns", () => {
    it("fetch checkpoint uses PK SALE_IMPORT#<jobId> and SK CHECKPOINT", async () => {
      mockSend.mockResolvedValue({});

      await saveSaleFetchCheckpoint({
        jobId: "my-test-job-id",
        cursor: null,
        progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        lastUpdatedAt: "2026-01-01T00:00:00.000Z",
      });

      const putCommand = mockSend.mock.calls[0][0];
      expect(putCommand.input.Item.PK).toBe("SALE_IMPORT#my-test-job-id");
      expect(putCommand.input.Item.SK).toBe("CHECKPOINT");
    });

    it("fetch checkpoint load uses correct key pattern", async () => {
      mockSend.mockResolvedValue({});

      await loadSaleFetchCheckpoint("load-test-job");

      const getCommand = mockSend.mock.calls[0][0];
      expect(getCommand.input.Key.PK).toBe("SALE_IMPORT#load-test-job");
      expect(getCommand.input.Key.SK).toBe("CHECKPOINT");
    });

    it("sync checkpoint uses PK SALE_IMPORT#<jobId> and SK SYNC_CHECKPOINT", async () => {
      mockSend.mockResolvedValue({});

      await saveSaleSyncCheckpoint({
        jobId: "sync-test-job-id",
        exclusiveStartKey: null,
        progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        failures: [],
        lineItemsImported: 0,
        lastUpdatedAt: "2026-01-01T00:00:00.000Z",
      });

      const putCommand = mockSend.mock.calls[0][0];
      expect(putCommand.input.Item.PK).toBe("SALE_IMPORT#sync-test-job-id");
      expect(putCommand.input.Item.SK).toBe("SYNC_CHECKPOINT");
    });

    it("sync checkpoint load uses correct key pattern", async () => {
      mockSend.mockResolvedValue({});

      await loadSaleSyncCheckpoint("sync-load-test-job");

      const getCommand = mockSend.mock.calls[0][0];
      expect(getCommand.input.Key.PK).toBe("SALE_IMPORT#sync-load-test-job");
      expect(getCommand.input.Key.SK).toBe("SYNC_CHECKPOINT");
    });
  });
});
