import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConsignCloudAccount } from "../field-mapper";

const mockSend = vi.hoisted(() => vi.fn());

// Set env before module imports so the module-level constant picks it up
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
    BatchWriteCommand: class {
      constructor(public input: unknown) {}
    },
    PutCommand: class {
      constructor(public input: unknown) {}
    },
    ScanCommand: class {
      constructor(public input: unknown) {}
    },
  };
});

import {
  writeImportedAccounts,
  writeSummaryRecord,
  scanImportedAccounts,
  writeSyncReport,
} from "../import-table-client";

function makeAccount(id: string): ConsignCloudAccount {
  return {
    id,
    number: `NUM-${id}`,
    first_name: "First",
    last_name: "Last",
    company: "TestCo",
    email: `${id}@test.com`,
    balance: 100,
    email_notifications_enabled: true,
    created: "2024-01-01T00:00:00Z",
  };
}

describe("import-table-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("writeImportedAccounts", () => {
    it("batches correctly — 30 accounts produce 2 BatchWriteCommand calls (25 + 5)", async () => {
      mockSend.mockResolvedValue({});

      const accounts = Array.from({ length: 30 }, (_, i) =>
        makeAccount(`id-${i}`),
      );

      await writeImportedAccounts(accounts, "2024-06-01T12:00:00Z");

      expect(mockSend).toHaveBeenCalledTimes(2);

      // First batch: 25 items
      const firstCall = mockSend.mock.calls[0][0];
      const firstInput = firstCall.input as {
        RequestItems: Record<string, unknown[]>;
      };
      expect(firstInput.RequestItems["test-import-table"]).toHaveLength(25);

      // Second batch: 5 items
      const secondCall = mockSend.mock.calls[1][0];
      const secondInput = secondCall.input as {
        RequestItems: Record<string, unknown[]>;
      };
      expect(secondInput.RequestItems["test-import-table"]).toHaveLength(5);
    });

    it("idempotent upsert — calling twice with same accounts succeeds (PutItem overwrites)", async () => {
      mockSend.mockResolvedValue({});

      const accounts = [makeAccount("duplicate-id")];

      await writeImportedAccounts(accounts, "2024-06-01T12:00:00Z");
      await writeImportedAccounts(accounts, "2024-06-01T13:00:00Z");

      // Both calls succeed without error — PutItem semantics allow overwrite
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("writeSummaryRecord", () => {
    it("writes correct PK IMPORT#CONSIGNCLOUD#SUMMARY and SK LATEST", async () => {
      mockSend.mockResolvedValue({});

      await writeSummaryRecord({
        status: "success",
        totalFetched: 50,
        skipped: 5,
        stored: 45,
        timestamp: "2024-06-01T12:00:00Z",
      });

      expect(mockSend).toHaveBeenCalledTimes(1);

      const call = mockSend.mock.calls[0][0];
      const input = call.input as {
        TableName: string;
        Item: Record<string, unknown>;
      };
      expect(input.TableName).toBe("test-import-table");
      expect(input.Item.PK).toBe("IMPORT#CONSIGNCLOUD#SUMMARY");
      expect(input.Item.SK).toBe("LATEST");
      expect(input.Item.totalFetched).toBe(50);
      expect(input.Item.skipped).toBe(5);
      expect(input.Item.stored).toBe(45);
      expect(input.Item.status).toBe("success");
    });
  });

  describe("scanImportedAccounts", () => {
    it("excludes records with PK starting with IMPORT#CONSIGNCLOUD#SUMMARY or SYNC#REPORT", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            PK: "IMPORT#CONSIGNCLOUD#abc-123",
            SK: "METADATA",
            id: "abc-123",
            number: "1",
            first_name: "A",
            last_name: "B",
            company: "C",
            email: "a@b.com",
            balance: 0,
            email_notifications_enabled: false,
            created: "2024-01-01T00:00:00Z",
            importedAt: "2024-06-01T00:00:00Z",
          },
          {
            PK: "IMPORT#CONSIGNCLOUD#SUMMARY",
            SK: "LATEST",
            totalFetched: 50,
          },
          {
            PK: "SYNC#REPORT",
            SK: "2024-06-01T00:00:00Z",
            added: 10,
          },
          {
            PK: "IMPORT#CONSIGNCLOUD#def-456",
            SK: "METADATA",
            id: "def-456",
            number: "2",
            first_name: "D",
            last_name: "E",
            company: "F",
            email: "d@e.com",
            balance: 10,
            email_notifications_enabled: true,
            created: "2024-01-02T00:00:00Z",
            importedAt: "2024-06-01T00:00:00Z",
          },
        ],
        LastEvaluatedKey: undefined,
      });

      const results = await scanImportedAccounts();

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("abc-123");
      expect(results[1].id).toBe("def-456");
    });
  });

  describe("writeSyncReport", () => {
    it("uses PK SYNC#REPORT and SK as the report startedAt ISO timestamp", async () => {
      mockSend.mockResolvedValue({});

      const report = {
        added: 10,
        updated: 5,
        skipped: 3,
        errored: 1,
        errors: [{ consignCloudId: "err-id", message: "Something failed" }],
        startedAt: "2024-06-01T12:00:00.000Z",
        completedAt: "2024-06-01T12:05:00.000Z",
      };

      await writeSyncReport(report);

      expect(mockSend).toHaveBeenCalledTimes(1);

      const call = mockSend.mock.calls[0][0];
      const input = call.input as {
        TableName: string;
        Item: Record<string, unknown>;
      };
      expect(input.TableName).toBe("test-import-table");
      expect(input.Item.PK).toBe("SYNC#REPORT");
      expect(input.Item.SK).toBe("2024-06-01T12:00:00.000Z");
      expect(input.Item.added).toBe(10);
      expect(input.Item.updated).toBe(5);
      expect(input.Item.skipped).toBe(3);
      expect(input.Item.errored).toBe(1);
      expect(input.Item.errors).toEqual([
        { consignCloudId: "err-id", message: "Something failed" },
      ]);
    });
  });
});
