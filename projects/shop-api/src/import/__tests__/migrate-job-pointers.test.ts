import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.IMPORT_TABLE_NAME = "test-import-table";
  process.env.NODE_ENV = "test";
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
    ScanCommand: class {
      constructor(public input: unknown) {}
    },
    PutCommand: class {
      constructor(public input: unknown) {}
    },
  };
});

import { migrate } from "../scripts/migrate-job-pointers";

describe("migrate-job-pointers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeJob = (prefix: string, jobId: string, lastUpdatedAt: string) => ({
    PK: `${prefix}#${jobId}`,
    SK: "METADATA",
    jobId,
    state: "complete",
    phase: "sync",
    progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
    startedAt: "2025-01-01T00:00:00.000Z",
    lastUpdatedAt,
    prefix,
  });

  describe("idempotence", () => {
    it("uses ConditionExpression attribute_not_exists(PK) on PutCommand", async () => {
      const job = makeJob("ITEM_IMPORT", "job-1", "2025-01-10T00:00:00.000Z");

      // First scan for ITEM_IMPORT returns one job, rest return empty
      mockSend
        .mockResolvedValueOnce({ Items: [job] }) // ITEM_IMPORT scan
        .mockResolvedValueOnce({}) // PutCommand succeeds
        .mockResolvedValueOnce({ Items: [] }) // SALE_IMPORT scan
        .mockResolvedValueOnce({ Items: [] }); // ACCOUNT_IMPORT scan

      await migrate();

      // Find the PutCommand call
      const putCall = mockSend.mock.calls.find(
        (call) => call[0].constructor.name === "PutCommand",
      );
      expect(putCall).toBeDefined();
      expect((putCall![0] as { input: { ConditionExpression: string } }).input.ConditionExpression).toBe(
        "attribute_not_exists(PK)",
      );
    });

    it("running twice produces same pointer set — second run skips existing pointers", async () => {
      const job = makeJob("ITEM_IMPORT", "job-1", "2025-01-10T00:00:00.000Z");

      // First run: put succeeds
      mockSend
        .mockResolvedValueOnce({ Items: [job] }) // ITEM_IMPORT scan
        .mockResolvedValueOnce({}) // PutCommand succeeds (created)
        .mockResolvedValueOnce({ Items: [] }) // SALE_IMPORT scan
        .mockResolvedValueOnce({ Items: [] }); // ACCOUNT_IMPORT scan

      const consoleSpy = vi.spyOn(console, "log");
      await migrate();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Migration complete. Found: 1, Created: 1, Skipped: 0",
      );

      vi.clearAllMocks();

      // Second run: ConditionalCheckFailedException thrown (pointer exists)
      const conditionalError = new Error("ConditionalCheckFailedException");
      conditionalError.name = "ConditionalCheckFailedException";

      mockSend
        .mockResolvedValueOnce({ Items: [job] }) // ITEM_IMPORT scan
        .mockRejectedValueOnce(conditionalError) // PutCommand fails (already exists)
        .mockResolvedValueOnce({ Items: [] }) // SALE_IMPORT scan
        .mockResolvedValueOnce({ Items: [] }); // ACCOUNT_IMPORT scan

      const consoleSpy2 = vi.spyOn(console, "log");
      await migrate();

      expect(consoleSpy2).toHaveBeenCalledWith(
        "Migration complete. Found: 1, Created: 0, Skipped: 1",
      );
    });
  });

  describe("all three prefixes are processed", () => {
    it("scans for ITEM_IMPORT, SALE_IMPORT, and ACCOUNT_IMPORT", async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [] }) // ITEM_IMPORT scan
        .mockResolvedValueOnce({ Items: [] }) // SALE_IMPORT scan
        .mockResolvedValueOnce({ Items: [] }); // ACCOUNT_IMPORT scan

      await migrate();

      const scanCalls = mockSend.mock.calls.filter(
        (call) => call[0].constructor.name === "ScanCommand",
      );

      expect(scanCalls).toHaveLength(3);

      const filterExpressions = scanCalls.map(
        (call) =>
          (call[0] as { input: { ExpressionAttributeValues: Record<string, string> } }).input
            .ExpressionAttributeValues[":pkPrefix"],
      );

      expect(filterExpressions).toContain("ITEM_IMPORT#");
      expect(filterExpressions).toContain("SALE_IMPORT#");
      expect(filterExpressions).toContain("ACCOUNT_IMPORT#");
    });

    it("processes jobs from all three prefixes", async () => {
      const itemJob = makeJob("ITEM_IMPORT", "job-1", "2025-01-10T00:00:00.000Z");
      const saleJob = makeJob("SALE_IMPORT", "job-2", "2025-01-11T00:00:00.000Z");
      const accountJob = makeJob("ACCOUNT_IMPORT", "job-3", "2025-01-12T00:00:00.000Z");

      mockSend
        .mockResolvedValueOnce({ Items: [itemJob] }) // ITEM_IMPORT scan
        .mockResolvedValueOnce({}) // PutCommand for job-1
        .mockResolvedValueOnce({ Items: [saleJob] }) // SALE_IMPORT scan
        .mockResolvedValueOnce({}) // PutCommand for job-2
        .mockResolvedValueOnce({ Items: [accountJob] }) // ACCOUNT_IMPORT scan
        .mockResolvedValueOnce({}); // PutCommand for job-3

      const consoleSpy = vi.spyOn(console, "log");
      await migrate();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Migration complete. Found: 3, Created: 3, Skipped: 0",
      );
    });
  });

  describe("existing pointers are skipped without error", () => {
    it("does not throw when ConditionalCheckFailedException occurs", async () => {
      const job = makeJob("ITEM_IMPORT", "job-1", "2025-01-10T00:00:00.000Z");
      const conditionalError = new Error("ConditionalCheckFailedException");
      conditionalError.name = "ConditionalCheckFailedException";

      mockSend
        .mockResolvedValueOnce({ Items: [job] }) // ITEM_IMPORT scan
        .mockRejectedValueOnce(conditionalError) // PutCommand fails
        .mockResolvedValueOnce({ Items: [] }) // SALE_IMPORT scan
        .mockResolvedValueOnce({ Items: [] }); // ACCOUNT_IMPORT scan

      await expect(migrate()).resolves.toBeUndefined();
    });

    it("increments skip counter for each existing pointer", async () => {
      const job1 = makeJob("ITEM_IMPORT", "job-1", "2025-01-10T00:00:00.000Z");
      const job2 = makeJob("ITEM_IMPORT", "job-2", "2025-01-11T00:00:00.000Z");
      const conditionalError1 = new Error("ConditionalCheckFailedException");
      conditionalError1.name = "ConditionalCheckFailedException";
      const conditionalError2 = new Error("ConditionalCheckFailedException");
      conditionalError2.name = "ConditionalCheckFailedException";

      mockSend
        .mockResolvedValueOnce({ Items: [job1, job2] }) // ITEM_IMPORT scan
        .mockRejectedValueOnce(conditionalError1) // PutCommand for job-1 fails
        .mockRejectedValueOnce(conditionalError2) // PutCommand for job-2 fails
        .mockResolvedValueOnce({ Items: [] }) // SALE_IMPORT scan
        .mockResolvedValueOnce({ Items: [] }); // ACCOUNT_IMPORT scan

      const consoleSpy = vi.spyOn(console, "log");
      await migrate();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Migration complete. Found: 2, Created: 0, Skipped: 2",
      );
    });

    it("rethrows non-ConditionalCheckFailedException errors", async () => {
      const job = makeJob("ITEM_IMPORT", "job-1", "2025-01-10T00:00:00.000Z");
      const otherError = new Error("InternalServerError");
      otherError.name = "InternalServerError";

      mockSend
        .mockResolvedValueOnce({ Items: [job] }) // ITEM_IMPORT scan
        .mockRejectedValueOnce(otherError); // PutCommand fails with unexpected error

      await expect(migrate()).rejects.toThrow("InternalServerError");
    });
  });

  describe("progress logging", () => {
    it("logs correct summary format with found, created, and skipped counts", async () => {
      const job1 = makeJob("ITEM_IMPORT", "job-1", "2025-01-10T00:00:00.000Z");
      const job2 = makeJob("SALE_IMPORT", "job-2", "2025-01-11T00:00:00.000Z");
      const conditionalError = new Error("ConditionalCheckFailedException");
      conditionalError.name = "ConditionalCheckFailedException";

      mockSend
        .mockResolvedValueOnce({ Items: [job1] }) // ITEM_IMPORT scan
        .mockResolvedValueOnce({}) // PutCommand for job-1 succeeds
        .mockResolvedValueOnce({ Items: [job2] }) // SALE_IMPORT scan
        .mockRejectedValueOnce(conditionalError) // PutCommand for job-2 skipped
        .mockResolvedValueOnce({ Items: [] }); // ACCOUNT_IMPORT scan

      const consoleSpy = vi.spyOn(console, "log");
      await migrate();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Migration complete. Found: 2, Created: 1, Skipped: 1",
      );
    });

    it("logs processing message for each prefix", async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [] }) // ITEM_IMPORT scan
        .mockResolvedValueOnce({ Items: [] }) // SALE_IMPORT scan
        .mockResolvedValueOnce({ Items: [] }); // ACCOUNT_IMPORT scan

      const consoleSpy = vi.spyOn(console, "log");
      await migrate();

      expect(consoleSpy).toHaveBeenCalledWith("Processing ITEM_IMPORT...");
      expect(consoleSpy).toHaveBeenCalledWith("Processing SALE_IMPORT...");
      expect(consoleSpy).toHaveBeenCalledWith("Processing ACCOUNT_IMPORT...");
    });
  });
});
