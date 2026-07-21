import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for sale-job-manager.ts
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDynamoDBClient {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: sendMock }),
  },
  GetCommand: class MockGetCommand {
    input: unknown;
    _type = "Get";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutCommand: class MockPutCommand {
    input: unknown;
    _type = "Put";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  ScanCommand: class MockScanCommand {
    input: unknown;
    _type = "Scan";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  UpdateCommand: class MockUpdateCommand {
    input: unknown;
    _type = "Update";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  QueryCommand: class MockQueryCommand {
    input: unknown;
    _type = "Query";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  TransactWriteCommand: class MockTransactWriteCommand {
    input: unknown;
    _type = "TransactWrite";
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

describe("sale-job-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockReset();
  });

  describe("createSaleJob", () => {
    it("returns a valid SaleImportJob with all fields correctly initialized", async () => {
      const { createSaleJob } =
        await import("../../src/import/sale-job-manager");

      sendMock.mockResolvedValueOnce({}); // TransactWriteCommand response

      const filterParams = { createdAfter: "2024-01-01T00:00:00.000Z" };
      const job = await createSaleJob(filterParams);

      // jobId is a valid UUID
      expect(job.jobId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      // state is running
      expect(job.state).toBe("running");
      // phase is fetch
      expect(job.phase).toBe("fetch");
      // progress counts zeroed
      expect(job.progress).toEqual({
        processed: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
      });
      // filterParams preserved
      expect(job.filterParams).toEqual(filterParams);
      // timestamps are valid ISO strings
      expect(job.startedAt).toBe(job.lastUpdatedAt);
      expect(new Date(job.startedAt).toISOString()).toBe(job.startedAt);

      // Verify TransactWriteCommand was called with correct PK/SK in metadata item
      const txCmd = sendMock.mock.calls[0][0];
      expect(txCmd._type).toBe("TransactWrite");
      const metadataItem = txCmd.input.TransactItems[0].Put.Item;
      expect(metadataItem.PK).toBe(`SALE_IMPORT#${job.jobId}`);
      expect(metadataItem.SK).toBe("METADATA");
    });

    it("creates job with empty filterParams when no createdAfter provided", async () => {
      const { createSaleJob } =
        await import("../../src/import/sale-job-manager");

      sendMock.mockResolvedValueOnce({});

      const job = await createSaleJob({});

      expect(job.filterParams).toEqual({});
      expect(job.state).toBe("running");
      expect(job.phase).toBe("fetch");
    });
  });

  describe("getSaleJob", () => {
    it("returns null for non-existent job", async () => {
      const { getSaleJob } = await import("../../src/import/sale-job-manager");

      sendMock.mockResolvedValueOnce({ Item: undefined });

      const result = await getSaleJob("non-existent-id");

      expect(result).toBeNull();

      // Verify GetCommand was called with correct key
      const getCmd = sendMock.mock.calls[0][0];
      expect(getCmd.input.Key.PK).toBe("SALE_IMPORT#non-existent-id");
      expect(getCmd.input.Key.SK).toBe("METADATA");
    });

    it("returns SaleImportJob when job exists", async () => {
      const { getSaleJob } = await import("../../src/import/sale-job-manager");

      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "abc-123",
          state: "running",
          phase: "fetch",
          startedAt: "2024-06-01T00:00:00.000Z",
          lastUpdatedAt: "2024-06-01T00:01:00.000Z",
          filterParams: { createdAfter: "2024-01-01T00:00:00.000Z" },
          progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
        },
      });

      const result = await getSaleJob("abc-123");

      expect(result).toEqual({
        jobId: "abc-123",
        state: "running",
        phase: "fetch",
        startedAt: "2024-06-01T00:00:00.000Z",
        lastUpdatedAt: "2024-06-01T00:01:00.000Z",
        filterParams: { createdAfter: "2024-01-01T00:00:00.000Z" },
        error: undefined,
        progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
      });
    });
  });

  describe("getRunningSaleJob", () => {
    it("finds an active job when query returns a running job", async () => {
      const { getRunningSaleJob } =
        await import("../../src/import/sale-job-manager");

      sendMock.mockResolvedValueOnce({
        Items: [
          {
            PK: "JOBS",
            SK: "SALE_IMPORT#2024-06-01T00:05:00.000Z#active-job-1",
            jobId: "active-job-1",
            state: "running",
            phase: "fetch",
            startedAt: "2024-06-01T00:00:00.000Z",
            lastUpdatedAt: "2024-06-01T00:05:00.000Z",
            progress: { processed: 50, imported: 45, skipped: 3, failed: 2 },
            prefix: "SALE_IMPORT",
          },
        ],
      });

      const result = await getRunningSaleJob();

      expect(result).not.toBeNull();
      expect(result!.jobId).toBe("active-job-1");
      expect(result!.state).toBe("running");

      // Verify QueryCommand was used on JOBS partition
      const queryCmd = sendMock.mock.calls[0][0];
      expect(queryCmd._type).toBe("Query");
      expect(queryCmd.input.ExpressionAttributeValues[":pk"]).toBe("JOBS");
      expect(queryCmd.input.ExpressionAttributeValues[":skPrefix"]).toBe(
        "SALE_IMPORT#",
      );
    });

    it("returns null when no running or paused jobs exist", async () => {
      const { getRunningSaleJob } =
        await import("../../src/import/sale-job-manager");

      sendMock.mockResolvedValueOnce({
        Items: [],
      });

      const result = await getRunningSaleJob();
      expect(result).toBeNull();
    });
  });

  describe("transitionSaleJob", () => {
    it("updates state with valid transition (running → failed)", async () => {
      const { transitionSaleJob } =
        await import("../../src/import/sale-job-manager");

      // Mock getJob response (running state)
      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "job-1",
          state: "running",
          phase: "fetch",
          startedAt: "2024-06-01T00:00:00.000Z",
          lastUpdatedAt: "2024-06-01T00:00:00.000Z",
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      // Mock TransactWriteCommand response
      sendMock.mockResolvedValueOnce({});

      const progress = { processed: 10, imported: 5, skipped: 2, failed: 3 };

      await transitionSaleJob("job-1", "failed", progress, "Something broke");

      // Verify TransactWriteCommand was called
      const txCmd = sendMock.mock.calls[1][0];
      expect(txCmd._type).toBe("TransactWrite");
      const updateItem = txCmd.input.TransactItems[0].Update;
      expect(updateItem.Key.PK).toBe("SALE_IMPORT#job-1");
      expect(updateItem.Key.SK).toBe("METADATA");
      expect(updateItem.ExpressionAttributeValues[":state"]).toBe("failed");
      expect(updateItem.ExpressionAttributeValues[":progress"]).toEqual(
        progress,
      );
      expect(updateItem.ExpressionAttributeValues[":error"]).toBe(
        "Something broke",
      );
    });

    it("updates state without error when error is undefined", async () => {
      const { transitionSaleJob } =
        await import("../../src/import/sale-job-manager");

      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "job-1",
          state: "running",
          phase: "fetch",
          startedAt: "2024-06-01T00:00:00.000Z",
          lastUpdatedAt: "2024-06-01T00:00:00.000Z",
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      sendMock.mockResolvedValueOnce({});

      const progress = { processed: 10, imported: 10, skipped: 0, failed: 0 };

      await transitionSaleJob("job-1", "complete", progress);

      const txCmd = sendMock.mock.calls[1][0];
      const updateItem = txCmd.input.TransactItems[0].Update;
      // UpdateExpression should NOT contain error
      expect(updateItem.UpdateExpression).not.toContain("#error");
      expect(updateItem.ExpressionAttributeValues[":error"]).toBeUndefined();
    });

    it("truncates error to 500 characters", async () => {
      const { transitionSaleJob } =
        await import("../../src/import/sale-job-manager");

      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "job-1",
          state: "running",
          phase: "fetch",
          startedAt: "2024-06-01T00:00:00.000Z",
          lastUpdatedAt: "2024-06-01T00:00:00.000Z",
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      sendMock.mockResolvedValueOnce({});

      const longError = "x".repeat(1000);
      const progress = { processed: 1, imported: 0, skipped: 0, failed: 1 };

      await transitionSaleJob("job-1", "failed", progress, longError);

      const txCmd = sendMock.mock.calls[1][0];
      const updateItem = txCmd.input.TransactItems[0].Update;
      const storedError = updateItem.ExpressionAttributeValues[":error"];
      expect(storedError.length).toBe(500);
      expect(storedError).toBe("x".repeat(500));
    });

    it("throws error for invalid state transition (complete → running)", async () => {
      const { transitionSaleJob } =
        await import("../../src/import/sale-job-manager");

      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "job-1",
          state: "complete",
          phase: "sync",
          startedAt: "2024-06-01T00:00:00.000Z",
          lastUpdatedAt: "2024-06-01T01:00:00.000Z",
          filterParams: {},
          progress: { processed: 100, imported: 100, skipped: 0, failed: 0 },
        },
      });

      const progress = { processed: 0, imported: 0, skipped: 0, failed: 0 };

      await expect(
        transitionSaleJob("job-1", "running", progress),
      ).rejects.toThrow(
        "Invalid state transition: cannot transition from 'complete' to 'running'",
      );

      // Verify no UpdateCommand was sent
      expect(sendMock).toHaveBeenCalledTimes(1); // Only the GetCommand
    });

    it("throws error when job does not exist", async () => {
      const { transitionSaleJob } =
        await import("../../src/import/sale-job-manager");

      sendMock.mockResolvedValueOnce({ Item: undefined });

      const progress = { processed: 0, imported: 0, skipped: 0, failed: 0 };

      await expect(
        transitionSaleJob("non-existent", "failed", progress),
      ).rejects.toThrow("Sale job non-existent not found");
    });
  });

  describe("updateSaleJobPhase", () => {
    it("sets phase via TransactWriteCommand", async () => {
      const { updateSaleJobPhase } =
        await import("../../src/import/sale-job-manager");

      // GetCommand to read current job
      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "job-1",
          state: "running",
          phase: "fetch",
          startedAt: "2024-06-01T00:00:00.000Z",
          lastUpdatedAt: "2024-06-01T00:00:00.000Z",
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      // TransactWriteCommand response
      sendMock.mockResolvedValueOnce({});

      await updateSaleJobPhase("job-1", "sync");

      const txCmd = sendMock.mock.calls[1][0];
      expect(txCmd._type).toBe("TransactWrite");
      const updateItem = txCmd.input.TransactItems[0].Update;
      expect(updateItem.Key.PK).toBe("SALE_IMPORT#job-1");
      expect(updateItem.Key.SK).toBe("METADATA");
      expect(updateItem.ExpressionAttributeValues[":phase"]).toBe("sync");
      expect(updateItem.ExpressionAttributeValues[":now"]).toBeDefined();
      expect(updateItem.UpdateExpression).toContain("#phase = :phase");
    });
  });
});
