import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Checkpoint } from "../../src/import/checkpoint-manager";

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

describe("checkpoint-manager", () => {
  let saveCheckpoint: typeof import("../../src/import/checkpoint-manager").saveCheckpoint;
  let loadCheckpoint: typeof import("../../src/import/checkpoint-manager").loadCheckpoint;

  beforeEach(async () => {
    vi.stubEnv("IMPORT_TABLE_NAME", "test-import-table");
    mockSend.mockReset();
    vi.resetModules();
    vi.useRealTimers();
    const mod = await import("../../src/import/checkpoint-manager");
    saveCheckpoint = mod.saveCheckpoint;
    loadCheckpoint = mod.loadCheckpoint;
  });

  describe("saveCheckpoint", () => {
    it("writes correct record with PK, SK, and all fields", async () => {
      mockSend.mockResolvedValue({});

      const checkpoint: Checkpoint = {
        jobId: "job-abc-123",
        cursor: "cursor-xyz",
        progress: { processed: 100, imported: 80, skipped: 15, failed: 5 },
        lastUpdatedAt: "2026-03-15T10:30:00.000Z",
      };

      await saveCheckpoint(checkpoint);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const putCommand = mockSend.mock.calls[0][0];
      expect(putCommand.input.TableName).toBe("test-import-table");
      expect(putCommand.input.Item.PK).toBe("ITEM_IMPORT#job-abc-123");
      expect(putCommand.input.Item.SK).toBe("CHECKPOINT");
      expect(putCommand.input.Item.jobId).toBe("job-abc-123");
      expect(putCommand.input.Item.cursor).toBe("cursor-xyz");
      expect(putCommand.input.Item.progress).toEqual({
        processed: 100,
        imported: 80,
        skipped: 15,
        failed: 5,
      });
      expect(putCommand.input.Item.lastUpdatedAt).toBe(
        "2026-03-15T10:30:00.000Z",
      );
    });

    it("retries once on failure then succeeds", async () => {
      mockSend
        .mockRejectedValueOnce(new Error("DynamoDB throttled"))
        .mockResolvedValueOnce({});

      const checkpoint: Checkpoint = {
        jobId: "job-retry-1",
        cursor: "c1",
        progress: { processed: 10, imported: 10, skipped: 0, failed: 0 },
        lastUpdatedAt: "2026-01-01T00:00:00.000Z",
      };

      vi.useFakeTimers();
      const promise = saveCheckpoint(checkpoint);
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("retries twice then succeeds", async () => {
      mockSend
        .mockRejectedValueOnce(new Error("DynamoDB error 1"))
        .mockRejectedValueOnce(new Error("DynamoDB error 2"))
        .mockResolvedValueOnce({});

      const checkpoint: Checkpoint = {
        jobId: "job-retry-2",
        cursor: "c2",
        progress: { processed: 20, imported: 15, skipped: 3, failed: 2 },
        lastUpdatedAt: "2026-02-01T00:00:00.000Z",
      };

      vi.useFakeTimers();
      const promise = saveCheckpoint(checkpoint);
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it("exhausts all 3 retries and throws the last error", async () => {
      const error1 = new Error("DynamoDB error 1");
      const error2 = new Error("DynamoDB error 2");
      const error3 = new Error("DynamoDB error 3");

      mockSend
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2)
        .mockRejectedValueOnce(error3);

      const checkpoint: Checkpoint = {
        jobId: "job-exhaust",
        cursor: "c3",
        progress: { processed: 5, imported: 5, skipped: 0, failed: 0 },
        lastUpdatedAt: "2026-03-01T00:00:00.000Z",
      };

      vi.useFakeTimers();
      const promise = saveCheckpoint(checkpoint);

      // Attach rejection handler immediately to prevent unhandled rejection
      let caughtError: unknown;
      const handled = promise.catch((e: unknown) => {
        caughtError = e;
      });

      // Advance past both retry delays (attempt 1 fails -> 500ms -> attempt 2 fails -> 500ms -> attempt 3 fails -> throw)
      await vi.advanceTimersByTimeAsync(1000);
      await handled;

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe("DynamoDB error 3");
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it("uses 500ms delay between retries", async () => {
      mockSend
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({});

      const checkpoint: Checkpoint = {
        jobId: "job-timing",
        cursor: "ct",
        progress: { processed: 1, imported: 1, skipped: 0, failed: 0 },
        lastUpdatedAt: "2026-04-01T00:00:00.000Z",
      };

      vi.useFakeTimers();
      const promise = saveCheckpoint(checkpoint);

      // After first failure, the retry should not have happened yet
      await vi.advanceTimersByTimeAsync(499);
      expect(mockSend).toHaveBeenCalledTimes(1);

      // After 500ms total, the retry should occur
      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("loadCheckpoint", () => {
    it("returns Checkpoint for existing record", async () => {
      mockSend.mockResolvedValue({
        Item: {
          PK: "ITEM_IMPORT#job-load-1",
          SK: "CHECKPOINT",
          jobId: "job-load-1",
          cursor: "cursor-page-5",
          progress: { processed: 500, imported: 450, skipped: 30, failed: 20 },
          lastUpdatedAt: "2026-05-10T12:00:00.000Z",
        },
      });

      const result = await loadCheckpoint("job-load-1");

      expect(result).not.toBeNull();
      expect(result!.jobId).toBe("job-load-1");
      expect(result!.cursor).toBe("cursor-page-5");
      expect(result!.progress).toEqual({
        processed: 500,
        imported: 450,
        skipped: 30,
        failed: 20,
      });
      expect(result!.lastUpdatedAt).toBe("2026-05-10T12:00:00.000Z");

      // Verify correct key was used in the GetCommand
      const getCommand = mockSend.mock.calls[0][0];
      expect(getCommand.input.TableName).toBe("test-import-table");
      expect(getCommand.input.Key.PK).toBe("ITEM_IMPORT#job-load-1");
      expect(getCommand.input.Key.SK).toBe("CHECKPOINT");
    });

    it("returns null for missing record", async () => {
      mockSend.mockResolvedValue({});

      const result = await loadCheckpoint("non-existent-job");

      expect(result).toBeNull();

      const getCommand = mockSend.mock.calls[0][0];
      expect(getCommand.input.Key.PK).toBe("ITEM_IMPORT#non-existent-job");
      expect(getCommand.input.Key.SK).toBe("CHECKPOINT");
    });
  });
});
