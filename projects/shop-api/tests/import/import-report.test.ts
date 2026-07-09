import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProgressCounts } from "../../src/import/job-manager";
import type { FailureEntry } from "../../src/import/import-report";

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
}));

describe("import-report", () => {
  let buildImportReport: typeof import("../../src/import/import-report").buildImportReport;
  let writeImportReport: typeof import("../../src/import/import-report").writeImportReport;

  beforeEach(async () => {
    vi.stubEnv("IMPORT_TABLE_NAME", "test-import-table");
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    vi.resetModules();
    const mod = await import("../../src/import/import-report");
    buildImportReport = mod.buildImportReport;
    writeImportReport = mod.writeImportReport;
  });

  describe("buildImportReport", () => {
    it("maps progress counts correctly", () => {
      const progress: ProgressCounts = {
        processed: 500,
        imported: 400,
        skipped: 80,
        failed: 20,
      };
      const failures: FailureEntry[] = [
        { itemId: "item-1", error: "missing field" },
      ];

      const report = buildImportReport(
        "job-123",
        progress,
        "2026-01-01T00:00:00.000Z",
        failures,
        1,
      );

      expect(report.jobId).toBe("job-123");
      expect(report.totalProcessed).toBe(500);
      expect(report.imported).toBe(400);
      expect(report.skipped).toBe(80);
      expect(report.failed).toBe(20);
      expect(report.totalFailures).toBe(1);
      expect(report.truncated).toBe(false);
    });

    it("calculates elapsedSeconds from startedAt to completedAt", () => {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 120_000).toISOString();

      const report = buildImportReport(
        "job-123",
        { processed: 10, imported: 10, skipped: 0, failed: 0 },
        startedAt,
        [],
        0,
      );

      // Allow 1 second tolerance for test execution time
      expect(report.elapsedSeconds).toBeGreaterThanOrEqual(119);
      expect(report.elapsedSeconds).toBeLessThanOrEqual(121);
    });

    it("truncates failures list to max 100 entries", () => {
      const failures: FailureEntry[] = Array.from({ length: 150 }, (_, i) => ({
        itemId: `item-${i}`,
        error: `error ${i}`,
      }));

      const report = buildImportReport(
        "job-123",
        { processed: 150, imported: 0, skipped: 0, failed: 150 },
        new Date().toISOString(),
        failures,
        150,
      );

      expect(report.failures).toHaveLength(100);
      expect(report.truncated).toBe(true);
      expect(report.totalFailures).toBe(150);
    });

    it("sets truncated to false when failures <= 100", () => {
      const failures: FailureEntry[] = Array.from({ length: 100 }, (_, i) => ({
        itemId: `item-${i}`,
        error: `error ${i}`,
      }));

      const report = buildImportReport(
        "job-123",
        { processed: 100, imported: 0, skipped: 0, failed: 100 },
        new Date().toISOString(),
        failures,
        100,
      );

      expect(report.failures).toHaveLength(100);
      expect(report.truncated).toBe(false);
      expect(report.totalFailures).toBe(100);
    });

    it("truncates each error message to 200 characters", () => {
      const longError = "x".repeat(300);
      const failures: FailureEntry[] = [{ itemId: "item-1", error: longError }];

      const report = buildImportReport(
        "job-123",
        { processed: 1, imported: 0, skipped: 0, failed: 1 },
        new Date().toISOString(),
        failures,
        1,
      );

      expect(report.failures[0].error).toHaveLength(200);
    });

    it("preserves failure order (first 100 in processing order)", () => {
      const failures: FailureEntry[] = Array.from({ length: 110 }, (_, i) => ({
        itemId: `item-${i}`,
        error: `error ${i}`,
      }));

      const report = buildImportReport(
        "job-123",
        { processed: 110, imported: 0, skipped: 0, failed: 110 },
        new Date().toISOString(),
        failures,
        110,
      );

      expect(report.failures[0].itemId).toBe("item-0");
      expect(report.failures[99].itemId).toBe("item-99");
    });

    it("includes completedAt as ISO 8601 UTC string", () => {
      const report = buildImportReport(
        "job-123",
        { processed: 0, imported: 0, skipped: 0, failed: 0 },
        new Date().toISOString(),
        [],
        0,
      );

      // Should be a valid ISO string
      expect(new Date(report.completedAt).toISOString()).toBe(
        report.completedAt,
      );
    });

    it("handles zero failures gracefully", () => {
      const report = buildImportReport(
        "job-123",
        { processed: 100, imported: 90, skipped: 10, failed: 0 },
        new Date().toISOString(),
        [],
        0,
      );

      expect(report.failures).toHaveLength(0);
      expect(report.truncated).toBe(false);
      expect(report.totalFailures).toBe(0);
    });
  });

  describe("writeImportReport", () => {
    it("writes report to DynamoDB with correct PK and SK", async () => {
      const report = buildImportReport(
        "job-456",
        { processed: 50, imported: 40, skipped: 5, failed: 5 },
        new Date().toISOString(),
        [{ itemId: "item-1", error: "bad field" }],
        1,
      );

      await writeImportReport(report);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const putCommand = mockSend.mock.calls[0][0];
      expect(putCommand.input.TableName).toBe("test-import-table");
      expect(putCommand.input.Item.PK).toBe("ITEM_IMPORT#REPORT");
      expect(putCommand.input.Item.SK).toBe("job-456");
      expect(putCommand.input.Item.jobId).toBe("job-456");
      expect(putCommand.input.Item.totalProcessed).toBe(50);
      expect(putCommand.input.Item.imported).toBe(40);
      expect(putCommand.input.Item.skipped).toBe(5);
      expect(putCommand.input.Item.failed).toBe(5);
      expect(putCommand.input.Item.truncated).toBe(false);
      expect(putCommand.input.Item.totalFailures).toBe(1);
      expect(putCommand.input.Item.failures).toHaveLength(1);
      expect(putCommand.input.Item.completedAt).toBeDefined();
    });
  });
});
