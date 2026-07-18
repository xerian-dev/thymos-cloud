import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

/**
 * Unit tests for account-import-handler.ts
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 10.1, 10.3
 */

// --- Mocks (hoisted) ---

const mockGetRunningOrPausedJob = vi.hoisted(() => vi.fn());
const mockGetJob = vi.hoisted(() => vi.fn());
const mockCreateJob = vi.hoisted(() => vi.fn());
const mockTransitionJob = vi.hoisted(() => vi.fn());
const mockRunAccountFetchLoop = vi.hoisted(() => vi.fn());
const mockStartStepFunction = vi.hoisted(() => vi.fn());
const mockGetConsignCloudApiKey = vi.hoisted(() => vi.fn());
const mockDocClientSend = vi.hoisted(() => vi.fn());

vi.mock("../account-fetch-orchestrator", () => ({
  accountJobManager: {
    getRunningOrPausedJob: mockGetRunningOrPausedJob,
    getJob: mockGetJob,
    createJob: mockCreateJob,
    transitionJob: mockTransitionJob,
  },
  accountCheckpointManager: {},
  runAccountFetchLoop: mockRunAccountFetchLoop,
}));

vi.mock("../step-function-starter", () => ({
  startStepFunction: mockStartStepFunction,
}));

vi.mock("../ssm-client", () => ({
  getConsignCloudApiKey: mockGetConsignCloudApiKey,
}));

vi.mock("../rate-limiter", () => ({
  createRateLimiter: () => ({ acquire: () => Promise.resolve() }),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockDocClientSend }) },
  DeleteCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

// --- Helpers ---

function createEvent(body?: unknown): APIGatewayProxyEventV2 {
  return {
    body: body !== undefined ? JSON.stringify(body) : undefined,
    requestContext: { http: { method: "POST" } },
  } as unknown as APIGatewayProxyEventV2;
}

// --- Tests ---

