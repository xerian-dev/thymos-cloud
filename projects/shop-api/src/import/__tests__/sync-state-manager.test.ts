import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());

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
    GetCommand: class {
      constructor(public input: unknown) {}
    },
    UpdateCommand: class {
      constructor(public input: unknown) {}
    },
  };
});

import { getSyncState, updateSyncStateField } from "../sync-state-manager";

describe("sync-state-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  describe("getSyncState", () => {
    it("returns null when no record exists", async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await getSyncState();

      expect(result).toBeNull();
      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.input).toEqual({
        TableName: "test-import-table",
        Key: { PK: "SYNC_STATE", SK: "METADATA" },
      });
    });

    it("returns state with partial nulls", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: "SYNC_STATE",
          SK: "METADATA",
          lastAccountSyncAt: "2025-01-15T10:00:00.000Z",
          lastItemSyncAt: null,
          lastSaleSyncAt: null,
          updatedAt: "2025-01-15T10:00:00.000Z",
        },
      });

      const result = await getSyncState();

      expect(result).toEqual({
        lastAccountSyncAt: "2025-01-15T10:00:00.000Z",
        lastItemSyncAt: null,
        lastSaleSyncAt: null,
        updatedAt: "2025-01-15T10:00:00.000Z",
      });
    });

    it("returns full state when all fields populated", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: "SYNC_STATE",
          SK: "METADATA",
          lastAccountSyncAt: "2025-01-15T10:00:00.000Z",
          lastItemSyncAt: "2025-01-15T10:05:00.000Z",
          lastSaleSyncAt: "2025-01-15T10:10:00.000Z",
          updatedAt: "2025-01-15T10:10:00.000Z",
        },
      });

      const result = await getSyncState();

      expect(result).toEqual({
        lastAccountSyncAt: "2025-01-15T10:00:00.000Z",
        lastItemSyncAt: "2025-01-15T10:05:00.000Z",
        lastSaleSyncAt: "2025-01-15T10:10:00.000Z",
        updatedAt: "2025-01-15T10:10:00.000Z",
      });
    });

    it("returns null for missing timestamp fields (treats undefined as null)", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: "SYNC_STATE",
          SK: "METADATA",
          updatedAt: "2025-01-15T10:00:00.000Z",
        },
      });

      const result = await getSyncState();

      expect(result).toEqual({
        lastAccountSyncAt: null,
        lastItemSyncAt: null,
        lastSaleSyncAt: null,
        updatedAt: "2025-01-15T10:00:00.000Z",
      });
    });
  });

  describe("updateSyncStateField", () => {
    it("updates a field successfully on first attempt", async () => {
      mockSend.mockResolvedValueOnce({});

      await updateSyncStateField(
        "lastAccountSyncAt",
        "2025-01-15T10:00:00.000Z",
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.input.TableName).toBe("test-import-table");
      expect(call.input.Key).toEqual({ PK: "SYNC_STATE", SK: "METADATA" });
      expect(call.input.UpdateExpression).toBe(
        "SET #field = :value, #updatedAt = :updatedAt",
      );
      expect(call.input.ExpressionAttributeNames).toEqual({
        "#field": "lastAccountSyncAt",
        "#updatedAt": "updatedAt",
      });
      expect(call.input.ExpressionAttributeValues[":value"]).toBe(
        "2025-01-15T10:00:00.000Z",
      );
    });

    it("retries on DynamoDB failure and succeeds on second attempt", async () => {
      mockSend
        .mockRejectedValueOnce(new Error("ServiceUnavailable"))
        .mockResolvedValueOnce({});

      const promise = updateSyncStateField(
        "lastItemSyncAt",
        "2025-01-15T10:05:00.000Z",
      );

      // Advance past the 500ms retry delay
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("logs ERROR and continues after 3 consecutive failures", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockSend
        .mockRejectedValueOnce(new Error("Failure 1"))
        .mockRejectedValueOnce(new Error("Failure 2"))
        .mockRejectedValueOnce(new Error("Failure 3"));

      const promise = updateSyncStateField(
        "lastSaleSyncAt",
        "2025-01-15T10:10:00.000Z",
      );

      // Advance past both retry delays (500ms each)
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      const logEntry = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(logEntry.level).toBe("ERROR");
      expect(logEntry.field).toBe("lastSaleSyncAt");
      expect(logEntry.attempts).toBe(3);
      expect(logEntry.error).toBe("Failure 3");

      consoleSpy.mockRestore();
    });

    it("does not throw after 3 failures (returns gracefully)", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      mockSend
        .mockRejectedValueOnce(new Error("Failure 1"))
        .mockRejectedValueOnce(new Error("Failure 2"))
        .mockRejectedValueOnce(new Error("Failure 3"));

      const promise = updateSyncStateField(
        "lastAccountSyncAt",
        "2025-01-15T10:00:00.000Z",
      );

      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(500);

      // Should not throw
      await expect(promise).resolves.toBeUndefined();

      vi.restoreAllMocks();
    });

    it("updates lastSaleSyncAt field correctly", async () => {
      mockSend.mockResolvedValueOnce({});

      await updateSyncStateField(
        "lastSaleSyncAt",
        "2025-01-15T10:10:00.000Z",
      );

      const call = mockSend.mock.calls[0][0];
      expect(call.input.ExpressionAttributeNames["#field"]).toBe(
        "lastSaleSyncAt",
      );
    });
  });
});
