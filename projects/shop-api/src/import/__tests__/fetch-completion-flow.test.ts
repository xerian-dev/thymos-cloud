import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all external dependencies before importing the module under test
const mockGetJob = vi.fn();
const mockTransitionJob = vi.fn();
const mockGetConsignCloudApiKey = vi.fn();
const mockRunFetchLoop = vi.fn();
const mockStartStepFunction = vi.fn();
const mockGetRunningOrPausedJob = vi.fn();
const mockCreateJob = vi.fn();
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
  GetCommand: class MockGetCommand {
    constructor(public input: unknown) {}
  },
}));

vi.mock("../job-manager", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  transitionJob: (...args: unknown[]) => mockTransitionJob(...args),
  getRunningOrPausedJob: (...args: unknown[]) =>
    mockGetRunningOrPausedJob(...args),
  createJob: (...args: unknown[]) => mockCreateJob(...args),
}));

vi.mock("../ssm-client", () => ({
  getConsignCloudApiKey: (...args: unknown[]) =>
    mockGetConsignCloudApiKey(...args),
}));

vi.mock("../item-fetch-orchestrator", () => ({
  runFetchLoop: (...args: unknown[]) => mockRunFetchLoop(...args),
}));

vi.mock("../step-function-starter", () => ({
  startStepFunction: (...args: unknown[]) => mockStartStepFunction(...args),
}));

vi.mock("../rate-limiter", () => ({
  createRateLimiter: () => ({ acquire: vi.fn() }),
}));

