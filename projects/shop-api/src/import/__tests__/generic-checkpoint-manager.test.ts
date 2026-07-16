import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  DynamoDBDocumentClient: {
    from: () => ({ send: mockSend }),
  },
  PutCommand: class {
    constructor(public params: unknown) {}
  },
  GetCommand: class {
    constructor(public params: unknown) {}
  },
}));

import { createCheckpointManager } from "../generic-checkpoint-manager";
import type { Checkpoint } from "../generic-checkpoint-manager";

describe("generic-checkpoint-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const checkpoint: Checkpoint = {
    jobId: "job-123",
    cursor: "cursor-abc",
    progress: { processed: 50, imported: 45, skipped: 3, failed: 2 },
    lastUpdatedAt: "2025-01-15T10:00:00.000Z",
  };

  describe("saveCheckpoint", () => {
    it("persists cursor, progress, and timestamp with correct PK pattern", async () => {
      const manager = createCheckpointManager({ prefix: "ACCOUNT_IMPORT" });
      mockSend.mockResolvedValueOnce({});

      await manager.saveCheckpoint(checkpoint);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.params).toEqual({
        TableName: "test-import-table",
        Item: {
          PK: "ACCOUNT_IMPORT#job-123",
          SK: "CHECKPOINT",
          jobId: "job-123",
          cursor: "cursor-abc",
          progress: { processed: 50, imported: 45, skipped: 3, failed: 2 },
          lastUpdatedAt: "2025-01-15T10:00:00.000Z",
        },
      });
    });

    it("uses the configured prefix in the PK", async () => {
      const manager = createCheckpointManager({ prefix: "SALE_IMPORT" });
      mockSend.mockResolvedValueOnce({});

      await manager.saveCheckpoint(checkpoint);

      const command = mockSend.mock.calls[0][0];
      expect(command.params.Item.PK).toBe("SALE_IMPORT#job-123");
      expect(command.params.Item.SK).toBe("CHECKPOINT");
    });

    it("retries on failure and succeeds on second attempt", async () => {
      const manager = createCheckpointManager({ prefix: "ITEM_IMPORT" });
      mockSend
        .mockRejectedValueOnce(new Error("ServiceUnavailable"))
        .mockResolvedValueOnce({});

      const promise = manager.saveCheckpoint(checkpoint);

      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("throws after 3 failed retry attempts", async () => {
      const manager = createCheckpointManager({ prefix: "ACCOUNT_IMPORT" });
      mockSend
        .mockRejectedValueOnce(new Error("Failure 1"))
        .mockRejectedValueOnce(new Error("Failure 2"))
        .mockRejectedValueOnce(new Error("PersistentFailure"));

      const promise = manager.saveCheckpoint(checkpoint);

      // Attach rejection handler immediately to prevent unhandled rejection
      const resultPromise = promise.catch((e: Error) => e);

      // Advance past both retry delays (500ms each) to reach the third attempt
      await vi.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("PersistentFailure");
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it("waits 500ms between retry attempts", async () => {
      const manager = createCheckpointManager({ prefix: "ACCOUNT_IMPORT" });
      mockSend
        .mockRejectedValueOnce(new Error("Failure 1"))
        .mockRejectedValueOnce(new Error("Failure 2"))
        .mockResolvedValueOnce({});

      const promise = manager.saveCheckpoint(checkpoint);

      // After first failure, only 1 call made so far
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Advance past first 500ms delay
      await vi.advanceTimersByTimeAsync(500);
      expect(mockSend).toHaveBeenCalledTimes(2);

      // Advance past second 500ms delay
      await vi.advanceTimersByTimeAsync(500);
      await promise;
      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  describe("loadCheckpoint", () => {
    it("returns checkpoint when item exists", async () => {
      const manager = createCheckpointManager({ prefix: "ACCOUNT_IMPORT" });
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: "ACCOUNT_IMPORT#job-123",
          SK: "CHECKPOINT",
          jobId: "job-123",
          cursor: "cursor-abc",
          progress: { processed: 50, imported: 45, skipped: 3, failed: 2 },
          lastUpdatedAt: "2025-01-15T10:00:00.000Z",
        },
      });

      const result = await manager.loadCheckpoint("job-123");

      expect(result).toEqual({
        jobId: "job-123",
        cursor: "cursor-abc",
        progress: { processed: 50, imported: 45, skipped: 3, failed: 2 },
        lastUpdatedAt: "2025-01-15T10:00:00.000Z",
      });
    });

    it("returns null when no checkpoint exists", async () => {
      const manager = createCheckpointManager({ prefix: "ACCOUNT_IMPORT" });
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await manager.loadCheckpoint("job-456");

      expect(result).toBeNull();
    });

    it("uses the correct prefix in the GetCommand key", async () => {
      const manager = createCheckpointManager({ prefix: "ITEM_IMPORT" });
      mockSend.mockResolvedValueOnce({ Item: undefined });

      await manager.loadCheckpoint("job-789");

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.params).toEqual({
        TableName: "test-import-table",
        Key: {
          PK: "ITEM_IMPORT#job-789",
          SK: "CHECKPOINT",
        },
      });
    });
  });
});
