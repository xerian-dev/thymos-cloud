import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.IMPORT_TABLE_NAME = "test-import-table";
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = mockSend;
  },
  ConditionalCheckFailedException: class ConditionalCheckFailedException extends Error {
    constructor(opts?: { message?: string; $metadata?: unknown }) {
      super(opts?.message ?? "Conditional check failed");
      this.name = "ConditionalCheckFailedException";
    }
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
  DeleteCommand: class {
    constructor(public input: unknown) {}
  },
}));

import {
  acquireLock,
  forceAcquireStaleLock,
  releaseLock,
} from "../sync-lock-manager";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

describe("sync-lock-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("acquireLock", () => {
    it("returns acquired: true when no lock exists", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await acquireLock("test-correlation-id");

      expect(result).toEqual({ acquired: true });
      expect(mockSend).toHaveBeenCalledTimes(1);

      const putCall = mockSend.mock.calls[0][0];
      expect(putCall.input).toEqual({
        TableName: "test-import-table",
        Item: {
          PK: "SYNC_LOCK",
          SK: "METADATA",
          lockedAt: "2025-01-15T12:00:00.000Z",
          correlationId: "test-correlation-id",
          ttl:
            Math.floor(new Date("2025-01-15T12:00:00.000Z").getTime() / 1000) +
            3600,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      });
    });

    it("returns acquired: false, stale: false when fresh lock exists (30 min old)", async () => {
      const lockedAt = "2025-01-15T11:30:00.000Z"; // 30 minutes ago

      mockSend
        .mockRejectedValueOnce(
          new ConditionalCheckFailedException({
            message: "Conditional check failed",
            $metadata: {},
          }),
        )
        .mockResolvedValueOnce({
          Item: {
            PK: "SYNC_LOCK",
            SK: "METADATA",
            lockedAt,
            correlationId: "other-run-id",
            ttl: 1736938200,
          },
        });

      const result = await acquireLock("test-correlation-id");

      expect(result).toEqual({
        acquired: false,
        stale: false,
        existingLock: {
          lockedAt,
          correlationId: "other-run-id",
          ttl: 1736938200,
        },
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("returns acquired: false, stale: true when stale lock exists (61 min old)", async () => {
      const lockedAt = "2025-01-15T10:59:00.000Z"; // 61 minutes ago

      mockSend
        .mockRejectedValueOnce(
          new ConditionalCheckFailedException({
            message: "Conditional check failed",
            $metadata: {},
          }),
        )
        .mockResolvedValueOnce({
          Item: {
            PK: "SYNC_LOCK",
            SK: "METADATA",
            lockedAt,
            correlationId: "stale-run-id",
            ttl: 1736935140,
          },
        });

      const result = await acquireLock("test-correlation-id");

      expect(result).toEqual({
        acquired: false,
        stale: true,
        existingLock: {
          lockedAt,
          correlationId: "stale-run-id",
          ttl: 1736935140,
        },
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("returns acquired: false, stale: false when lock is exactly 60 min old", async () => {
      const lockedAt = "2025-01-15T11:00:00.000Z"; // exactly 60 minutes ago

      mockSend
        .mockRejectedValueOnce(
          new ConditionalCheckFailedException({
            message: "Conditional check failed",
            $metadata: {},
          }),
        )
        .mockResolvedValueOnce({
          Item: {
            PK: "SYNC_LOCK",
            SK: "METADATA",
            lockedAt,
            correlationId: "boundary-run-id",
            ttl: 1736935200,
          },
        });

      const result = await acquireLock("test-correlation-id");

      expect(result).toEqual({
        acquired: false,
        stale: false,
        existingLock: {
          lockedAt,
          correlationId: "boundary-run-id",
          ttl: 1736935200,
        },
      });
    });

    it("handles lock record disappearing after conditional check failure", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockSend
        .mockRejectedValueOnce(
          new ConditionalCheckFailedException({
            message: "Conditional check failed",
            $metadata: {},
          }),
        )
        .mockResolvedValueOnce({ Item: undefined });

      const result = await acquireLock("test-correlation-id");

      expect(result).toEqual({
        acquired: false,
        existingLock: { lockedAt: "", correlationId: "", ttl: 0 },
        stale: false,
      });
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });

    it("re-throws non-ConditionalCheckFailedException errors", async () => {
      mockSend.mockRejectedValueOnce(new Error("ServiceUnavailable"));

      await expect(acquireLock("test-correlation-id")).rejects.toThrow(
        "ServiceUnavailable",
      );
    });
  });

  describe("forceAcquireStaleLock", () => {
    it("returns true when lockedAt matches (force-acquire succeeds)", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await forceAcquireStaleLock(
        "new-correlation-id",
        "2025-01-15T10:59:00.000Z",
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const putCall = mockSend.mock.calls[0][0];
      expect(putCall.input).toEqual({
        TableName: "test-import-table",
        Item: {
          PK: "SYNC_LOCK",
          SK: "METADATA",
          lockedAt: "2025-01-15T12:00:00.000Z",
          correlationId: "new-correlation-id",
          ttl:
            Math.floor(new Date("2025-01-15T12:00:00.000Z").getTime() / 1000) +
            3600,
        },
        ConditionExpression: "lockedAt = :expectedLockedAt",
        ExpressionAttributeValues: {
          ":expectedLockedAt": "2025-01-15T10:59:00.000Z",
        },
      });
    });

    it("returns false when lockedAt changed (race condition)", async () => {
      mockSend.mockRejectedValueOnce(
        new ConditionalCheckFailedException({
          message: "Conditional check failed",
          $metadata: {},
        }),
      );

      const result = await forceAcquireStaleLock(
        "new-correlation-id",
        "2025-01-15T10:59:00.000Z",
      );

      expect(result).toBe(false);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("re-throws non-ConditionalCheckFailedException errors", async () => {
      mockSend.mockRejectedValueOnce(new Error("InternalServerError"));

      await expect(
        forceAcquireStaleLock("new-correlation-id", "2025-01-15T10:59:00.000Z"),
      ).rejects.toThrow("InternalServerError");
    });
  });

  describe("releaseLock", () => {
    it("deletes the lock record", async () => {
      mockSend.mockResolvedValueOnce({});

      await releaseLock();

      expect(mockSend).toHaveBeenCalledTimes(1);

      const deleteCall = mockSend.mock.calls[0][0];
      expect(deleteCall.input).toEqual({
        TableName: "test-import-table",
        Key: {
          PK: "SYNC_LOCK",
          SK: "METADATA",
        },
      });
    });

    it("propagates errors from DeleteCommand", async () => {
      mockSend.mockRejectedValueOnce(new Error("DynamoDB error"));

      await expect(releaseLock()).rejects.toThrow("DynamoDB error");
    });
  });
});