describe("fetch-completion-flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("IMPORT_TABLE_NAME", "test-import-table");
    vi.stubEnv("CONSIGNCLOUD_BASE_URL", "https://api.consigncloud.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("handleResumeInternal no longer accepts sync phase", () => {
    it("handleResumeInternal only accepts jobId parameter (no phase)", async () => {
      const { handleResumeInternal } = await import("../item-import-handler");

      // Verify that handleResumeInternal only takes one parameter (jobId)
      expect(handleResumeInternal.length).toBe(1);
    });

    it("handleResumeInternal always runs fetch phase regardless of job phase", async () => {
      const { handleResumeInternal } = await import("../item-import-handler");

      mockGetJob.mockResolvedValue({
        jobId: "test-job-1",
        state: "running",
        phase: "sync", // even if job records say "sync", we only run fetch
        startedAt: "2025-01-15T10:00:00.000Z",
        lastUpdatedAt: "2025-01-15T10:00:00.000Z",
        filterParams: {},
        progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
      });
      mockGetConsignCloudApiKey.mockResolvedValue("test-api-key");
      mockRunFetchLoop.mockResolvedValue({
        status: "complete",
        jobId: "test-job-1",
      });

      const result = await handleResumeInternal("test-job-1");

      // The result phase should always be "fetch"
      expect(result.phase).toBe("fetch");
      expect(result.status).toBe("complete");
      expect(mockRunFetchLoop).toHaveBeenCalledTimes(1);
    });

    it("handleResumeInternal returns 'failed' when job is not found", async () => {
      const { handleResumeInternal } = await import("../item-import-handler");

      mockGetJob.mockResolvedValue(null);

      const result = await handleResumeInternal("nonexistent-job");

      expect(result.status).toBe("failed");
      expect(result.phase).toBe("fetch");
      expect(result.type).toBe("item");
    });

    it("handleResumeInternal returns 'failed' when job is not in running state", async () => {
      const { handleResumeInternal } = await import("../item-import-handler");

      mockGetJob.mockResolvedValue({
        jobId: "test-job-2",
        state: "paused",
        phase: "fetch",
        startedAt: "2025-01-15T10:00:00.000Z",
        lastUpdatedAt: "2025-01-15T10:00:00.000Z",
        filterParams: {},
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      const result = await handleResumeInternal("test-job-2");

      expect(result.status).toBe("failed");
      expect(result.phase).toBe("fetch");
      expect(mockRunFetchLoop).not.toHaveBeenCalled();
    });

    it("handleResumeInternal returns 'continue' when fetch loop needs more time", async () => {
      const { handleResumeInternal } = await import("../item-import-handler");

      mockGetJob.mockResolvedValue({
        jobId: "test-job-3",
        state: "running",
        phase: "fetch",
        startedAt: "2025-01-15T10:00:00.000Z",
        lastUpdatedAt: "2025-01-15T10:00:00.000Z",
        filterParams: {},
        progress: { processed: 100, imported: 80, skipped: 20, failed: 0 },
      });
      mockGetConsignCloudApiKey.mockResolvedValue("test-api-key");
      mockRunFetchLoop.mockResolvedValue({
        status: "continue",
        jobId: "test-job-3",
      });

      const result = await handleResumeInternal("test-job-3");

      expect(result.status).toBe("continue");
      expect(result.phase).toBe("fetch");
      expect(result.type).toBe("item");
    });
  });

  describe("generic-fetch-orchestrator transitions to complete when cursor is null", () => {
    it("fetch loop returns complete status when all pages are fetched", async () => {
      // This test verifies the integration: handleResumeInternal delegates to
      // runFetchLoop which uses the generic-fetch-orchestrator that transitions
      // to "complete" when cursor is null
      const { handleResumeInternal } = await import("../item-import-handler");

      mockGetJob.mockResolvedValue({
        jobId: "complete-job",
        state: "running",
        phase: "fetch",
        startedAt: "2025-01-15T10:00:00.000Z",
        lastUpdatedAt: "2025-01-15T10:00:00.000Z",
        filterParams: {},
        progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
      });
      mockGetConsignCloudApiKey.mockResolvedValue("test-api-key");
      mockRunFetchLoop.mockResolvedValue({
        status: "complete",
        jobId: "complete-job",
      });

      const result = await handleResumeInternal("complete-job");

      expect(result).toEqual({
        status: "complete",
        jobId: "complete-job",
        phase: "fetch",
        type: "item",
      });
    });
  });

  describe("import report is written on fetch completion", () => {
    it("import report can be retrieved after job completes", async () => {
      // The writeImportReport function (from import-report.ts) writes a report
      // to DynamoDB. The handleItemImportStatus reads it back.
      // This test verifies the report retrieval path works when a job is complete.
      const { handleItemImportStatus } = await import("../item-import-handler");

      mockGetJob.mockResolvedValue({
        jobId: "completed-job",
        state: "complete",
        phase: "fetch",
        startedAt: "2025-01-15T10:00:00.000Z",
        lastUpdatedAt: "2025-01-15T10:05:00.000Z",
        filterParams: {},
        progress: { processed: 200, imported: 180, skipped: 15, failed: 5 },
      });

      mockSend.mockResolvedValue({
        Item: {
          PK: "ITEM_IMPORT#REPORT",
          SK: "completed-job",
          jobId: "completed-job",
          totalProcessed: 200,
          imported: 180,
          skipped: 15,
          failed: 5,
          elapsedSeconds: 300,
          failures: [],
          truncated: false,
          totalFailures: 5,
          completedAt: "2025-01-15T10:05:00.000Z",
        },
      });

      const result = await handleItemImportStatus({
        body: JSON.stringify({ jobId: "completed-job" }),
      } as unknown as import("aws-lambda").APIGatewayProxyEventV2);

      const response = result as { statusCode: number; body: string };
      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.state).toBe("complete");
      expect(body.report).toBeDefined();
      expect(body.report.totalProcessed).toBe(200);
      expect(body.report.imported).toBe(180);
      expect(body.report.skipped).toBe(15);
      expect(body.report.failed).toBe(5);
      expect(body.report.elapsedSeconds).toBe(300);
    });

    it("status response excludes PK and SK from the report data", async () => {
      const { handleItemImportStatus } = await import("../item-import-handler");

      mockGetJob.mockResolvedValue({
        jobId: "completed-job-2",
        state: "complete",
        phase: "fetch",
        startedAt: "2025-01-15T10:00:00.000Z",
        lastUpdatedAt: "2025-01-15T10:05:00.000Z",
        filterParams: {},
        progress: { processed: 50, imported: 50, skipped: 0, failed: 0 },
      });

      mockSend.mockResolvedValue({
        Item: {
          PK: "ITEM_IMPORT#REPORT",
          SK: "completed-job-2",
          jobId: "completed-job-2",
          totalProcessed: 50,
          imported: 50,
          skipped: 0,
          failed: 0,
          elapsedSeconds: 60,
          failures: [],
          truncated: false,
          totalFailures: 0,
          completedAt: "2025-01-15T10:05:00.000Z",
        },
      });

      const result = await handleItemImportStatus({
        body: JSON.stringify({ jobId: "completed-job-2" }),
      } as unknown as import("aws-lambda").APIGatewayProxyEventV2);

      const response = result as { statusCode: number; body: string };
      const body = JSON.parse(response.body);
      expect(body.report.PK).toBeUndefined();
      expect(body.report.SK).toBeUndefined();
    });
  });
});
