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
  BatchWriteCommand: class MockBatchWriteCommand {
    constructor(public input: unknown) {}
  },
  DeleteCommand: class MockDeleteCommand {
    constructor(public input: unknown) {}
  },
}));

vi.mock("../../src/dynamodb-client", () => ({
  docClient: { send: (...args: unknown[]) => mockDocClientSend(...args) },
  TABLE_NAME: "test-shop-table",
}));

vi.mock("../../src/import/ssm-client", () => ({
  getConsignCloudApiKey: vi.fn().mockResolvedValue("test-api-key"),
}));

vi.mock("../../src/import/step-function-starter", () => ({
  startStepFunction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/import/rate-limiter", () => ({
  createRateLimiter: () => ({ acquire: vi.fn().mockResolvedValue(undefined) }),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

interface DynamoInput {
  TableName?: string;
  IndexName?: string;
  Key?: Record<string, string>;
  Item?: Record<string, unknown>;
  FilterExpression?: string;
  UpdateExpression?: string;
  ExpressionAttributeValues?: Record<string, unknown>;
  TransactItems?: Array<Record<string, unknown>>;
  RequestItems?: Record<string, unknown>;
  ExclusiveStartKey?: Record<string, unknown>;
}

function makeStagedSaleRecord(overrides: Record<string, unknown> = {}) {
  return {
    PK: `IMPORT#CONSIGNCLOUD#SALE#${overrides.id ?? "sale-001"}`,
    SK: "METADATA",
    id: "sale-001",
    number: "1234",
    status: "finalized",
    subtotal: 5000,
    total: 5500,
    store_portion: 2200,
    consignor_portion: 3300,
    change: 0,
    memo: null,
    cashier: { id: "cashier-cc-001", name: "Jane Doe" },
    created: "2026-03-01T10:00:00.000Z",
    finalized: "2026-03-01T12:00:00.000Z",
    voided: null,
    line_items: [
      {
        id: "li-001",
        item: {
          id: "item-cc-001",
          image: null,
          quantity: 1,
          title: "Shirt",
          sku: "000001",
        },
        unit_price: 2500,
        consignor_portion: 1500,
        store_portion: 1000,
        split_price: 2500,
        split: 0.6,
        cost: 0,
        taxed_price: 2500,
        tax_exempt: false,
        days_on_shelf: 5,
        quantity: 1,
        refunded_quantity: 0,
        sale: (overrides.id as string) ?? "sale-001",
        created: "2026-03-01T10:00:00.000Z",
        discounts: [],
        surcharges: [],
        taxes: [],
        applied_discounts: [],
        applied_surcharges: [],
        applied_taxes: [],
      },
    ],
    importedAt: "2026-03-01T13:00:00.000Z",
    ...overrides,
  };
}

function makeSaleJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "test-sale-job-001",
    state: "running",
    phase: "fetch",
    startedAt: "2026-03-01T00:00:00.000Z",
    lastUpdatedAt: "2026-03-01T00:00:00.000Z",
    filterParams: {},
    progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
    ...overrides,
  };
}

/**
 * Check if a TransactWrite is for the SEQUENCE#SALE counter increment
 * (as opposed to the actual sale + line items write).
 */
function isCounterIncrementTx(items: Array<Record<string, unknown>>): boolean {
  return items.some((item) => {
    const put = (item as { Put?: { Item?: Record<string, unknown> } }).Put;
    const update = (item as { Update?: { Key?: Record<string, unknown> } })
      .Update;
    return (
      put?.Item?.PK === "SEQUENCE#SALE" || update?.Key?.PK === "SEQUENCE#SALE"
    );
  });
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe("Sale Import Integration Tests", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "test-shop-table");
    vi.stubEnv("IMPORT_TABLE_NAME", "test-import-table");
    vi.stubEnv("CONSIGNCLOUD_BASE_URL", "https://api.consigncloud.com/api/v1");
    vi.stubEnv(
      "STATE_MACHINE_ARN",
      "arn:aws:states:us-east-1:123:stateMachine:test",
    );
    mockDocClientSend.mockReset();
    vi.resetModules();
  });

  describe("full fetch→pause→sync→complete lifecycle", () => {
    it("fetches sales from API, stages them, then syncs to Shop_Table", async () => {
      const mockGlobalFetch = vi.fn();
      vi.stubGlobal("fetch", mockGlobalFetch);

      // Page 1: one finalized sale
      mockGlobalFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "cc-sale-100",
              number: "S100",
              status: "finalized",
              subtotal: 3000,
              total: 3200,
              store_portion: 1200,
              consignor_portion: 2000,
              change: 0,
              memo: "Test memo",
              cashier: { id: "cc-cashier-1", name: "Alice" },
              created: "2026-04-01T10:00:00.000Z",
              finalized: "2026-04-01T11:00:00.000Z",
              voided: null,
            },
          ],
          next_cursor: null,
        }),
      });

      // Line items fetch for cc-sale-100
      mockGlobalFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "li-100",
              item: {
                id: "item-cc-x",
                image: null,
                quantity: 1,
                title: "Widget",
                sku: "W001",
              },
              unit_price: 3000,
              consignor_portion: 2000,
              store_portion: 1000,
              split_price: 3000,
              split: 0.67,
              cost: 0,
              taxed_price: 3000,
              tax_exempt: false,
              days_on_shelf: 7,
              quantity: 1,
              refunded_quantity: 0,
              sale: "cc-sale-100",
              created: "2026-04-01T10:00:00.000Z",
              discounts: [],
              surcharges: [],
              taxes: [],
              applied_discounts: [
                { id: "d1", amount: 200, level: "item", discount: "disc-x" },
              ],
              applied_surcharges: [],
              applied_taxes: [],
            },
          ],
        }),
      });

      // Track staged records from fetch phase
      const stagedRecords: Array<Record<string, unknown>> = [];
      let jobState = "running";
      let jobPhase = "fetch";

      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        // UpdateCommand for state transitions (has UpdateExpression)
        if (input.UpdateExpression) {
          const vals = input.ExpressionAttributeValues as Record<
            string,
            unknown
          >;
          if (vals[":state"] === "paused") jobState = "paused";
          if (vals[":state"] === "running") jobState = "running";
          if (vals[":state"] === "complete") jobState = "complete";
          if (vals[":phase"]) jobPhase = vals[":phase"] as string;
          return Promise.resolve({});
        }

        // GetCommand for job lookup
        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: jobState, phase: jobPhase }),
          });
        }

        if (
          input.Key?.SK === "CHECKPOINT" ||
          input.Key?.SK === "SYNC_CHECKPOINT"
        ) {
          return Promise.resolve({ Item: null });
        }

        if (
          input.Item?.SK === "CHECKPOINT" ||
          input.Item?.SK === "SYNC_CHECKPOINT"
        ) {
          return Promise.resolve({});
        }

        if (input.RequestItems) {
          const tableName = Object.keys(input.RequestItems)[0];
          const requests = (
            input.RequestItems as Record<
              string,
              Array<{ PutRequest: { Item: Record<string, unknown> } }>
            >
          )[tableName];
          for (const req of requests) {
            stagedRecords.push(req.PutRequest.Item);
          }
          return Promise.resolve({});
        }

        // Scan for getRunningSaleJob (also has ExpressionAttributeValues but with FilterExpression)
        if (input.FilterExpression) {
          return Promise.resolve({ Items: [] });
        }

        return Promise.resolve({});
      });

      // Run fetch phase
      const { runSaleFetchLoop } =
        await import("../../src/import/sale-fetch-orchestrator");

      const fetchResult = await runSaleFetchLoop({
        jobId: "test-sale-job-001",
        apiKey: "test-api-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      expect(fetchResult.status).toBe("complete");
      expect(stagedRecords).toHaveLength(1);
      expect(stagedRecords[0].PK).toBe("IMPORT#CONSIGNCLOUD#SALE#cc-sale-100");
      expect(jobState).toBe("paused");

      // Now set up sync phase mocks
      jobState = "running";
      jobPhase = "sync";
      mockDocClientSend.mockReset();

      const writtenTransactions: Array<Array<Record<string, unknown>>> = [];

      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: "running", phase: "sync" }),
          });
        }

        if (input.Key?.SK === "SYNC_CHECKPOINT") {
          return Promise.resolve({ Item: null });
        }

        if (input.FilterExpression?.includes("begins_with(PK")) {
          return Promise.resolve({
            Items: [{ ...stagedRecords[0] }],
            LastEvaluatedKey: undefined,
          });
        }

        if (input.IndexName === "sourceId-index") {
          const vals = input.ExpressionAttributeValues as Record<
            string,
            unknown
          >;
          const sourceId = vals[":sourceId"] as string;
          if (sourceId === "cc-cashier-1")
            return Promise.resolve({ Items: [] });
          if (sourceId === "item-cc-x") return Promise.resolve({ Items: [] });
          return Promise.resolve({ Items: [] });
        }

        if (input.Key?.PK === "SEQUENCE#SALE") {
          return Promise.resolve({ Item: { value: 0 } });
        }

        if (input.TransactItems) {
          const items = input.TransactItems as Array<Record<string, unknown>>;
          if (isCounterIncrementTx(items)) return Promise.resolve({});
          writtenTransactions.push(items);
          return Promise.resolve({});
        }

        if (input.Item) return Promise.resolve({});
        return Promise.resolve({});
      });

      const { runSaleSyncLoop } =
        await import("../../src/import/sale-sync-orchestrator");

      const syncResult = await runSaleSyncLoop({
        jobId: "test-sale-job-001",
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      expect(syncResult.status).toBe("complete");
      expect(writtenTransactions).toHaveLength(1);
      // Sale record + 1 line item = 2 items in transaction
      expect(writtenTransactions[0]).toHaveLength(2);

      vi.unstubAllGlobals();
    });
  });

  describe("deduplication across multiple sync runs", () => {
    it("skips sales where sourceId already exists in Shop_Table", async () => {
      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: "running", phase: "sync" }),
          });
        }

        if (input.Key?.SK === "SYNC_CHECKPOINT") {
          return Promise.resolve({ Item: null });
        }

        if (input.FilterExpression?.includes("begins_with(PK")) {
          return Promise.resolve({
            Items: [
              makeStagedSaleRecord({ id: "already-imported-sale" }),
              makeStagedSaleRecord({ id: "new-sale-002", number: "5678" }),
            ],
            LastEvaluatedKey: undefined,
          });
        }

        if (input.IndexName === "sourceId-index") {
          const vals = input.ExpressionAttributeValues as Record<
            string,
            unknown
          >;
          const sourceId = vals[":sourceId"] as string;
          if (sourceId === "already-imported-sale") {
            return Promise.resolve({
              Items: [
                { uuid: "existing-uuid-abc", PK: "SALE#existing-uuid-abc" },
              ],
            });
          }
          return Promise.resolve({ Items: [] });
        }

        if (input.Key?.PK === "SEQUENCE#SALE") {
          return Promise.resolve({ Item: { value: 5 } });
        }

        if (input.TransactItems) {
          return Promise.resolve({});
        }

        if (input.Item) return Promise.resolve({});
        return Promise.resolve({});
      });

      const { runSaleSyncLoop } =
        await import("../../src/import/sale-sync-orchestrator");

      const result = await runSaleSyncLoop({
        jobId: "test-sale-job-001",
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      expect(result.status).toBe("complete");

      // Only one sale should be written (the new one); the duplicate is skipped
      const transactCalls = mockDocClientSend.mock.calls
        .map((call: unknown[]) => call[0] as { input: DynamoInput })
        .filter((cmd) => cmd.input.TransactItems != null);
      const saleWriteCalls = transactCalls.filter(
        (c) => !isCounterIncrementTx(c.input.TransactItems!),
      );
      expect(saleWriteCalls).toHaveLength(1);
    });
  });

  describe("TransactWrite atomicity", () => {
    it("writes sale and all line items in a single transaction", async () => {
      const stagedSale = makeStagedSaleRecord({
        id: "atomic-sale",
        cashier: null,
        line_items: [
          {
            id: "li-a",
            item: {
              id: "item-a",
              image: null,
              quantity: 1,
              title: "A",
              sku: "A001",
            },
            unit_price: 1000,
            consignor_portion: 600,
            store_portion: 400,
            split_price: 1000,
            split: 0.6,
            cost: 0,
            taxed_price: 1000,
            tax_exempt: false,
            days_on_shelf: 1,
            quantity: 1,
            refunded_quantity: 0,
            sale: "atomic-sale",
            created: "2026-03-01T10:00:00.000Z",
            discounts: [],
            surcharges: [],
            taxes: [],
            applied_discounts: [],
            applied_surcharges: [],
            applied_taxes: [],
          },
          {
            id: "li-b",
            item: {
              id: "item-b",
              image: null,
              quantity: 1,
              title: "B",
              sku: "B001",
            },
            unit_price: 2000,
            consignor_portion: 1200,
            store_portion: 800,
            split_price: 2000,
            split: 0.6,
            cost: 0,
            taxed_price: 2000,
            tax_exempt: false,
            days_on_shelf: 2,
            quantity: 1,
            refunded_quantity: 0,
            sale: "atomic-sale",
            created: "2026-03-01T10:00:00.000Z",
            discounts: [],
            surcharges: [],
            taxes: [],
            applied_discounts: [
              { id: "d1", amount: 100, level: "item", discount: "disc-1" },
            ],
            applied_surcharges: [],
            applied_taxes: [],
          },
          {
            id: "li-c",
            item: {
              id: "item-c",
              image: null,
              quantity: 2,
              title: "C",
              sku: "C001",
            },
            unit_price: 3000,
            consignor_portion: 1800,
            store_portion: 1200,
            split_price: 3000,
            split: 0.6,
            cost: 0,
            taxed_price: 3000,
            tax_exempt: false,
            days_on_shelf: 3,
            quantity: 2,
            refunded_quantity: 0,
            sale: "atomic-sale",
            created: "2026-03-01T10:00:00.000Z",
            discounts: [],
            surcharges: [],
            taxes: [],
            applied_discounts: [
              { id: "d2", amount: 200, level: "item", discount: "disc-2" },
            ],
            applied_surcharges: [],
            applied_taxes: [],
          },
        ],
      });

      const writtenTransactions: Array<Array<Record<string, unknown>>> = [];

      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: "running", phase: "sync" }),
          });
        }

        if (input.Key?.SK === "SYNC_CHECKPOINT") {
          return Promise.resolve({ Item: null });
        }

        if (input.FilterExpression?.includes("begins_with(PK")) {
          return Promise.resolve({
            Items: [stagedSale],
            LastEvaluatedKey: undefined,
          });
        }

        if (input.IndexName === "sourceId-index") {
          return Promise.resolve({ Items: [] });
        }

        if (input.Key?.PK === "SEQUENCE#SALE") {
          return Promise.resolve({ Item: { value: 10 } });
        }

        if (input.TransactItems) {
          const items = input.TransactItems as Array<Record<string, unknown>>;
          if (isCounterIncrementTx(items)) return Promise.resolve({});
          writtenTransactions.push(items);
          return Promise.resolve({});
        }

        if (input.Item) return Promise.resolve({});
        return Promise.resolve({});
      });

      const { runSaleSyncLoop } =
        await import("../../src/import/sale-sync-orchestrator");

      await runSaleSyncLoop({
        jobId: "test-sale-job-001",
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      expect(writtenTransactions).toHaveLength(1);
      // Sale record (1) + 3 line items = 4 items in the transaction
      expect(writtenTransactions[0]).toHaveLength(4);

      // First item is the Sale record
      const saleItem = (
        writtenTransactions[0][0] as { Put: { Item: Record<string, unknown> } }
      ).Put.Item;
      expect(saleItem.SK).toBe("METADATA");
      expect(saleItem.sourceId).toBe("atomic-sale");

      // Line items have correct SKs
      const li0 = (
        writtenTransactions[0][1] as { Put: { Item: Record<string, unknown> } }
      ).Put.Item;
      const li1 = (
        writtenTransactions[0][2] as { Put: { Item: Record<string, unknown> } }
      ).Put.Item;
      const li2 = (
        writtenTransactions[0][3] as { Put: { Item: Record<string, unknown> } }
      ).Put.Item;
      expect(li0.SK).toBe("LINE_ITEM#0000");
      expect(li1.SK).toBe("LINE_ITEM#0001");
      expect(li2.SK).toBe("LINE_ITEM#0002");
    });
  });

  describe("cashier resolution", () => {
    it("resolves existing employee by sourceId", async () => {
      const stagedSale = makeStagedSaleRecord({
        id: "sale-with-known-cashier",
        cashier: { id: "known-cashier-id", name: "Bob" },
        line_items: [],
      });

      const writtenTransactions: Array<Array<Record<string, unknown>>> = [];

      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: "running", phase: "sync" }),
          });
        }

        if (input.Key?.SK === "SYNC_CHECKPOINT") {
          return Promise.resolve({ Item: null });
        }

        if (input.FilterExpression?.includes("begins_with(PK")) {
          return Promise.resolve({
            Items: [stagedSale],
            LastEvaluatedKey: undefined,
          });
        }

        if (input.IndexName === "sourceId-index") {
          const vals = input.ExpressionAttributeValues as Record<
            string,
            unknown
          >;
          const sourceId = vals[":sourceId"] as string;
          if (sourceId === "known-cashier-id") {
            return Promise.resolve({
              Items: [{ uuid: "existing-employee-uuid" }],
            });
          }
          return Promise.resolve({ Items: [] });
        }

        if (input.Key?.PK === "SEQUENCE#SALE") {
          return Promise.resolve({ Item: { value: 0 } });
        }

        if (input.TransactItems) {
          const items = input.TransactItems as Array<Record<string, unknown>>;
          if (isCounterIncrementTx(items)) return Promise.resolve({});
          writtenTransactions.push(items);
          return Promise.resolve({});
        }

        if (input.Item) return Promise.resolve({});
        return Promise.resolve({});
      });

      const { runSaleSyncLoop } =
        await import("../../src/import/sale-sync-orchestrator");

      await runSaleSyncLoop({
        jobId: "test-sale-job-001",
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      expect(writtenTransactions).toHaveLength(1);
      const saleRecord = (
        writtenTransactions[0][0] as { Put: { Item: Record<string, unknown> } }
      ).Put.Item;
      expect(saleRecord.cashierId).toBe("existing-employee-uuid");
    });

    it("creates new employee when cashier does not exist", async () => {
      const stagedSale = makeStagedSaleRecord({
        id: "sale-new-cashier",
        cashier: { id: "new-cashier-cc-id", name: "New Person" },
        line_items: [],
      });

      const createdEmployees: Array<Record<string, unknown>> = [];
      const writtenTransactions: Array<Array<Record<string, unknown>>> = [];

      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: "running", phase: "sync" }),
          });
        }

        if (input.Key?.SK === "SYNC_CHECKPOINT") {
          return Promise.resolve({ Item: null });
        }

        if (input.FilterExpression?.includes("begins_with(PK")) {
          return Promise.resolve({
            Items: [stagedSale],
            LastEvaluatedKey: undefined,
          });
        }

        if (input.IndexName === "sourceId-index") {
          return Promise.resolve({ Items: [] });
        }

        if (input.Key?.PK === "SEQUENCE#SALE") {
          return Promise.resolve({ Item: { value: 0 } });
        }

        if (input.TransactItems) {
          const items = input.TransactItems as Array<Record<string, unknown>>;
          if (isCounterIncrementTx(items)) return Promise.resolve({});
          writtenTransactions.push(items);
          return Promise.resolve({});
        }

        // PutCommand for employee creation
        if (input.Item) {
          const pk = (input.Item as Record<string, unknown>).PK as string;
          if (pk && pk.startsWith("EMPLOYEE#")) {
            createdEmployees.push(input.Item as Record<string, unknown>);
          }
          return Promise.resolve({});
        }

        return Promise.resolve({});
      });

      const { runSaleSyncLoop } =
        await import("../../src/import/sale-sync-orchestrator");

      await runSaleSyncLoop({
        jobId: "test-sale-job-001",
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      // Employee was created
      expect(createdEmployees).toHaveLength(1);
      expect(createdEmployees[0].name).toBe("New Person");
      expect(createdEmployees[0].sourceId).toBe("new-cashier-cc-id");
      expect(createdEmployees[0].PK as string).toMatch(/^EMPLOYEE#/);

      // Sale was written with the new employee's UUID as cashierId
      expect(writtenTransactions).toHaveLength(1);
      const saleRecord = (
        writtenTransactions[0][0] as { Put: { Item: Record<string, unknown> } }
      ).Put.Item;
      expect(saleRecord.cashierId).toBeDefined();
      expect(saleRecord.cashierId).not.toBeNull();
    });
  });

  describe("item reference resolution", () => {
    it("resolves item reference when item exists in Shop_Table", async () => {
      const stagedSale = makeStagedSaleRecord({
        id: "sale-item-resolve",
        cashier: null,
        line_items: [
          {
            id: "li-r1",
            item: {
              id: "known-item-source-id",
              image: null,
              quantity: 1,
              title: "Known",
              sku: "K001",
            },
            unit_price: 1500,
            consignor_portion: 900,
            store_portion: 600,
            split_price: 1500,
            split: 0.6,
            cost: 0,
            taxed_price: 1500,
            tax_exempt: false,
            days_on_shelf: 4,
            quantity: 1,
            refunded_quantity: 0,
            sale: "sale-item-resolve",
            created: "2026-03-01T10:00:00.000Z",
            discounts: [],
            surcharges: [],
            taxes: [],
            applied_discounts: [],
            applied_surcharges: [],
            applied_taxes: [],
          },
        ],
      });

      const writtenTransactions: Array<Array<Record<string, unknown>>> = [];

      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: "running", phase: "sync" }),
          });
        }

        if (input.Key?.SK === "SYNC_CHECKPOINT") {
          return Promise.resolve({ Item: null });
        }

        if (input.FilterExpression?.includes("begins_with(PK")) {
          return Promise.resolve({
            Items: [stagedSale],
            LastEvaluatedKey: undefined,
          });
        }

        if (input.IndexName === "sourceId-index") {
          const vals = input.ExpressionAttributeValues as Record<
            string,
            unknown
          >;
          const sourceId = vals[":sourceId"] as string;
          if (sourceId === "known-item-source-id") {
            return Promise.resolve({
              Items: [{ uuid: "resolved-item-uuid-123" }],
            });
          }
          return Promise.resolve({ Items: [] });
        }

        if (input.Key?.PK === "SEQUENCE#SALE") {
          return Promise.resolve({ Item: { value: 0 } });
        }

        if (input.TransactItems) {
          const items = input.TransactItems as Array<Record<string, unknown>>;
          if (isCounterIncrementTx(items)) return Promise.resolve({});
          writtenTransactions.push(items);
          return Promise.resolve({});
        }

        if (input.Item) return Promise.resolve({});
        return Promise.resolve({});
      });

      const { runSaleSyncLoop } =
        await import("../../src/import/sale-sync-orchestrator");

      await runSaleSyncLoop({
        jobId: "test-sale-job-001",
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      expect(writtenTransactions).toHaveLength(1);
      const lineItemRecord = (
        writtenTransactions[0][1] as { Put: { Item: Record<string, unknown> } }
      ).Put.Item;
      expect(lineItemRecord.itemId).toBe("resolved-item-uuid-123");
    });

    it("sets itemId to null and logs WARN when item not found", async () => {
      const stagedSale = makeStagedSaleRecord({
        id: "sale-item-missing",
        cashier: null,
        line_items: [
          {
            id: "li-miss",
            item: {
              id: "nonexistent-item-id",
              image: null,
              quantity: 1,
              title: "Missing",
              sku: "M001",
            },
            unit_price: 500,
            consignor_portion: 300,
            store_portion: 200,
            split_price: 500,
            split: 0.6,
            cost: 0,
            taxed_price: 500,
            tax_exempt: false,
            days_on_shelf: 1,
            quantity: 1,
            refunded_quantity: 0,
            sale: "sale-item-missing",
            created: "2026-03-01T10:00:00.000Z",
            discounts: [],
            surcharges: [],
            taxes: [],
            applied_discounts: [],
            applied_surcharges: [],
            applied_taxes: [],
          },
        ],
      });

      const writtenTransactions: Array<Array<Record<string, unknown>>> = [];
      const consoleSpy = vi.spyOn(console, "info");

      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: "running", phase: "sync" }),
          });
        }

        if (input.Key?.SK === "SYNC_CHECKPOINT") {
          return Promise.resolve({ Item: null });
        }

        if (input.FilterExpression?.includes("begins_with(PK")) {
          return Promise.resolve({
            Items: [stagedSale],
            LastEvaluatedKey: undefined,
          });
        }

        if (input.IndexName === "sourceId-index") {
          return Promise.resolve({ Items: [] });
        }

        if (input.Key?.PK === "SEQUENCE#SALE") {
          return Promise.resolve({ Item: { value: 0 } });
        }

        if (input.TransactItems) {
          const items = input.TransactItems as Array<Record<string, unknown>>;
          if (isCounterIncrementTx(items)) return Promise.resolve({});
          writtenTransactions.push(items);
          return Promise.resolve({});
        }

        if (input.Item) return Promise.resolve({});
        return Promise.resolve({});
      });

      const { runSaleSyncLoop } =
        await import("../../src/import/sale-sync-orchestrator");

      await runSaleSyncLoop({
        jobId: "test-sale-job-001",
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      expect(writtenTransactions).toHaveLength(1);
      const lineItemRecord = (
        writtenTransactions[0][1] as { Put: { Item: Record<string, unknown> } }
      ).Put.Item;
      expect(lineItemRecord.itemId).toBeNull();

      // Verify WARN was logged for unresolved item
      const warnLogs = consoleSpy.mock.calls
        .map((args) => args[0] as string)
        .filter(
          (msg) => msg.includes("WARN") && msg.includes("unresolved item"),
        );
      expect(warnLogs.length).toBeGreaterThanOrEqual(1);

      consoleSpy.mockRestore();
    });
  });

  describe("checkpoint resume from fetch phase", () => {
    it("loads checkpoint and continues fetching from saved cursor", async () => {
      const mockGlobalFetch = vi.fn();
      vi.stubGlobal("fetch", mockGlobalFetch);

      // API returns page from resumed cursor position
      mockGlobalFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "resumed-sale",
              number: "R1",
              status: "finalized",
              subtotal: 1000,
              total: 1100,
              store_portion: 400,
              consignor_portion: 700,
              change: 0,
              memo: null,
              cashier: null,
              created: "2026-05-01T10:00:00.000Z",
              finalized: "2026-05-01T11:00:00.000Z",
              voided: null,
            },
          ],
          next_cursor: null,
        }),
      });

      // Line items (empty)
      mockGlobalFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: "running", phase: "fetch" }),
          });
        }

        // Return existing checkpoint with cursor
        if (input.Key?.SK === "CHECKPOINT") {
          return Promise.resolve({
            Item: {
              jobId: "test-sale-job-001",
              cursor: "saved-cursor-page-2",
              progress: { processed: 5, imported: 4, skipped: 1, failed: 0 },
              lastUpdatedAt: "2026-05-01T09:00:00.000Z",
            },
          });
        }

        if (input.RequestItems) return Promise.resolve({});
        if (input.Item) return Promise.resolve({});
        return Promise.resolve({});
      });

      const { runSaleFetchLoop } =
        await import("../../src/import/sale-fetch-orchestrator");

      await runSaleFetchLoop({
        jobId: "test-sale-job-001",
        apiKey: "test-api-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      // Verify the API was called with the saved cursor
      expect(mockGlobalFetch).toHaveBeenCalled();
      const fetchUrl = mockGlobalFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain("cursor=saved-cursor-page-2");

      vi.unstubAllGlobals();
    });
  });

  describe("checkpoint resume from sync phase", () => {
    it("loads sync checkpoint and continues from exclusiveStartKey", async () => {
      const savedStartKey = {
        PK: "IMPORT#CONSIGNCLOUD#SALE#prev-sale",
        SK: "METADATA",
      };

      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: "running", phase: "sync" }),
          });
        }

        // Sync checkpoint — return existing
        if (input.Key?.SK === "SYNC_CHECKPOINT") {
          return Promise.resolve({
            Item: {
              jobId: "test-sale-job-001",
              exclusiveStartKey: savedStartKey,
              progress: { processed: 3, imported: 2, skipped: 1, failed: 0 },
              failures: [],
              lineItemsImported: 4,
              lastUpdatedAt: "2026-05-01T09:30:00.000Z",
            },
          });
        }

        // Scan with exclusiveStartKey — verify it's used
        if (input.FilterExpression?.includes("begins_with(PK")) {
          expect(input.ExclusiveStartKey).toEqual(savedStartKey);
          return Promise.resolve({
            Items: [
              makeStagedSaleRecord({
                id: "remaining-sale",
                cashier: null,
                line_items: [],
              }),
            ],
            LastEvaluatedKey: undefined,
          });
        }

        if (input.IndexName === "sourceId-index") {
          return Promise.resolve({ Items: [] });
        }

        if (input.Key?.PK === "SEQUENCE#SALE") {
          return Promise.resolve({ Item: { value: 10 } });
        }

        if (input.TransactItems) return Promise.resolve({});
        if (input.Item) return Promise.resolve({});
        return Promise.resolve({});
      });

      const { runSaleSyncLoop } =
        await import("../../src/import/sale-sync-orchestrator");

      const result = await runSaleSyncLoop({
        jobId: "test-sale-job-001",
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      expect(result.status).toBe("complete");
    });
  });

  describe("line item fetch failure graceful degradation", () => {
    it("stores sale with empty line_items when line item fetch throws", async () => {
      const mockGlobalFetch = vi.fn();
      vi.stubGlobal("fetch", mockGlobalFetch);

      // Sales page response
      mockGlobalFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "sale-with-failed-li",
              number: "F1",
              status: "finalized",
              subtotal: 2000,
              total: 2200,
              store_portion: 800,
              consignor_portion: 1400,
              change: 0,
              memo: null,
              cashier: null,
              created: "2026-06-01T10:00:00.000Z",
              finalized: "2026-06-01T11:00:00.000Z",
              voided: null,
            },
          ],
          next_cursor: null,
        }),
      });

      // Line items fetch throws error
      mockGlobalFetch.mockRejectedValueOnce(new Error("Network failure"));

      const stagedItems: Array<Record<string, unknown>> = [];

      mockDocClientSend.mockImplementation((cmd: { input: DynamoInput }) => {
        const input = cmd.input;

        if (
          input.Key?.PK?.startsWith("SALE_IMPORT#") &&
          input.Key?.SK === "METADATA"
        ) {
          return Promise.resolve({
            Item: makeSaleJob({ state: "running", phase: "fetch" }),
          });
        }

        if (input.Key?.SK === "CHECKPOINT") {
          return Promise.resolve({ Item: null });
        }

        // BatchWrite — capture staged items
        if (input.RequestItems) {
          const tableName = Object.keys(input.RequestItems)[0];
          const requests = (
            input.RequestItems as Record<
              string,
              Array<{ PutRequest: { Item: Record<string, unknown> } }>
            >
          )[tableName];
          for (const req of requests) {
            stagedItems.push(req.PutRequest.Item);
          }
          return Promise.resolve({});
        }

        if (input.Item) return Promise.resolve({});
        return Promise.resolve({});
      });

      const { runSaleFetchLoop } =
        await import("../../src/import/sale-fetch-orchestrator");

      const result = await runSaleFetchLoop({
        jobId: "test-sale-job-001",
        apiKey: "test-api-key",
        baseUrl: "https://api.consigncloud.com/api/v1",
        rateLimiter: { acquire: vi.fn().mockResolvedValue(undefined) } as never,
        startTime: Date.now(),
        timeoutThresholdMs: 270_000,
      });

      expect(result.status).toBe("complete");
      // Sale was staged even though line items failed
      expect(stagedItems).toHaveLength(1);
      expect(stagedItems[0].id).toBe("sale-with-failed-li");
      // Line items should be empty array
      expect(stagedItems[0].line_items).toEqual([]);

      vi.unstubAllGlobals();
    });
  });
});
