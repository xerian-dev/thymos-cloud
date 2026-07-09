import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock setup ────────────────────────────────────────────────────────────────

const mockDocClientSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDynamoDBClient {
    constructor() {}
  },
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: mockDocClientSend }),
  },
  PutCommand: class MockPutCommand {
    constructor(public input: unknown) {}
  },
  QueryCommand: class MockQueryCommand {
    constructor(public input: unknown) {}
  },
  GetCommand: class MockGetCommand {
    constructor(public input: unknown) {}
  },
  UpdateCommand: class MockUpdateCommand {
    constructor(public input: unknown) {}
  },
  TransactWriteCommand: class MockTransactWriteCommand {
    constructor(public input: unknown) {}
  },
  ScanCommand: class MockScanCommand {
    constructor(public input: unknown) {}
  },
}));

const mockFetchItemPage = vi.fn();
vi.mock("../../src/import/item-consigncloud-client", () => ({
  fetchItemPage: (...args: unknown[]) => mockFetchItemPage(...args),
}));

const mockSaveCheckpoint = vi.fn();
const mockLoadCheckpoint = vi.fn();
vi.mock("../../src/import/checkpoint-manager", () => ({
  saveCheckpoint: (...args: unknown[]) => mockSaveCheckpoint(...args),
  loadCheckpoint: (...args: unknown[]) => mockLoadCheckpoint(...args),
}));

const mockGetJob = vi.fn();
const mockTransitionJob = vi.fn();
vi.mock("../../src/import/job-manager", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  transitionJob: (...args: unknown[]) => mockTransitionJob(...args),
}));

const mockInvokeSelf = vi.fn();
vi.mock("../../src/import/self-invoker", () => ({
  invokeSelf: (...args: unknown[]) => mockInvokeSelf(...args),
}));

