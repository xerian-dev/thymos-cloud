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
    QueryCommand: class {
      constructor(public input: unknown) {}
    },
    UpdateCommand: class {
      constructor(public input: unknown) {}
    },
    TransactWriteCommand: class {
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

      const job = await jobManager.createJob({
        createdAfter: "2025-01-01T00:00:00.000Z",
      });

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
        TransactItems: [
          {
            Put: {
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
            },
          },
          {
            Put: {
              TableName: "test-import-table",
              Item: {
                PK: "JOBS",
                SK: `${TEST_PREFIX}#${TEST_NOW}#${TEST_JOB_ID}`,
                jobId: TEST_JOB_ID,
                state: "running",
                phase: "fetch",
                progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
                startedAt: TEST_NOW,
                lastUpdatedAt: TEST_NOW,
                prefix: TEST_PREFIX,
              },
            },
          },
        ],
      });
    });

    it("includes a pointer record with PK 'JOBS' and SK matching <PREFIX>#<timestamp>#<jobId>", async () => {
      mockSend.mockResolvedValueOnce({});

      await jobManager.createJob({ createdAfter: "2025-01-01T00:00:00.000Z" });

      const call = mockSend.mock.calls[0][0];
      const pointerPut = call.input.TransactItems[1].Put;

      expect(pointerPut.Item.PK).toBe("JOBS");
      expect(pointerPut.Item.SK).toBe(
        `${TEST_PREFIX}#${TEST_NOW}#${TEST_JOB_ID}`,
      );
    });

    it("pointer record fields match the corresponding metadata record fields", async () => {
      mockSend.mockResolvedValueOnce({});

      await jobManager.createJob({ createdAfter: "2025-01-01T00:00:00.000Z" });

      const call = mockSend.mock.calls[0][0];
      const metadataItem = call.input.TransactItems[0].Put.Item;
      const pointerItem = call.input.TransactItems[1].Put.Item;

      expect(pointerItem.jobId).toBe(metadataItem.jobId);
      expect(pointerItem.state).toBe(metadataItem.state);
      expect(pointerItem.phase).toBe(metadataItem.phase);
      expect(pointerItem.progress).toEqual(metadataItem.progress);
      expect(pointerItem.startedAt).toBe(metadataItem.startedAt);
      expect(pointerItem.lastUpdatedAt).toBe(metadataItem.lastUpdatedAt);
      expect(pointerItem.prefix).toBe(TEST_PREFIX);
    });

    it("transaction contains exactly 2 Put operations (metadata + pointer)", async () => {
      mockSend.mockResolvedValueOnce({});

      await jobManager.createJob({});

      const call = mockSend.mock.calls[0][0];
      const transactItems = call.input.TransactItems;

      expect(transactItems).toHaveLength(2);
      expect(transactItems[0]).toHaveProperty("Put");
      expect(transactItems[1]).toHaveProperty("Put");
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
            progress: { processed: 5, imported: 5, skipped: 0, failed: 0 },
            prefix: TEST_PREFIX,
          },
        ],
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
      expect(call.input.KeyConditionExpression).toBe(
        "PK = :pk AND begins_with(SK, :skPrefix)",
      );
      expect(call.input.FilterExpression).toBe(
        "#state = :running OR #state = :paused",
      );
      expect(call.input.ExpressionAttributeNames).toEqual({
        "#state": "state",
      });
      expect(call.input.ExpressionAttributeValues).toEqual({
        ":pk": "JOBS",
        ":skPrefix": `${TEST_PREFIX}#`,
        ":running": "running",
        ":paused": "paused",
      });
      expect(call.input.ScanIndexForward).toBe(false);
    });

    it("returns null when no running/paused job exists", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
      });

      const result = await jobManager.getRunningOrPausedJob();

      expect(result).toBeNull();
    });

    it("filter expression excludes cancelled, complete, and failed states — only allows running or paused", async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await jobManager.getRunningOrPausedJob();

      const call = mockSend.mock.calls[0][0];
      const filterExpr = call.input.FilterExpression as string;
      const attrValues = call.input.ExpressionAttributeValues as Record<
        string,
        string
      >;

      // The filter only includes running and paused — cancelled, complete, and failed
      // are implicitly excluded because the filter is an allowlist (OR), not a denylist.
      expect(filterExpr).toBe("#state = :running OR #state = :paused");
      expect(attrValues[":running"]).toBe("running");
      expect(attrValues[":paused"]).toBe("paused");

      // Ensure no reference to cancelled/complete/failed in the filter values
      const filterValues = Object.values(attrValues).filter(
        (v) => v !== "JOBS" && !v.startsWith(TEST_PREFIX),
      );
      expect(filterValues).not.toContain("cancelled");
      expect(filterValues).not.toContain("complete");
      expect(filterValues).not.toContain("failed");
    });
  });

  describe("transitionJob", () => {
    const progress: ProgressCounts = {
      processed: 10,
      imported: 8,
      skipped: 1,
      failed: 1,
    };

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
      const transactCall = mockSend.mock.calls[1][0];
      const transactItems = transactCall.input.TransactItems;
      expect(transactItems).toHaveLength(3);
      expect(transactItems[0].Update.ExpressionAttributeValues[":state"]).toBe(
        "paused",
      );
      expect(
        transactItems[0].Update.ExpressionAttributeValues[":progress"],
      ).toEqual(progress);
      expect(transactItems[1].Delete.Key).toEqual({
        PK: "JOBS",
        SK: `${TEST_PREFIX}#${TEST_NOW}#${TEST_JOB_ID}`,
      });
      expect(transactItems[2].Put.Item.state).toBe("paused");
      expect(transactItems[2].Put.Item.PK).toBe("JOBS");
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

      await jobManager.transitionJob(
        TEST_JOB_ID,
        "failed",
        progress,
        "Something went wrong",
      );

      const transactCall = mockSend.mock.calls[1][0];
      const transactItems = transactCall.input.TransactItems;
      expect(transactItems[0].Update.ExpressionAttributeValues[":state"]).toBe(
        "failed",
      );
      expect(transactItems[0].Update.ExpressionAttributeValues[":error"]).toBe(
        "Something went wrong",
      );
      expect(transactItems[2].Put.Item.state).toBe("failed");
      expect(transactItems[2].Put.Item.error).toBe("Something went wrong");
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

      const transactCall = mockSend.mock.calls[1][0];
      const transactItems = transactCall.input.TransactItems;
      expect(transactItems[0].Update.ExpressionAttributeValues[":state"]).toBe(
        "complete",
      );
      expect(transactItems[2].Put.Item.state).toBe("complete");
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

      const transactCall = mockSend.mock.calls[1][0];
      const transactItems = transactCall.input.TransactItems;
      expect(transactItems[0].Update.ExpressionAttributeValues[":state"]).toBe(
        "running",
      );
      expect(transactItems[2].Put.Item.state).toBe("running");
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

      const transactCall = mockSend.mock.calls[1][0];
      const transactItems = transactCall.input.TransactItems;
      expect(transactItems[0].Update.ExpressionAttributeValues[":state"]).toBe(
        "running",
      );
      expect(transactItems[2].Put.Item.state).toBe("running");
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
      ).rejects.toThrow(
        "Invalid state transition: cannot transition from 'paused' to 'complete'",
      );
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
      ).rejects.toThrow(
        "Invalid state transition: cannot transition from 'complete' to 'running'",
      );
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

      await jobManager.transitionJob(
        TEST_JOB_ID,
        "failed",
        progress,
        longError,
      );

      const transactCall = mockSend.mock.calls[1][0];
      const transactItems = transactCall.input.TransactItems;
      expect(transactItems[0].Update.ExpressionAttributeValues[":error"]).toBe(
        "x".repeat(500),
      );
      expect(transactItems[2].Put.Item.error).toBe("x".repeat(500));
    });
  });

  describe("updateJobPhase", () => {
    const OLD_TIMESTAMP = "2025-01-15T09:00:00.000Z";

    it("calls getJob then TransactWriteCommand with update, delete old pointer, and put new pointer", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: OLD_TIMESTAMP,
          lastUpdatedAt: OLD_TIMESTAMP,
          filterParams: {},
          progress: { processed: 5, imported: 3, skipped: 1, failed: 1 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.updateJobPhase(TEST_JOB_ID, "sync");

      expect(mockSend).toHaveBeenCalledTimes(2);

      // First call is GetCommand
      const getCall = mockSend.mock.calls[0][0];
      expect(getCall.input).toEqual({
        TableName: "test-import-table",
        Key: {
          PK: `${TEST_PREFIX}#${TEST_JOB_ID}`,
          SK: "METADATA",
        },
      });

      // Second call is TransactWriteCommand with 3 items
      const transactCall = mockSend.mock.calls[1][0];
      const transactItems = transactCall.input.TransactItems;
      expect(transactItems).toHaveLength(3);
      expect(transactItems[0]).toHaveProperty("Update");
      expect(transactItems[1]).toHaveProperty("Delete");
      expect(transactItems[2]).toHaveProperty("Put");
    });

    it("deletes old pointer with SK based on old lastUpdatedAt and creates new pointer with current timestamp", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: OLD_TIMESTAMP,
          lastUpdatedAt: OLD_TIMESTAMP,
          filterParams: {},
          progress: { processed: 5, imported: 3, skipped: 1, failed: 1 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.updateJobPhase(TEST_JOB_ID, "sync");

      const transactCall = mockSend.mock.calls[1][0];
      const transactItems = transactCall.input.TransactItems;

      // Delete uses old timestamp in SK
      expect(transactItems[1].Delete.Key).toEqual({
        PK: "JOBS",
        SK: `${TEST_PREFIX}#${OLD_TIMESTAMP}#${TEST_JOB_ID}`,
      });

      // Put uses new timestamp (TEST_NOW) in SK
      expect(transactItems[2].Put.Item.PK).toBe("JOBS");
      expect(transactItems[2].Put.Item.SK).toBe(
        `${TEST_PREFIX}#${TEST_NOW}#${TEST_JOB_ID}`,
      );
    });

    it("new pointer contains updated phase and lastUpdatedAt while preserving other fields", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: OLD_TIMESTAMP,
          lastUpdatedAt: OLD_TIMESTAMP,
          filterParams: {},
          progress: { processed: 5, imported: 3, skipped: 1, failed: 1 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.updateJobPhase(TEST_JOB_ID, "sync");

      const transactCall = mockSend.mock.calls[1][0];
      const pointerItem = transactCall.input.TransactItems[2].Put.Item;

      expect(pointerItem.phase).toBe("sync");
      expect(pointerItem.lastUpdatedAt).toBe(TEST_NOW);
      expect(pointerItem.state).toBe("running");
      expect(pointerItem.progress).toEqual({
        processed: 5,
        imported: 3,
        skipped: 1,
        failed: 1,
      });
      expect(pointerItem.jobId).toBe(TEST_JOB_ID);
      expect(pointerItem.startedAt).toBe(OLD_TIMESTAMP);
      expect(pointerItem.prefix).toBe(TEST_PREFIX);
    });

    it("preserves error field on pointer when current job has an error", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: OLD_TIMESTAMP,
          lastUpdatedAt: OLD_TIMESTAMP,
          filterParams: {},
          error: "Previous error",
          progress: { processed: 5, imported: 3, skipped: 1, failed: 1 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.updateJobPhase(TEST_JOB_ID, "sync");

      const transactCall = mockSend.mock.calls[1][0];
      const pointerItem = transactCall.input.TransactItems[2].Put.Item;

      expect(pointerItem.error).toBe("Previous error");
    });

    it("throws error when job does not exist and does not issue TransactWriteCommand", async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      await expect(
        jobManager.updateJobPhase(TEST_JOB_ID, "sync"),
      ).rejects.toThrow(`Job ${TEST_JOB_ID} not found`);

      // Only GetCommand was called, no TransactWriteCommand
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("transitionJob - pointer maintenance", () => {
    const OLD_TIMESTAMP = "2025-01-15T09:00:00.000Z";
    const progress: ProgressCounts = {
      processed: 10,
      imported: 8,
      skipped: 1,
      failed: 1,
    };

    it("deletes old pointer with SK based on old lastUpdatedAt", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: OLD_TIMESTAMP,
          lastUpdatedAt: OLD_TIMESTAMP,
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.transitionJob(TEST_JOB_ID, "paused", progress);

      const transactCall = mockSend.mock.calls[1][0];
      const deleteItem = transactCall.input.TransactItems[1];

      expect(deleteItem.Delete.Key).toEqual({
        PK: "JOBS",
        SK: `${TEST_PREFIX}#${OLD_TIMESTAMP}#${TEST_JOB_ID}`,
      });
    });

    it("creates new pointer with SK containing the new lastUpdatedAt (not the old one)", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "fetch",
          startedAt: OLD_TIMESTAMP,
          lastUpdatedAt: OLD_TIMESTAMP,
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.transitionJob(TEST_JOB_ID, "paused", progress);

      const transactCall = mockSend.mock.calls[1][0];
      const putItem = transactCall.input.TransactItems[2];

      expect(putItem.Put.Item.SK).toBe(
        `${TEST_PREFIX}#${TEST_NOW}#${TEST_JOB_ID}`,
      );
      expect(putItem.Put.Item.lastUpdatedAt).toBe(TEST_NOW);
    });

    it("new pointer fields reflect transition parameters (state, progress, error)", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          jobId: TEST_JOB_ID,
          state: "running",
          phase: "sync",
          startedAt: OLD_TIMESTAMP,
          lastUpdatedAt: OLD_TIMESTAMP,
          filterParams: {},
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        },
      });
      mockSend.mockResolvedValueOnce({});

      await jobManager.transitionJob(
        TEST_JOB_ID,
        "failed",
        progress,
        "Connection timeout",
      );

      const transactCall = mockSend.mock.calls[1][0];
      const pointerItem = transactCall.input.TransactItems[2].Put.Item;

      expect(pointerItem.state).toBe("failed");
      expect(pointerItem.progress).toEqual(progress);
      expect(pointerItem.error).toBe("Connection timeout");
      expect(pointerItem.phase).toBe("sync");
      expect(pointerItem.jobId).toBe(TEST_JOB_ID);
      expect(pointerItem.startedAt).toBe(OLD_TIMESTAMP);
      expect(pointerItem.prefix).toBe(TEST_PREFIX);
    });

    it("does not issue TransactWriteCommand when job is not found", async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      await expect(
        jobManager.transitionJob(TEST_JOB_ID, "paused", progress),
      ).rejects.toThrow(`Job ${TEST_JOB_ID} not found`);

      // Only GetCommand was issued, no TransactWriteCommand
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
