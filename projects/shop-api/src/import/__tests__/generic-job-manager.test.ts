import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());
const mockRandomUUID = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.IMPORT_TABLE_NAME = "test-import-table";
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: class {
      send = mockSend;
    },
  };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: () => ({ send: mockSend }),
    },
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
  };
});

vi.stubGlobal("crypto", { randomUUID: mockRandomUUID });

import { createJobManager } from "../generic-job-manager";
import type { ProgressCounts } from "../generic-job-manager";

describe("generic-job-manager", () => {
  const TEST_PREFIX = "ACCOUNT_IMPORT";
  const TEST_JOB_ID = "test-uuid-1234-5678-abcd";
  const TEST_NOW = "2025-01-15T10:00:00.000Z";

  let jobManager: ReturnType<typeof createJobManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TEST_NOW));
    mockRandomUUID.mockReturnValue(TEST_JOB_ID);
    jobManager = createJobManager({ prefix: TEST_PREFIX });
  });

  describe("createJob", () => {
    it("creates a job with UUID, initial state running, phase fetch, and zero progress", async () => {
      mockSend.mockResolvedValueOnce({});

      const job = await jobManager.createJob({ createdAfter: "2025-01-01T00:00:00.000Z" });

      expect(job).toEqual({
        jobId: TEST_JOB_ID,
        state: "running",
        phase: "fetch",
        startedAt: TEST_NOW,
        lastUpdatedAt: TEST_NOW,
        filterParams: { createdAfter: "2025-01-01T00:00:00.000Z" },
        progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
      });
    });

    it("stores the job in DynamoDB with correct PK pattern using prefix", async () => {
      mockSend.mockResolvedValueOnce({});

      await jobManager.createJob({});

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.input).toEqual({
        TableName: "test-import-table",
        Item: {
          PK: `${TEST_PREFIX}#${TEST_JOB_ID}`,
          SK: "METADATA",
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: TEST_NOW,
          lastUpdatedAt: TEST_NOW,
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
    });
  });

  describe("getJob", () => {
    it("returns the job when found", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: `${TEST_PREFIX}#${TEST_JOB_ID}`,
          SK: "METADATA",
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: TEST_NOW,
          lastUpdatedAt: TEST_NOW,
          filterParams: { createdAfter: "2025-01-01T00:00:00.000Z" },
          progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
        },
      });

      const result = await jobManager.getJob(TEST_JOB_ID);

      expect(result).toEqual({
        jobId: TEST_JOB_ID,
        state: "running",
        phase: "fetch",
        startedAt: TEST_NOW,
        lastUpdatedAt: TEST_NOW,
        filterParams: { createdAfter: "2025-01-01T00:00:00.000Z" },
        error: undefined,
        progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.input).toEqual({
        TableName: "test-import-table",
        Key: {
          PK: `${TEST_PREFIX}#${TEST_JOB_ID}`,
          SK: "METADATA",
        },
      });
    });

    it("returns null when item not found", async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await jobManager.getJob(TEST_JOB_ID);

      expect(result).toBeNull();
    });
  });

  describe("getRunningOrPausedJob", () => {
    it("returns the job when a running/paused job exists", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            jobId: TEST_JOB_ID,
            state: "running",
            phase: "fetch",
            startedAt: TEST_NOW,
            lastUpdatedAt: TEST_NOW,
            filterParams: {},
            progress: { processed: 5, imported: 5, skipped: 0, failed: 0 },
          },
        ],
        LastEvaluatedKey: undefined,
      });

      const result = await jobManager.getRunningOrPausedJob();

      expect(result).toEqual({
        jobId: TEST_JOB_ID,
        state: "running",
        phase: "fetch",
        startedAt: TEST_NOW,
        lastUpdatedAt: TEST_NOW,
        filterParams: {},
        error: undefined,
        progress: { processed: 5, imported: 5, skipped: 0, failed: 0 },
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.input.FilterExpression).toContain("begins_with(PK, :pkPrefix)");
      expect(call.input.ExpressionAttributeValues[":pkPrefix"]).toBe(`${TEST_PREFIX}#`);
      expect(call.input.ExpressionAttributeValues[":running"]).toBe("running");
      expect(call.input.ExpressionAttributeValues[":paused"]).toBe("paused");
    });

    it("returns null when no running/paused job exists", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: undefined,
      });

      const result = await jobManager.getRunningOrPausedJob();

      expect(result).toBeNull();
    });
  });

  describe("transitionJob", () => {
    const progress: ProgressCounts = { processed: 10, imported: 8, skipped: 1, failed: 1 };

    it("transitions running → paused", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: TEST_NOW,
          lastUpdatedAt: TEST_NOW,
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.transitionJob(TEST_JOB_ID, "paused", progress);

      expect(mockSend).toHaveBeenCalledTimes(2);
      const updateCall = mockSend.mock.calls[1][0];
      expect(updateCall.input.ExpressionAttributeValues[":state"]).toBe("paused");
      expect(updateCall.input.ExpressionAttributeValues[":progress"]).toEqual(progress);
    });

    it("transitions running → failed", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: TEST_NOW,
          lastUpdatedAt: TEST_NOW,
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.transitionJob(TEST_JOB_ID, "failed", progress, "Something went wrong");

      const updateCall = mockSend.mock.calls[1][0];
      expect(updateCall.input.ExpressionAttributeValues[":state"]).toBe("failed");
      expect(updateCall.input.ExpressionAttributeValues[":error"]).toBe("Something went wrong");
    });

    it("transitions running → complete", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: TEST_NOW,
          lastUpdatedAt: TEST_NOW,
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.transitionJob(TEST_JOB_ID, "complete", progress);

      const updateCall = mockSend.mock.calls[1][0];
      expect(updateCall.input.ExpressionAttributeValues[":state"]).toBe("complete");
    });

    it("transitions paused → running", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "paused",
          phase: "fetch",
          startedAt: TEST_NOW,
          lastUpdatedAt: TEST_NOW,
          filterParams: {},
          progress: { processed: 5, imported: 5, skipped: 0, failed: 0 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.transitionJob(TEST_JOB_ID, "running", progress);

      const updateCall = mockSend.mock.calls[1][0];
      expect(updateCall.input.ExpressionAttributeValues[":state"]).toBe("running");
    });

    it("transitions failed → running", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "failed",
          phase: "fetch",
          startedAt: TEST_NOW,
          lastUpdatedAt: TEST_NOW,
          filterParams: {},
          error: "Previous failure",
          progress: { processed: 3, imported: 2, skipped: 0, failed: 1 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.transitionJob(TEST_JOB_ID, "running", progress);

      const updateCall = mockSend.mock.calls[1][0];
      expect(updateCall.input.ExpressionAttributeValues[":state"]).toBe("running");
    });

    it("throws on invalid transition: paused → complete", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "paused",
          phase: "fetch",
          startedAt: TEST_NOW,
          lastUpdatedAt: TEST_NOW,
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });

      await expect(
        jobManager.transitionJob(TEST_JOB_ID, "complete", progress),
      ).rejects.toThrow("Invalid state transition: cannot transition from 'paused' to 'complete'");
    });

    it("throws on invalid transition: complete → running", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "complete",
          phase: "fetch",
          startedAt: TEST_NOW,
          lastUpdatedAt: TEST_NOW,
          filterParams: {},
          progress: { processed: 10, imported: 10, skipped: 0, failed: 0 },
        },
      });

      await expect(
        jobManager.transitionJob(TEST_JOB_ID, "running", progress),
      ).rejects.toThrow("Invalid state transition: cannot transition from 'complete' to 'running'");
    });

    it("throws when job not found", async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      await expect(
        jobManager.transitionJob(TEST_JOB_ID, "paused", progress),
      ).rejects.toThrow(`Job ${TEST_JOB_ID} not found`);
    });

    it("truncates error message to 500 characters", async () => {
      const longError = "x".repeat(1000);

      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: TEST_NOW,
          lastUpdatedAt: TEST_NOW,
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.transitionJob(TEST_JOB_ID, "failed", progress, longError);

      const updateCall = mockSend.mock.calls[1][0];
      expect(updateCall.input.ExpressionAttributeValues[":error"]).toBe("x".repeat(500));
    });
  });

  describe("updateJobPhase", () => {
    it("updates the phase and lastUpdatedAt", async () => {
      mockSend.mockResolvedValueOnce({});

      await jobManager.updateJobPhase(TEST_JOB_ID, "sync");

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.input).toEqual({
        TableName: "test-import-table",
        Key: {
          PK: `${TEST_PREFIX}#${TEST_JOB_ID}`,
          SK: "METADATA",
        },
        UpdateExpression: "SET #phase = :phase, lastUpdatedAt = :lastUpdatedAt",
        ExpressionAttributeNames: {
          "#phase": "phase",
        },
        ExpressionAttributeValues: {
          ":phase": "sync",
          ":lastUpdatedAt": TEST_NOW,
        },
      });
    });
  });
});