vi.mock("../../src/dynamodb-client", () => ({
  docClient: { send: (...args: unknown[]) => mockDocClientSend(...args) },
  TABLE_NAME: "test-shop-table",
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeConsignCloudItem(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    title: "Test Item",
    tag_price: 2999,
    quantity: 1,
    split: 0.6,
    account_id: "cc-account-001",
    account: { id: "cc-account-001", number: "1001" },
    category: { name: "Clothing" },
    tags: ["vintage"],
    description: "A test item",
    brand: "TestBrand",
    color: "Red",
    size: "M",
    shelf: { name: "A1" },
    location: null,
    tax_exempt: false,
    images: [{ url: "https://img.example.com/1.jpg" }],
    created: "2026-02-01T00:00:00.000Z",
    deleted: null,
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "test-job-123",
    state: "running",
    startedAt: "2026-01-01T00:00:00.000Z",
    lastUpdatedAt: "2026-01-01T00:00:00.000Z",
    filterParams: {},
    progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
    ...overrides,
  };
}

/** Tracks PutCommand calls to the shop table */
function getShopTablePutCalls(): Array<{
  input: {
    TableName: string;
    Item: Record<string, unknown>;
    ConditionExpression?: string;
  };
}> {
  return mockDocClientSend.mock.calls
    .map(
      (call: unknown[]) =>
        call[0] as {
          input: { TableName?: string; Item?: Record<string, unknown> };
        },
    )
    .filter(
      (cmd) =>
        cmd.input.TableName === "test-shop-table" && cmd.input.Item != null,
    ) as Array<{
    input: {
      TableName: string;
      Item: Record<string, unknown>;
      ConditionExpression?: string;
    };
  }>;
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe("Item Import Integration Tests", () => {
  let runImportLoop: typeof import("../../src/import/item-import-orchestrator").runImportLoop;

  beforeEach(async () => {
    vi.stubEnv("TABLE_NAME", "test-shop-table");
    vi.stubEnv("IMPORT_TABLE_NAME", "test-import-table");
    mockDocClientSend.mockReset();
    mockFetchItemPage.mockReset();
    mockSaveCheckpoint.mockReset();
    mockLoadCheckpoint.mockReset();
    mockGetJob.mockReset();
    mockTransitionJob.mockReset();
    mockInvokeSelf.mockReset();
    vi.resetModules();

    const mod = await import("../../src/import/item-import-orchestrator");
    runImportLoop = mod.runImportLoop;
  });

  describe("multi-page processing", () => {
    it("processes all pages when API returns 3 pages with cursors", async () => {
      const items1 = [
        makeConsignCloudItem({ id: "item-1", account_id: "acc-1" }),
      ];
      const items2 = [
        makeConsignCloudItem({ id: "item-2", account_id: "acc-1" }),
      ];
      const items3 = [
        makeConsignCloudItem({ id: "item-3", account_id: "acc-1" }),
      ];

      mockFetchItemPage
        .mockResolvedValueOnce({ items: items1, nextCursor: "cursor-2" })
        .mockResolvedValueOnce({ items: items2, nextCursor: "cursor-3" })
        .mockResolvedValueOnce({ items: items3, nextCursor: null });

      mockGetJob.mockResolvedValue(makeJob());
      mockLoadCheckpoint.mockResolvedValue(null);
      mockSaveCheckpoint.mockResolvedValue(undefined);
      mockTransitionJob.mockResolvedValue(undefined);

      // Mock sourceId dedup check — no existing items
      // Mock account resolution — return internal UUID
      // Mock SKU counter — return sequential values
      let skuCounter = 0;
      mockDocClientSend.mockImplementation(
        (cmd: { input: Record<string, unknown> }) => {
          const input = cmd.input as Record<string, unknown>;

          // GSI1 query (account resolution by number)
          if (input.IndexName === "GSI1") {
            return Promise.resolve({
              Items: [{ uuid: "internal-account-uuid" }],
            });
          }

          // sourceId-index query (dedup check — no match)
          if (input.IndexName === "sourceId-index") {
            return Promise.resolve({ Items: [] });
          }

          // SKU counter read
          if (
            input.Key &&
            (input.Key as Record<string, string>).PK === "SEQUENCE#ITEM"
          ) {
            return Promise.resolve({ Item: { value: skuCounter } });
          }

          // TransactWrite for SKU increment
          if (input.TransactItems) {
            skuCounter++;
            return Promise.resolve({});
          }

          // PutCommand for item write (shop table)
          if (input.TableName === "test-shop-table" && input.Item) {
            return Promise.resolve({});
          }

          // PutCommand for report (import table)
          if (input.TableName === "test-import-table" && input.Item) {
            return Promise.resolve({});
          }

          return Promise.resolve({});
        },
      );

      await runImportLoop({
        jobId: "test-job-123",
        apiKey: "test-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      // Verify all 3 pages were fetched
      expect(mockFetchItemPage).toHaveBeenCalledTimes(3);
      expect(mockFetchItemPage.mock.calls[0][1]).toBeNull(); // first page cursor
      expect(mockFetchItemPage.mock.calls[1][1]).toBe("cursor-2");
      expect(mockFetchItemPage.mock.calls[2][1]).toBe("cursor-3");

      // Job transitioned to complete
      expect(mockTransitionJob).toHaveBeenCalledWith(
        "test-job-123",
        "complete",
        expect.objectContaining({ imported: 3, processed: 3 }),
      );
    });
  });

  describe("item record structure", () => {
    it("writes correct DynamoDB record with PK, SK, GSI keys, and all fields", async () => {
      const testItem = makeConsignCloudItem({
        id: "source-item-uuid",
        title: "Vintage Jacket",
        tag_price: 4999,
        quantity: 2,
        split: 0.7,
        account: { id: "cc-acc-100", number: "100" },
        category: { name: "Outerwear" },
        tags: ["vintage", "leather"],
        description: "A fine leather jacket",
        brand: "LeatherCo",
        color: "Brown",
        size: "L",
        shelf: { name: "B3" },
        tax_exempt: true,
        images: [{ url: "https://img.example.com/jacket.jpg" }],
      });

      mockFetchItemPage.mockResolvedValueOnce({
        items: [testItem],
        nextCursor: null,
      });
      mockGetJob.mockResolvedValue(makeJob());
      mockLoadCheckpoint.mockResolvedValue(null);
      mockSaveCheckpoint.mockResolvedValue(undefined);
      mockTransitionJob.mockResolvedValue(undefined);

      mockDocClientSend.mockImplementation(
        (cmd: { input: Record<string, unknown> }) => {
          const input = cmd.input as Record<string, unknown>;

          // Account resolution
          if (
            input.IndexName === "GSI1" &&
            input.ProjectionExpression === "#uuid"
          ) {
            return Promise.resolve({
              Items: [{ uuid: "resolved-account-uuid" }],
            });
          }
          // Item dedup check
          if (input.IndexName === "sourceId-index") {
            return Promise.resolve({ Items: [] });
          }
          // SKU counter read
          if (
            input.Key &&
            (input.Key as Record<string, string>).PK === "SEQUENCE#ITEM"
          ) {
            return Promise.resolve({ Item: { value: 41 } });
          }
          // TransactWrite for SKU
          if (input.TransactItems) {
            return Promise.resolve({});
          }
          // Everything else (PutCommand for item/report)
          return Promise.resolve({});
        },
      );

      await runImportLoop({
        jobId: "test-job-123",
        apiKey: "test-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      // Find the PutCommand call that wrote the item to the shop table
      const shopPuts = getShopTablePutCalls();
      expect(shopPuts.length).toBeGreaterThanOrEqual(1);

      const itemRecord = shopPuts[0].input.Item;

      // Key structure
      expect(itemRecord.PK).toMatch(/^ITEM#[0-9a-f-]+$/);
      expect(itemRecord.SK).toBe("METADATA");
      expect(itemRecord.GSI1PK).toBe("ITEMS");
      expect(itemRecord.GSI1SK).toBe("ITEM#0000042"); // SKU 42 (41 + 1)

      // Content fields
      expect(itemRecord.sourceId).toBe("source-item-uuid");
      expect(itemRecord.accountId).toBe("resolved-account-uuid");
      expect(itemRecord.title).toBe("Vintage Jacket");
      expect(itemRecord.tagPrice).toBe(49.99);
      expect(itemRecord.quantity).toBe(2);
      expect(itemRecord.split).toBe(70);
      expect(itemRecord.inventoryType).toBe("Consignment");
      expect(itemRecord.terms).toBe("Donate");
      expect(itemRecord.taxExempt).toBe(true);
      expect(itemRecord.brand).toBe("LeatherCo");
      expect(itemRecord.color).toBe("Brown");
      expect(itemRecord.size).toBe("L");
      expect(itemRecord.shelf).toBe("B3");
      expect(itemRecord.tags).toEqual(["vintage", "leather"]);
      expect(itemRecord.imageKeys).toEqual([
        "https://img.example.com/jacket.jpg",
      ]);
      expect(itemRecord.description).toBe("A fine leather jacket");
      expect(itemRecord.createdAt).toBeDefined();
      expect(itemRecord.updatedAt).toBeDefined();

      // Conditional expression for dedup
      expect(shopPuts[0].input.ConditionExpression).toBe(
        "attribute_not_exists(PK)",
      );
    });
  });

  describe("conditional expression prevents duplicates", () => {
    it("counts item as skipped when ConditionalCheckFailedException is thrown", async () => {
      const items = [
        makeConsignCloudItem({ id: "dup-item", account_id: "acc-1" }),
        makeConsignCloudItem({ id: "new-item", account_id: "acc-1" }),
      ];

      mockFetchItemPage.mockResolvedValueOnce({ items, nextCursor: null });
      mockGetJob.mockResolvedValue(makeJob());
      mockLoadCheckpoint.mockResolvedValue(null);
      mockSaveCheckpoint.mockResolvedValue(undefined);
      mockTransitionJob.mockResolvedValue(undefined);

      let putCallCount = 0;
      mockDocClientSend.mockImplementation(
        (cmd: { input: Record<string, unknown> }) => {
          const input = cmd.input as Record<string, unknown>;

          // Account resolution
          if (
            input.IndexName === "GSI1" &&
            input.ProjectionExpression === "#uuid"
          ) {
            return Promise.resolve({ Items: [{ uuid: "internal-uuid" }] });
          }
          // Item dedup check (query by sourceId) — no existing items
          if (input.IndexName === "sourceId-index") {
            return Promise.resolve({ Items: [] });
          }
          // SKU counter
          if (
            input.Key &&
            (input.Key as Record<string, string>).PK === "SEQUENCE#ITEM"
          ) {
            return Promise.resolve({ Item: { value: putCallCount } });
          }
          // SKU increment
          if (input.TransactItems) {
            putCallCount++;
            return Promise.resolve({});
          }
          // Item write — first one throws ConditionalCheckFailedException
          if (input.TableName === "test-shop-table" && input.Item) {
            if (
              (input.Item as Record<string, string>).sourceId === "dup-item"
            ) {
              const error = new Error("The conditional request failed");
              error.name = "ConditionalCheckFailedException";
              return Promise.reject(error);
            }
            return Promise.resolve({});
          }
          return Promise.resolve({});
        },
      );

      await runImportLoop({
        jobId: "test-job-123",
        apiKey: "test-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      // Job completed with 1 skipped (dup) and 1 imported
      expect(mockTransitionJob).toHaveBeenCalledWith(
        "test-job-123",
        "complete",
        expect.objectContaining({
          processed: 2,
          imported: 1,
          skipped: 1,
          failed: 0,
        }),
      );
    });
  });

  describe("checkpoint save/load round trip", () => {
    it("saves checkpoint after each page with correct cursor and cumulative progress", async () => {
      const page1Items = [
        makeConsignCloudItem({ id: "p1-item-1", account_id: "acc-1" }),
        makeConsignCloudItem({ id: "p1-item-2", account_id: "acc-1" }),
      ];
      const page2Items = [
        makeConsignCloudItem({ id: "p2-item-1", account_id: "acc-1" }),
      ];

      mockFetchItemPage
        .mockResolvedValueOnce({
          items: page1Items,
          nextCursor: "cursor-after-p1",
        })
        .mockResolvedValueOnce({ items: page2Items, nextCursor: null });

      mockGetJob.mockResolvedValue(makeJob());
      mockLoadCheckpoint.mockResolvedValue(null);
      mockTransitionJob.mockResolvedValue(undefined);

      // Capture checkpoint snapshots at call time (progress is mutated in-place by the orchestrator)
      const checkpointSnapshots: Array<{
        jobId: string;
        cursor: string | null;
        progress: {
          processed: number;
          imported: number;
          skipped: number;
          failed: number;
        };
      }> = [];
      mockSaveCheckpoint.mockImplementation(
        (cp: {
          jobId: string;
          cursor: string | null;
          progress: {
            processed: number;
            imported: number;
            skipped: number;
            failed: number;
          };
        }) => {
          checkpointSnapshots.push({
            jobId: cp.jobId,
            cursor: cp.cursor,
            progress: { ...cp.progress },
          });
          return Promise.resolve(undefined);
        },
      );

      mockDocClientSend.mockImplementation(
        (cmd: { input: Record<string, unknown> }) => {
          const input = cmd.input as Record<string, unknown>;
          if (
            input.IndexName === "GSI1" &&
            input.ProjectionExpression === "#uuid"
          ) {
            return Promise.resolve({ Items: [{ uuid: "account-uuid" }] });
          }
          if (input.IndexName === "sourceId-index") {
            return Promise.resolve({ Items: [] });
          }
          if (
            input.Key &&
            (input.Key as Record<string, string>).PK === "SEQUENCE#ITEM"
          ) {
            return Promise.resolve({ Item: { value: 0 } });
          }
          if (input.TransactItems) {
            return Promise.resolve({});
          }
          return Promise.resolve({});
        },
      );

      await runImportLoop({
        jobId: "test-job-123",
        apiKey: "test-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      // Checkpoint saved after each page (2 pages = 2 saves)
      expect(checkpointSnapshots).toHaveLength(2);

      // After page 1: cursor is "cursor-after-p1", 2 items processed/imported
      expect(checkpointSnapshots[0].jobId).toBe("test-job-123");
      expect(checkpointSnapshots[0].cursor).toBe("cursor-after-p1");
      expect(checkpointSnapshots[0].progress.processed).toBe(2);
      expect(checkpointSnapshots[0].progress.imported).toBe(2);

      // After page 2: cursor is null, 3 items total (cumulative)
      expect(checkpointSnapshots[1].jobId).toBe("test-job-123");
      expect(checkpointSnapshots[1].cursor).toBeNull();
      expect(checkpointSnapshots[1].progress.processed).toBe(3);
      expect(checkpointSnapshots[1].progress.imported).toBe(3);
    });
  });

  describe("job state transitions", () => {
    it("transitions job to complete when all pages are processed", async () => {
      mockFetchItemPage.mockResolvedValueOnce({
        items: [
          makeConsignCloudItem({ id: "final-item", account_id: "acc-1" }),
        ],
        nextCursor: null,
      });

      mockGetJob.mockResolvedValue(makeJob());
      mockLoadCheckpoint.mockResolvedValue(null);
      mockSaveCheckpoint.mockResolvedValue(undefined);
      mockTransitionJob.mockResolvedValue(undefined);

      mockDocClientSend.mockImplementation(
        (cmd: { input: Record<string, unknown> }) => {
          const input = cmd.input as Record<string, unknown>;
          if (
            input.IndexName === "GSI1" &&
            input.ProjectionExpression === "#uuid"
          ) {
            return Promise.resolve({ Items: [{ uuid: "acc-uuid" }] });
          }
          if (input.IndexName === "sourceId-index") {
            return Promise.resolve({ Items: [] });
          }
          if (
            input.Key &&
            (input.Key as Record<string, string>).PK === "SEQUENCE#ITEM"
          ) {
            return Promise.resolve({ Item: { value: 99 } });
          }
          if (input.TransactItems) {
            return Promise.resolve({});
          }
          return Promise.resolve({});
        },
      );

      await runImportLoop({
        jobId: "test-job-123",
        apiKey: "test-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      expect(mockTransitionJob).toHaveBeenCalledTimes(1);
      expect(mockTransitionJob).toHaveBeenCalledWith(
        "test-job-123",
        "complete",
        expect.objectContaining({ processed: 1, imported: 1 }),
      );
    });

    it("self-invokes and stops processing when timeout threshold is exceeded", async () => {
      mockFetchItemPage.mockResolvedValueOnce({
        items: [
          makeConsignCloudItem({
            id: "item-before-timeout",
            account_id: "acc-1",
          }),
        ],
        nextCursor: "more-pages",
      });

      mockGetJob.mockResolvedValue(makeJob());
      mockLoadCheckpoint.mockResolvedValue(null);
      mockSaveCheckpoint.mockResolvedValue(undefined);
      mockInvokeSelf.mockResolvedValue(undefined);

      mockDocClientSend.mockImplementation(
        (cmd: { input: Record<string, unknown> }) => {
          const input = cmd.input as Record<string, unknown>;
          if (
            input.IndexName === "GSI1" &&
            input.ProjectionExpression === "#uuid"
          ) {
            return Promise.resolve({ Items: [{ uuid: "acc-uuid" }] });
          }
          if (input.IndexName === "sourceId-index") {
            return Promise.resolve({ Items: [] });
          }
          if (
            input.Key &&
            (input.Key as Record<string, string>).PK === "SEQUENCE#ITEM"
          ) {
            return Promise.resolve({ Item: { value: 0 } });
          }
          if (input.TransactItems) {
            return Promise.resolve({});
          }
          return Promise.resolve({});
        },
      );

      // Start time in the past so elapsed > threshold
      const startTime = Date.now() - 280_000;

      await runImportLoop({
        jobId: "test-job-123",
        apiKey: "test-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime,
        timeoutThresholdMs: 270_000,
      });

      // Self-invoked instead of fetching next page
      expect(mockInvokeSelf).toHaveBeenCalledWith("test-job-123");
      // Did not transition to complete (more pages remain)
      expect(mockTransitionJob).not.toHaveBeenCalled();
      // Only fetched 1 page
      expect(mockFetchItemPage).toHaveBeenCalledTimes(1);
    });
  });

  describe("account resolution by number", () => {
    it("resolves ConsignCloud account number to internal UUID via GSI1", async () => {
      const testItem = makeConsignCloudItem({
        id: "item-needs-account",
        account: { id: "cc-ext-account-555", number: "555" },
      });

      mockFetchItemPage.mockResolvedValueOnce({
        items: [testItem],
        nextCursor: null,
      });
      mockGetJob.mockResolvedValue(makeJob());
      mockLoadCheckpoint.mockResolvedValue(null);
      mockSaveCheckpoint.mockResolvedValue(undefined);
      mockTransitionJob.mockResolvedValue(undefined);

      mockDocClientSend.mockImplementation(
        (cmd: { input: Record<string, unknown> }) => {
          const input = cmd.input as Record<string, unknown>;

          // Account resolution via GSI1
          if (
            input.IndexName === "GSI1" &&
            input.ProjectionExpression === "#uuid"
          ) {
            const exprVals = input.ExpressionAttributeValues as Record<
              string,
              string
            >;
            if (exprVals[":sk"] === "0000555") {
              return Promise.resolve({
                Items: [{ uuid: "resolved-uuid-555" }],
              });
            }
            return Promise.resolve({ Items: [] });
          }
          // Item dedup check
          if (input.IndexName === "sourceId-index") {
            return Promise.resolve({ Items: [] });
          }
          // SKU counter
          if (
            input.Key &&
            (input.Key as Record<string, string>).PK === "SEQUENCE#ITEM"
          ) {
            return Promise.resolve({ Item: { value: 10 } });
          }
          if (input.TransactItems) {
            return Promise.resolve({});
          }
          return Promise.resolve({});
        },
      );

      await runImportLoop({
        jobId: "test-job-123",
        apiKey: "test-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      // Verify the written item uses the resolved account UUID
      const shopPuts = getShopTablePutCalls();
      expect(shopPuts.length).toBe(1);
      expect(shopPuts[0].input.Item.accountId).toBe("resolved-uuid-555");
    });

    it("records item as failed when account cannot be resolved", async () => {
      const testItem = makeConsignCloudItem({
        id: "item-no-account",
        account: { id: "unknown-cc-account", number: "9999" },
      });

      mockFetchItemPage.mockResolvedValueOnce({
        items: [testItem],
        nextCursor: null,
      });
      mockGetJob.mockResolvedValue(makeJob());
      mockLoadCheckpoint.mockResolvedValue(null);
      mockSaveCheckpoint.mockResolvedValue(undefined);
      mockTransitionJob.mockResolvedValue(undefined);

      mockDocClientSend.mockImplementation(
        (cmd: { input: Record<string, unknown> }) => {
          const input = cmd.input as Record<string, unknown>;

          // Account resolution — not found
          if (
            input.IndexName === "GSI1" &&
            input.ProjectionExpression === "#uuid"
          ) {
            return Promise.resolve({ Items: [] });
          }
          // Item dedup check
          if (input.IndexName === "sourceId-index") {
            return Promise.resolve({ Items: [] });
          }
          return Promise.resolve({});
        },
      );

      await runImportLoop({
        jobId: "test-job-123",
        apiKey: "test-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      // Item recorded as failed, not imported
      expect(mockTransitionJob).toHaveBeenCalledWith(
        "test-job-123",
        "complete",
        expect.objectContaining({
          processed: 1,
          imported: 0,
          skipped: 0,
          failed: 1,
        }),
      );

      // No item writes to shop table
      const shopPuts = getShopTablePutCalls();
      expect(shopPuts.length).toBe(0);
    });
  });
});
