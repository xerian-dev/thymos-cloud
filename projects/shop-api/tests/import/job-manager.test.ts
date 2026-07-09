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
}));

describe("job-manager unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockReset();
  });

  describe("createJob", () => {
    it("returns a valid ImportJob with correct structure", async () => {
      sendMock.mockResolvedValueOnce({}); // PutCommand response

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

    it("sends correct DynamoDB PutCommand with PK format ITEM_IMPORT#<uuid> and SK METADATA", async () => {
      sendMock.mockResolvedValueOnce({});

      const { createJob } = await import("../../src/import/job-manager");
      const job = await createJob({});

      expect(sendMock).toHaveBeenCalledTimes(1);
      const putCmd = sendMock.mock.calls[0][0];
      expect(putCmd._type).toBe("Put");
      expect(putCmd.input.Item.PK).toBe(`ITEM_IMPORT#${job.jobId}`);
      expect(putCmd.input.Item.SK).toBe("METADATA");
      expect(putCmd.input.Item.jobId).toBe(job.jobId);
      expect(putCmd.input.Item.state).toBe("running");
      expect(putCmd.input.Item.startedAt).toBe(job.startedAt);
      expect(putCmd.input.Item.lastUpdatedAt).toBe(job.lastUpdatedAt);
      expect(putCmd.input.Item.progress).toEqual({
        processed: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
      });
      expect(putCmd.input.Item.filterParams).toEqual({});
    });

    it("includes createdAfter in filterParams when provided", async () => {
      sendMock.mockResolvedValueOnce({});

      const { createJob } = await import("../../src/import/job-manager");
      const job = await createJob({ createdAfter: "2026-01-01" });

      expect(job.filterParams).toEqual({ createdAfter: "2026-01-01" });

      const putCmd = sendMock.mock.calls[0][0];
      expect(putCmd.input.Item.filterParams).toEqual({
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
      const mockJob = {
        jobId: "active-job-id",
        state: "running",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:05:00.000Z",
        filterParams: {},
        progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
      };

      sendMock.mockResolvedValueOnce({
        Items: [mockJob],
        LastEvaluatedKey: undefined,
      });

      const { getRunningOrPausedJob } =
        await import("../../src/import/job-manager");
      const result = await getRunningOrPausedJob();

      expect(result).not.toBeNull();
      expect(result!.jobId).toBe("active-job-id");
      expect(result!.state).toBe("running");
    });

    it("returns null when no active jobs exist", async () => {
      sendMock.mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: undefined,
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
          startedAt: "2026-01-15T10:00:00.000Z",
          lastUpdatedAt: "2026-01-15T10:00:00.000Z",
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      // UpdateCommand response
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
      const updateCmd = sendMock.mock.calls[1][0];
      expect(updateCmd._type).toBe("Update");
      expect(updateCmd.input.Key.PK).toBe("ITEM_IMPORT#job-123");
      expect(updateCmd.input.Key.SK).toBe("METADATA");
      expect(updateCmd.input.ExpressionAttributeValues[":state"]).toBe(
        "complete",
      );
      expect(updateCmd.input.ExpressionAttributeValues[":progress"]).toEqual(
        progress,
      );
    });

    it("rejects invalid transition from complete to paused", async () => {
      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "job-456",
          state: "complete",
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

      // Only the GetCommand should have been called (no UpdateCommand)
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("truncates error to 500 characters", async () => {
      sendMock.mockResolvedValueOnce({
        Item: {
          jobId: "job-789",
          state: "running",
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

      const updateCmd = sendMock.mock.calls[1][0];
      expect(updateCmd._type).toBe("Update");
      expect(updateCmd.input.ExpressionAttributeValues[":error"]).toBe(
        "x".repeat(500),
      );
      expect(updateCmd.input.ExpressionAttributeValues[":error"].length).toBe(
        500,
      );
    });
  });
});