describe("account-import-handler unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRunningOrPausedJob.mockResolvedValue(null);
    mockGetJob.mockResolvedValue(null);
    mockCreateJob.mockResolvedValue({
      jobId: "acc-job-001",
      state: "running",
      phase: "fetch",
      startedAt: "2026-01-15T10:00:00.000Z",
      lastUpdatedAt: "2026-01-15T10:00:00.000Z",
      filterParams: {},
      progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
    });
    mockStartStepFunction.mockResolvedValue(undefined);
    mockTransitionJob.mockResolvedValue(undefined);
    mockGetConsignCloudApiKey.mockResolvedValue("test-api-key");
    mockRunAccountFetchLoop.mockResolvedValue({
      status: "complete",
      jobId: "acc-job-001",
    });
    mockDocClientSend.mockResolvedValue({});
  });

  describe("handleAccountImportStart", () => {
    it("returns 409 when an active account job exists", async () => {
      mockGetRunningOrPausedJob.mockResolvedValue({
        jobId: "existing-acc-job",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-10T08:00:00.000Z",
      });

      const { handleAccountImportStart } =
        await import("../account-import-handler");

      const event = createEvent({ createdAfter: "2026-01-01" });
      const result = (await handleAccountImportStart(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("existing-acc-job");
      expect(body.state).toBe("running");
      expect(body.message).toContain("already active");
      expect(mockCreateJob).not.toHaveBeenCalled();
      expect(mockStartStepFunction).not.toHaveBeenCalled();
    });

    it("creates job and starts Step Function, returns 200", async () => {
      const { handleAccountImportStart } =
        await import("../account-import-handler");

      const event = createEvent({ createdAfter: "2026-01-01" });
      const result = (await handleAccountImportStart(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("acc-job-001");
      expect(body.state).toBe("running");
      expect(body.phase).toBe("fetch");
      expect(body.startedAt).toBe("2026-01-15T10:00:00.000Z");

      expect(mockGetRunningOrPausedJob).toHaveBeenCalledTimes(1);
      expect(mockCreateJob).toHaveBeenCalledWith({
        createdAfter: "2026-01-01",
      });
      expect(mockStartStepFunction).toHaveBeenCalledWith(
        "acc-job-001",
        "fetch",
        "account",
      );
    });

    it("returns 500 on Step Function failure and transitions job to failed", async () => {
      mockStartStepFunction.mockRejectedValue(
        new Error("Step Function unavailable"),
      );

      const { handleAccountImportStart } =
        await import("../account-import-handler");

      const event = createEvent({});
      const result = (await handleAccountImportStart(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("acc-job-001");
      expect(body.message).toContain("Failed to start");

      expect(mockTransitionJob).toHaveBeenCalledWith(
        "acc-job-001",
        "failed",
        { processed: 0, imported: 0, skipped: 0, failed: 0 },
        "Step Function unavailable",
      );
    });

    it("returns 400 on invalid JSON body", async () => {
      const { handleAccountImportStart } =
        await import("../account-import-handler");

      const event = {
        body: "not-valid-json{{{",
        requestContext: { http: { method: "POST" } },
      } as unknown as APIGatewayProxyEventV2;

      const result = (await handleAccountImportStart(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("Invalid JSON");
    });
  });

  describe("handleAccountImportStatus", () => {
    it("returns job state and progress when job exists", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "acc-job-status",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:15:00.000Z",
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
        error: undefined,
      });

      const { handleAccountImportStatus } =
        await import("../account-import-handler");

      const event = createEvent({ jobId: "acc-job-status" });
      const result = (await handleAccountImportStatus(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("acc-job-status");
      expect(body.state).toBe("running");
      expect(body.phase).toBe("fetch");
      expect(body.progress).toEqual({
        processed: 50,
        imported: 40,
        skipped: 5,
        failed: 5,
      });
    });

    it("returns 404 when job not found", async () => {
      mockGetJob.mockResolvedValue(null);

      const { handleAccountImportStatus } =
        await import("../account-import-handler");

      const event = createEvent({ jobId: "nonexistent-job" });
      const result = (await handleAccountImportStatus(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("not found");
    });
  });

  describe("handleAccountImportResume", () => {
    it("succeeds for paused job — transitions to running and starts Step Function", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "acc-job-paused",
        state: "paused",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:30:00.000Z",
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      const { handleAccountImportResume } =
        await import("../account-import-handler");

      const event = createEvent({ jobId: "acc-job-paused" });
      const result = (await handleAccountImportResume(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("acc-job-paused");
      expect(body.state).toBe("running");
      expect(body.phase).toBe("fetch");

      expect(mockTransitionJob).toHaveBeenCalledWith(
        "acc-job-paused",
        "running",
        { processed: 50, imported: 40, skipped: 5, failed: 5 },
      );
      expect(mockStartStepFunction).toHaveBeenCalledWith(
        "acc-job-paused",
        "fetch",
        "account",
      );
    });

    it("succeeds for failed job — transitions to running and starts Step Function", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "acc-job-failed",
        state: "failed",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:45:00.000Z",
        error: "Previous error",
        progress: { processed: 80, imported: 60, skipped: 10, failed: 10 },
      });

      const { handleAccountImportResume } =
        await import("../account-import-handler");

      const event = createEvent({ jobId: "acc-job-failed" });
      const result = (await handleAccountImportResume(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("acc-job-failed");
      expect(body.state).toBe("running");
      expect(body.phase).toBe("fetch");

      expect(mockTransitionJob).toHaveBeenCalledWith(
        "acc-job-failed",
        "running",
        { processed: 80, imported: 60, skipped: 10, failed: 10 },
      );
      expect(mockStartStepFunction).toHaveBeenCalledWith(
        "acc-job-failed",
        "fetch",
        "account",
      );
    });

    it("returns 400 for running job (invalid state for resume)", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "acc-job-running",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:15:00.000Z",
        progress: { processed: 30, imported: 25, skipped: 3, failed: 2 },
      });

      const { handleAccountImportResume } =
        await import("../account-import-handler");

      const event = createEvent({ jobId: "acc-job-running" });
      const result = (await handleAccountImportResume(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("Cannot resume");
      expect(body.message).toContain("running");
      expect(mockTransitionJob).not.toHaveBeenCalled();
      expect(mockStartStepFunction).not.toHaveBeenCalled();
    });
  });

  describe("handleAccountImportCancel", () => {
    it("deletes METADATA and CHECKPOINT records for paused job, returns 200", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "acc-job-cancel",
        state: "paused",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:30:00.000Z",
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      const { handleAccountImportCancel } =
        await import("../account-import-handler");

      const event = createEvent({ jobId: "acc-job-cancel" });
      const result = (await handleAccountImportCancel(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("cancelled");
      expect(body.jobId).toBe("acc-job-cancel");

      // Verify both records are deleted (METADATA + CHECKPOINT)
      expect(mockDocClientSend).toHaveBeenCalledTimes(2);

      const calls = mockDocClientSend.mock.calls;
      const deletedSKs = calls.map(
        (call: unknown[]) =>
          (call[0] as { input: { Key: { SK: string } } }).input.Key.SK,
      );
      expect(deletedSKs).toContain("METADATA");
      expect(deletedSKs).toContain("CHECKPOINT");

      // Verify all deletes use the correct PK
      for (const call of calls) {
        const input = (call[0] as { input: { Key: { PK: string } } }).input;
        expect(input.Key.PK).toBe("ACCOUNT_IMPORT#acc-job-cancel");
      }
    });

    it("returns 400 when job is in running state (cannot cancel)", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "acc-job-running",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:15:00.000Z",
        progress: { processed: 30, imported: 25, skipped: 3, failed: 2 },
      });

      const { handleAccountImportCancel } =
        await import("../account-import-handler");

      const event = createEvent({ jobId: "acc-job-running" });
      const result = (await handleAccountImportCancel(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("Cannot cancel");
      expect(body.message).toContain("running");
      expect(mockDocClientSend).not.toHaveBeenCalled();
    });
  });

  describe("handleAccountResumeInternal", () => {
    it("runs fetch phase and returns result for running job", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "acc-job-resume",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:00:00.000Z",
        progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
      });
      mockRunAccountFetchLoop.mockResolvedValue({
        status: "continue",
        jobId: "acc-job-resume",
      });

      const { handleAccountResumeInternal } =
        await import("../account-import-handler");

      const result = await handleAccountResumeInternal(
        "acc-job-resume",
        "fetch",
      );

      expect(result.status).toBe("continue");
      expect(result.type).toBe("account");
      expect(result.phase).toBe("fetch");
      expect(result.jobId).toBe("acc-job-resume");

      expect(mockGetConsignCloudApiKey).toHaveBeenCalledTimes(1);
      expect(mockRunAccountFetchLoop).toHaveBeenCalledTimes(1);
      expect(mockRunAccountFetchLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "acc-job-resume",
          apiKey: "test-api-key",
        }),
      );
    });

    it("returns failed when job not found", async () => {
      mockGetJob.mockResolvedValue(null);

      const { handleAccountResumeInternal } =
        await import("../account-import-handler");

      const result = await handleAccountResumeInternal("missing-job", "fetch");

      expect(result.status).toBe("failed");
      expect(result.type).toBe("account");
      expect(result.jobId).toBe("missing-job");
      expect(mockRunAccountFetchLoop).not.toHaveBeenCalled();
    });

    it("transitions to paused on fetch loop error", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "acc-job-error",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:00:00.000Z",
        progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
      });
      mockRunAccountFetchLoop.mockRejectedValue(new Error("Network timeout"));
      // After error, the handler re-fetches the job to get current progress
      mockGetJob
        .mockResolvedValueOnce({
          jobId: "acc-job-error",
          state: "running",
          phase: "fetch",
          startedAt: "2026-01-15T10:00:00.000Z",
          lastUpdatedAt: "2026-01-15T10:00:00.000Z",
          progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
        })
        .mockResolvedValueOnce({
          jobId: "acc-job-error",
          state: "running",
          phase: "fetch",
          startedAt: "2026-01-15T10:00:00.000Z",
          lastUpdatedAt: "2026-01-15T10:05:00.000Z",
          progress: { processed: 10, imported: 8, skipped: 1, failed: 1 },
        });

      const { handleAccountResumeInternal } =
        await import("../account-import-handler");

      const result = await handleAccountResumeInternal(
        "acc-job-error",
        "fetch",
      );

      expect(result.status).toBe("failed");
      expect(result.type).toBe("account");

      expect(mockTransitionJob).toHaveBeenCalledWith(
        "acc-job-error",
        "paused",
        { processed: 10, imported: 8, skipped: 1, failed: 1 },
        "Network timeout",
      );
    });

    it("transitions to complete and writes report when fetch loop completes", async () => {
      // First call: initial job validation (running state)
      // Second call: reload job after fetch loop completes (to get final progress)
      mockGetJob
        .mockResolvedValueOnce({
          jobId: "acc-job-complete",
          state: "running",
          phase: "fetch",
          startedAt: "2026-01-15T10:00:00.000Z",
          lastUpdatedAt: "2026-01-15T10:00:00.000Z",
          progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
        })
        .mockResolvedValueOnce({
          jobId: "acc-job-complete",
          state: "paused",
          phase: "fetch",
          startedAt: "2026-01-15T10:00:00.000Z",
          lastUpdatedAt: "2026-01-15T10:05:00.000Z",
          progress: { processed: 100, imported: 95, skipped: 5, failed: 0 },
        });

      mockRunAccountFetchLoop.mockResolvedValue({
        status: "complete",
        jobId: "acc-job-complete",
      });

      const { handleAccountResumeInternal } =
        await import("../account-import-handler");

      const result = await handleAccountResumeInternal(
        "acc-job-complete",
        "fetch",
      );

      expect(result.status).toBe("complete");
      expect(result.type).toBe("account");
      expect(result.phase).toBe("fetch");
      expect(result.jobId).toBe("acc-job-complete");

      // Should transition paused → running, then running → complete
      expect(mockTransitionJob).toHaveBeenCalledTimes(2);
      expect(mockTransitionJob).toHaveBeenNthCalledWith(
        1,
        "acc-job-complete",
        "running",
        { processed: 100, imported: 95, skipped: 5, failed: 0 },
      );
      expect(mockTransitionJob).toHaveBeenNthCalledWith(
        2,
        "acc-job-complete",
        "complete",
        { processed: 100, imported: 95, skipped: 5, failed: 0 },
      );

      // Should write import report via PutCommand
      expect(mockDocClientSend).toHaveBeenCalledTimes(1);
      const putCall = mockDocClientSend.mock.calls[0][0];
      expect(putCall.input.TableName).toBeDefined();
      expect(putCall.input.Item.PK).toBe("ACCOUNT_IMPORT#REPORT");
      expect(putCall.input.Item.SK).toBe("acc-job-complete");
      expect(putCall.input.Item.jobId).toBe("acc-job-complete");
      expect(putCall.input.Item.totalProcessed).toBe(100);
      expect(putCall.input.Item.imported).toBe(95);
      expect(putCall.input.Item.skipped).toBe(5);
      expect(putCall.input.Item.failed).toBe(0);
      expect(putCall.input.Item.failures).toEqual([]);
      expect(putCall.input.Item.truncated).toBe(false);
      expect(putCall.input.Item.totalFailures).toBe(0);
      expect(putCall.input.Item.completedAt).toBeDefined();
      expect(putCall.input.Item.elapsedSeconds).toBeGreaterThanOrEqual(0);
    });

    it("returns continue without finalizing when fetch loop needs more time", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "acc-job-continue",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:00:00.000Z",
        progress: { processed: 50, imported: 45, skipped: 3, failed: 2 },
      });

      mockRunAccountFetchLoop.mockResolvedValue({
        status: "continue",
        jobId: "acc-job-continue",
      });

      const { handleAccountResumeInternal } =
        await import("../account-import-handler");

      const result = await handleAccountResumeInternal(
        "acc-job-continue",
        "fetch",
      );

      expect(result.status).toBe("continue");
      expect(result.type).toBe("account");
      expect(result.phase).toBe("fetch");
      expect(result.jobId).toBe("acc-job-continue");

      // Should NOT transition job or write report
      expect(mockTransitionJob).not.toHaveBeenCalled();
      expect(mockDocClientSend).not.toHaveBeenCalled();
    });
  });
});
