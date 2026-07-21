import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for job-manager.ts
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6
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

describe("job-manager unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockReset();
  });

  describe("createJob", () => {
    it("returns a valid ImportJob with correct structure", async () => {
      sendMock.mockResolvedValueOnce({}); // TransactWriteCommand response

      const { createJob } = await import("../../src/import/job-manager");
      const job = await createJob({});

      expect(job.jobId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(job.state).toBe("running");
      expect(new Date(job.startedAt).toISOString()).toBe(job.startedAt);
      expect(new Date(job.lastUpdatedAt).toISOString()).toBe(job.lastUpdatedAt);
      expect(job.progress).toEqual({
        processed: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
      });
      expect(job.filterParams).toEqual({});
    });

    it("sends correct DynamoDB TransactWriteCommand with PK format ITEM_IMPORT#<uuid> and SK METADATA", async () => {
      sendMock.mockResolvedValueOnce({});

      const { createJob } = await import("../../src/import/job-manager");
      const job = await createJob({});

      expect(sendMock).toHaveBeenCalledTimes(1);
      const txCmd = sendMock.mock.calls[0][0];
      expect(txCmd._type).toBe("TransactWrite");

      // First item: metadata record
      const metadataItem = txCmd.input.TransactItems[0].Put.Item;
      expect(metadataItem.PK).toBe(`ITEM_IMPORT#${job.jobId}`);
      expect(metadataItem.SK).toBe("METADATA");
      expect(metadataItem.jobId).toBe(job.jobId);
      expect(metadataItem.state).toBe("running");
      expect(metadataItem.startedAt).toBe(job.startedAt);
      expect(metadataItem.lastUpdatedAt).toBe(job.lastUpdatedAt);
      expect(metadataItem.progress).toEqual({
        processed: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
      });
      expect(metadataItem.filterParams).toEqual({});

      // Second item: pointer record
      const pointerItem = txCmd.input.TransactItems[1].Put.Item;
      expect(pointerItem.PK).toBe("JOBS");
      expect(pointerItem.SK).toContain("ITEM_IMPORT#");
      expect(pointerItem.jobId).toBe(job.jobId);
    });

    it("includes createdAfter in filterParams when provided", async () => {
      sendMock.mockResolvedValueOnce({});

      const { createJob } = await import("../../src/import/job-manager");
      const job = await createJob({ createdAfter: "2026-01-01" });

      expect(job.filterParams).toEqual({ createdAfter: "2026-01-01" });

      const txCmd = sendMock.mock.calls[0][0];
      const metadataItem = txCmd.input.TransactItems[0].Put.Item;
      expect(metadataItem.filterParams).toEqual({
        createdAfter: "2026-01-01",
      });
    });
  });

  describe("getJob", () => {
    it("returns null for non-existent job", async () => {
      sendMock.mockResolvedValueOnce({ Item: undefined });

      const { getJob } = await import("../../src/import/job-manager");
      const result = await getJob("non-existent-id");

      expect(result).toBeNull();
      expect(sendMock).toHaveBeenCalledTimes(1);
      const getCmd = sendMock.mock.calls[0][0];
      expect(getCmd._type).toBe("Get");
      expect(getCmd.input.Key.PK).toBe("ITEM_IMPORT#non-existent-id");
      expect(getCmd.input.Key.SK).toBe("METADATA");
    });

    it("returns ImportJob for existing job", async () => {
      const mockItem = {
        jobId: "existing-job-id",
        state: "running",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:05:00.000Z",
        filterParams: { createdAfter: "2026-01-01" },
        error: undefined,
        progress: {
          processed: 50,
          imported: 40,
          skipped: 5,
          failed: 5,
        },
      };

      sendMock.mockResolvedValueOnce({ Item: mockItem });

      const { getJob } = await import("../../src/import/job-manager");
      const result = await getJob("existing-job-id");

      expect(result).not.toBeNull();
      expect(result!.jobId).toBe("existing-job-id");
      expect(result!.state).toBe("running");
      expect(result!.startedAt).toBe("2026-01-15T10:00:00.000Z");
      expect(result!.lastUpdatedAt).toBe("2026-01-15T10:05:00.000Z");
      expect(result!.filterParams).toEqual({ createdAfter: "2026-01-01" });
      expect(result!.progress).toEqual({
        processed: 50,
        imported: 40,
        skipped: 5,
        failed: 5,
      });
    });
  });

  describe("getRunningOrPausedJob", () => {
    it("finds an active running job", async () => {
      const mockPointer = {
        PK: "JOBS",
        SK: "ITEM_IMPORT#2026-01-15T10:05:00.000Z#active-job-id",
        jobId: "active-job-id",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:05:00.000Z",
        progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
        prefix: "ITEM_IMPORT",
      };

      sendMock.mockResolvedValueOnce({
        Items: [mockPointer],
      });

      const { getRunningOrPausedJob } =
        await import("../../src/import/job-manager");
      const result = await getRunningOrPausedJob();

      expect(result).not.toBeNull();
      expect(result!.jobId).toBe("active-job-id");
      expect(result!.state).toBe("running");

      // Verify QueryCommand was used
      const queryCmd = sendMock.mock.calls[0][0];
      expect(queryCmd._type).toBe("Query");
      expect(queryCmd.input.KeyConditionExpression).toContain("PK = :pk");
      expect(queryCmd.input.ExpressionAttributeValues[":pk"]).toBe("JOBS");
    });

    it("returns null when no active jobs exist", async () => {
      sendMock.mockResolvedValueOnce({
        Items: [],
      });

      const { getRunningOrPausedJob } =
        await import("../../src/import/job-manager");
      const result = await getRunningOrPausedJob();

      expect(result).toBeNull();
    });
  });

  describe("transitionJob", () => {
    it("updates state correctly from running to complete", async () => {
      // GetCommand returns the current job in "running" state
      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "job-123",
          state: "running",
          phase: "fetch",
          startedAt: "2026-01-15T10:00:00.000Z",
          lastUpdatedAt: "2026-01-15T10:00:00.000Z",
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      // TransactWriteCommand response
      sendMock.mockResolvedValueOnce({});

      const { transitionJob } = await import("../../src/import/job-manager");
      const progress = {
        processed: 100,
        imported: 90,
        skipped: 5,
        failed: 5,
      };

      await expect(
        transitionJob("job-123", "complete", progress),
      ).resolves.toBeUndefined();

      expect(sendMock).toHaveBeenCalledTimes(2);
      const txCmd = sendMock.mock.calls[1][0];
      expect(txCmd._type).toBe("TransactWrite");

      // First item in transaction: Update metadata
      const updateItem = txCmd.input.TransactItems[0].Update;
      expect(updateItem.Key.PK).toBe("ITEM_IMPORT#job-123");
      expect(updateItem.Key.SK).toBe("METADATA");
      expect(updateItem.ExpressionAttributeValues[":state"]).toBe("complete");
      expect(updateItem.ExpressionAttributeValues[":progress"]).toEqual(
        progress,
      );
    });

    it("rejects invalid transition from complete to paused", async () => {
      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "job-456",
          state: "complete",
          phase: "sync",
          startedAt: "2026-01-15T10:00:00.000Z",
          lastUpdatedAt: "2026-01-15T11:00:00.000Z",
          filterParams: {},
          progress: { processed: 100, imported: 90, skipped: 5, failed: 5 },
        },
      });

      const { transitionJob } = await import("../../src/import/job-manager");
      const progress = {
        processed: 100,
        imported: 90,
        skipped: 5,
        failed: 5,
      };

      await expect(
        transitionJob("job-456", "paused", progress),
      ).rejects.toThrow(/[Ii]nvalid.*transition/);

      // Only the GetCommand should have been called (no TransactWriteCommand)
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("truncates error to 500 characters", async () => {
      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "job-789",
          state: "running",
          phase: "fetch",
          startedAt: "2026-01-15T10:00:00.000Z",
          lastUpdatedAt: "2026-01-15T10:00:00.000Z",
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      sendMock.mockResolvedValueOnce({});

      const { transitionJob } = await import("../../src/import/job-manager");
      const longError = "x".repeat(600);
      const progress = { processed: 10, imported: 0, skipped: 0, failed: 10 };

      await transitionJob("job-789", "failed", progress, longError);

      const txCmd = sendMock.mock.calls[1][0];
      expect(txCmd._type).toBe("TransactWrite");
      const updateItem = txCmd.input.TransactItems[0].Update;
      expect(updateItem.ExpressionAttributeValues[":error"]).toBe(
        "x".repeat(500),
      );
      expect(updateItem.ExpressionAttributeValues[":error"].length).toBe(500);
    });
  });
});
