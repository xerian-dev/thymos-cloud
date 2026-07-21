import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.IMPORT_TABLE_NAME = "test-import-table";
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = mockSend;
  },
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
  PutCommand: class {
    constructor(public input: unknown) {}
  },
  GetCommand: class {
    constructor(public input: unknown) {}
  },
  ScanCommand: class {
    constructor(public input: unknown) {}
  },
  UpdateCommand: class {
    constructor(public input: unknown) {}
  },
  BatchWriteCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteCommand: class {
    constructor(public input: unknown) {}
  },
  QueryCommand: class {
    constructor(public input: unknown) {}
  },
  TransactWriteCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-1234" });

vi.mock("../generic-consigncloud-client", () => ({
  fetchWithRetry: vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ data: [], next_cursor: null }),
  }),
}));

describe("Backward Compatibility - Migrated Modules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  describe("job-manager.ts (Item Import)", () => {
    it("exports createJob, getJob, getRunningOrPausedJob, transitionJob, updateJobPhase", async () => {
      const jobManager = await import("../job-manager");

      expect(typeof jobManager.createJob).toBe("function");
      expect(typeof jobManager.getJob).toBe("function");
      expect(typeof jobManager.getRunningOrPausedJob).toBe("function");
      expect(typeof jobManager.transitionJob).toBe("function");
      expect(typeof jobManager.updateJobPhase).toBe("function");
    });

    it("uses ITEM_IMPORT prefix in DynamoDB PK", async () => {
      mockSend.mockResolvedValueOnce({});

      const { createJob } = await import("../job-manager");
      await createJob({});

      const call = mockSend.mock.calls[0][0];
      // TransactWriteCommand: first item is the metadata record
      const metadataItem = call.input.TransactItems[0].Put.Item;
      expect(metadataItem.PK).toMatch(/^ITEM_IMPORT#/);
      expect(metadataItem.SK).toBe("METADATA");
    });
  });

  describe("sale-job-manager.ts (Sale Import)", () => {
    it("exports createSaleJob, getSaleJob, getRunningSaleJob, transitionSaleJob, updateSaleJobPhase", async () => {
      const saleJobManager = await import("../sale-job-manager");

      expect(typeof saleJobManager.createSaleJob).toBe("function");
      expect(typeof saleJobManager.getSaleJob).toBe("function");
      expect(typeof saleJobManager.getRunningSaleJob).toBe("function");
      expect(typeof saleJobManager.transitionSaleJob).toBe("function");
      expect(typeof saleJobManager.updateSaleJobPhase).toBe("function");
    });

    it("uses SALE_IMPORT prefix in DynamoDB PK", async () => {
      mockSend.mockResolvedValueOnce({});

      const { createSaleJob } = await import("../sale-job-manager");
      await createSaleJob({});

      const call = mockSend.mock.calls[0][0];
      // TransactWriteCommand: first item is the metadata record
      const metadataItem = call.input.TransactItems[0].Put.Item;
      expect(metadataItem.PK).toMatch(/^SALE_IMPORT#/);
      expect(metadataItem.SK).toBe("METADATA");
    });
  });

  describe("checkpoint-manager.ts (Item Import)", () => {
    it("exports saveCheckpoint and loadCheckpoint", async () => {
      const checkpointManager = await import("../checkpoint-manager");

      expect(typeof checkpointManager.saveCheckpoint).toBe("function");
      expect(typeof checkpointManager.loadCheckpoint).toBe("function");
    });

    it("uses ITEM_IMPORT prefix in DynamoDB PK", async () => {
      mockSend.mockResolvedValueOnce({});

      const { saveCheckpoint } = await import("../checkpoint-manager");
      await saveCheckpoint({
        jobId: "test-job-123",
        cursor: "next-page",
        progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
        lastUpdatedAt: "2025-01-15T10:00:00.000Z",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.input.Item.PK).toBe("ITEM_IMPORT#test-job-123");
      expect(call.input.Item.SK).toBe("CHECKPOINT");
    });
  });

  describe("sale-checkpoint-manager.ts (Sale Import)", () => {
    it("exports saveSaleFetchCheckpoint, loadSaleFetchCheckpoint, saveSaleSyncCheckpoint, loadSaleSyncCheckpoint", async () => {
      const saleCheckpointManager = await import("../sale-checkpoint-manager");

      expect(typeof saleCheckpointManager.saveSaleFetchCheckpoint).toBe(
        "function",
      );
      expect(typeof saleCheckpointManager.loadSaleFetchCheckpoint).toBe(
        "function",
      );
      expect(typeof saleCheckpointManager.saveSaleSyncCheckpoint).toBe(
        "function",
      );
      expect(typeof saleCheckpointManager.loadSaleSyncCheckpoint).toBe(
        "function",
      );
    });

    it("uses SALE_IMPORT prefix for fetch checkpoints", async () => {
      mockSend.mockResolvedValueOnce({});

      const { saveSaleFetchCheckpoint } =
        await import("../sale-checkpoint-manager");
      await saveSaleFetchCheckpoint({
        jobId: "test-sale-job-456",
        cursor: "sale-cursor",
        progress: { processed: 5, imported: 4, skipped: 1, failed: 0 },
        lastUpdatedAt: "2025-01-15T11:00:00.000Z",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.input.Item.PK).toBe("SALE_IMPORT#test-sale-job-456");
      expect(call.input.Item.SK).toBe("CHECKPOINT");
    });
  });

  describe("item-consigncloud-client.ts (Item Import)", () => {
    it("exports fetchItemPage", async () => {
      const itemClient = await import("../item-consigncloud-client");

      expect(typeof itemClient.fetchItemPage).toBe("function");
    });

    it("fetchItemPage has correct function signature (config, cursor, limit)", async () => {
      const { fetchItemPage } = await import("../item-consigncloud-client");

      // Verify function accepts 3 arguments
      expect(fetchItemPage.length).toBe(3);
    });
  });

  describe("sale-consigncloud-client.ts (Sale Import)", () => {
    it("exports fetchSalePage and fetchSaleLineItems", async () => {
      const saleClient = await import("../sale-consigncloud-client");

      expect(typeof saleClient.fetchSalePage).toBe("function");
      expect(typeof saleClient.fetchSaleLineItems).toBe("function");
    });
  });
});
