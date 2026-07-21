import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

/**
 * Unit tests for sale-import-handler.ts routing
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

// --- Mocks ---

const mockCreateSaleJob = vi.fn();
const mockGetSaleJob = vi.fn();
const mockGetRunningSaleJob = vi.fn();
const mockTransitionSaleJob = vi.fn();
const mockUpdateSaleJobPhase = vi.fn();

vi.mock("../../src/import/sale-job-manager", () => ({
  createSaleJob: (...args: unknown[]) => mockCreateSaleJob(...args),
  getSaleJob: (...args: unknown[]) => mockGetSaleJob(...args),
  getRunningSaleJob: (...args: unknown[]) => mockGetRunningSaleJob(...args),
  transitionSaleJob: (...args: unknown[]) => mockTransitionSaleJob(...args),
  updateSaleJobPhase: (...args: unknown[]) => mockUpdateSaleJobPhase(...args),
}));

const mockStartStepFunction = vi.fn();

vi.mock("../../src/import/step-function-starter", () => ({
  startStepFunction: (...args: unknown[]) => mockStartStepFunction(...args),
}));

const mockRunSaleFetchLoop = vi.fn();

vi.mock("../../src/import/sale-fetch-orchestrator", () => ({
  runSaleFetchLoop: (...args: unknown[]) => mockRunSaleFetchLoop(...args),
}));

const mockRunSaleSyncLoop = vi.fn();

vi.mock("../../src/import/sale-sync-orchestrator", () => ({
  runSaleSyncLoop: (...args: unknown[]) => mockRunSaleSyncLoop(...args),
}));

vi.mock("../../src/import/ssm-client", () => ({
  getConsignCloudApiKey: vi.fn().mockResolvedValue("test-api-key"),
}));

vi.mock("../../src/import/rate-limiter", () => ({
  createRateLimiter: vi.fn().mockReturnValue({}),
}));

const mockDocClientSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDynamoDBClient {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: mockDocClientSend }),
  },
  GetCommand: class MockGetCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  DeleteCommand: class MockDeleteCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  TransactWriteCommand: class MockTransactWriteCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock("../../src/import/generic-job-manager", () => ({
  buildPointerSK: (prefix: string, lastUpdatedAt: string, jobId: string) =>
    `${prefix}#${lastUpdatedAt}#${jobId}`,
}));

// --- Helpers ---

function makeEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "POST /api/import/sales/start",
    rawPath: "/api/import/sales/start",
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123456789012",
      apiId: "api-id",
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: {
        method: "POST",
        path: "/api/import/sales/start",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "curl/7.64.1",
      },
      requestId: "req-123",
      routeKey: "POST /api/import/sales/start",
      stage: "$default",
      time: "01/Jan/2026:00:00:00 +0000",
      timeEpoch: 1735689600000,
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

// --- Tests ---

describe("sale-import-handler unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRunningSaleJob.mockResolvedValue(null);
    mockCreateSaleJob.mockResolvedValue({
      jobId: "sale-job-001",
      state: "running",
      phase: "fetch",
      startedAt: "2026-01-15T10:00:00.000Z",
      lastUpdatedAt: "2026-01-15T10:00:00.000Z",
      filterParams: {},
      progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
    });
    mockStartStepFunction.mockResolvedValue(undefined);
    mockTransitionSaleJob.mockResolvedValue(undefined);
    mockUpdateSaleJobPhase.mockResolvedValue(undefined);
    mockRunSaleFetchLoop.mockResolvedValue({
      status: "complete",
      jobId: "sale-job-001",
    });
    mockRunSaleSyncLoop.mockResolvedValue({
      status: "complete",
      jobId: "sale-job-001",
    });
  });

  describe("handleSaleImportStart", () => {
    it("creates job and starts Step Function, returns 200", async () => {
      const { handleSaleImportStart } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ createdAfter: "2026-01-01" });

      const result = await handleSaleImportStart(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("sale-job-001");
      expect(body.state).toBe("running");
      expect(body.phase).toBe("fetch");
      expect(body.startedAt).toBe("2026-01-15T10:00:00.000Z");

      expect(mockGetRunningSaleJob).toHaveBeenCalledTimes(1);
      expect(mockCreateSaleJob).toHaveBeenCalledWith({
        createdAfter: "2026-01-01",
      });
      expect(mockStartStepFunction).toHaveBeenCalledWith(
        "sale-job-001",
        "fetch",
        "sale",
      );
    });

    it("returns 409 when an active sale job already exists", async () => {
      mockGetRunningSaleJob.mockResolvedValue({
        jobId: "existing-sale-job",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-10T08:00:00.000Z",
        lastUpdatedAt: "2026-01-10T08:30:00.000Z",
        filterParams: {},
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      const { handleSaleImportStart } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({});

      const result = await handleSaleImportStart(event);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("existing-sale-job");
      expect(body.state).toBe("running");
      expect(body.message).toContain("already active");
      expect(mockCreateSaleJob).not.toHaveBeenCalled();
      expect(mockStartStepFunction).not.toHaveBeenCalled();
    });
  });

  describe("handleSaleImportSync", () => {
    it("returns 200 for paused job (valid state for sync)", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-002",
        state: "paused",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:30:00.000Z",
        filterParams: {},
        progress: { processed: 100, imported: 80, skipped: 15, failed: 5 },
      });

      const { handleSaleImportSync } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-002" });

      const result = await handleSaleImportSync(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("sale-job-002");
      expect(body.state).toBe("running");
      expect(body.phase).toBe("sync");

      expect(mockUpdateSaleJobPhase).toHaveBeenCalledWith(
        "sale-job-002",
        "sync",
      );
      expect(mockTransitionSaleJob).toHaveBeenCalledWith(
        "sale-job-002",
        "running",
        { processed: 100, imported: 80, skipped: 15, failed: 5 },
      );
      expect(mockStartStepFunction).toHaveBeenCalledWith(
        "sale-job-002",
        "sync",
        "sale",
      );
    });

    it("returns 400 for running job (invalid state for sync)", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-003",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:15:00.000Z",
        filterParams: {},
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      const { handleSaleImportSync } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-003" });

      const result = await handleSaleImportSync(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("running");
      expect(body.message).toContain("Cannot start sync");
      expect(mockUpdateSaleJobPhase).not.toHaveBeenCalled();
      expect(mockStartStepFunction).not.toHaveBeenCalled();
    });
  });

  describe("handleSaleImportResume", () => {
    it("resumes a paused job, transitions to running, starts StepFunction, returns 200", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-paused",
        state: "paused",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:30:00.000Z",
        filterParams: {},
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      const { handleSaleImportResume } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-paused" });

      const result = await handleSaleImportResume(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("sale-job-paused");
      expect(body.state).toBe("running");
      expect(body.phase).toBe("fetch");

      expect(mockTransitionSaleJob).toHaveBeenCalledWith(
        "sale-job-paused",
        "running",
        { processed: 50, imported: 40, skipped: 5, failed: 5 },
      );
      expect(mockStartStepFunction).toHaveBeenCalledWith(
        "sale-job-paused",
        "fetch",
        "sale",
      );
    });

    it("resumes a failed job, transitions to running, starts StepFunction, returns 200", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-failed",
        state: "failed",
        phase: "sync",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:45:00.000Z",
        filterParams: {},
        error: "Previous error",
        progress: { processed: 80, imported: 60, skipped: 10, failed: 10 },
      });

      const { handleSaleImportResume } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-failed" });

      const result = await handleSaleImportResume(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("sale-job-failed");
      expect(body.state).toBe("running");
      expect(body.phase).toBe("sync");

      expect(mockTransitionSaleJob).toHaveBeenCalledWith(
        "sale-job-failed",
        "running",
        { processed: 80, imported: 60, skipped: 10, failed: 10 },
      );
      expect(mockStartStepFunction).toHaveBeenCalledWith(
        "sale-job-failed",
        "sync",
        "sale",
      );
    });

    it("returns 400 when job is in running state (invalid for resume)", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-running",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:15:00.000Z",
        filterParams: {},
        progress: { processed: 30, imported: 25, skipped: 3, failed: 2 },
      });

      const { handleSaleImportResume } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-running" });

      const result = await handleSaleImportResume(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("Cannot resume");
      expect(body.message).toContain("running");
      expect(mockTransitionSaleJob).not.toHaveBeenCalled();
      expect(mockStartStepFunction).not.toHaveBeenCalled();
    });
  });

  describe("handleSaleImportStatus", () => {
    it("returns report for completed job", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-complete",
        state: "complete",
        phase: "sync",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T11:00:00.000Z",
        filterParams: {},
        progress: { processed: 200, imported: 180, skipped: 15, failed: 5 },
      });

      mockDocClientSend.mockResolvedValue({
        Item: {
          PK: "SALE_IMPORT#REPORT",
          SK: "sale-job-complete",
          totalProcessed: 200,
          imported: 180,
          skipped: 15,
          failed: 5,
          lineItemsImported: 600,
          elapsedSeconds: 3600,
          failures: [{ saleId: "sale-x", error: "Mapping failed" }],
          truncated: false,
          totalFailures: 5,
          completedAt: "2026-01-15T11:00:00.000Z",
        },
      });

      const { handleSaleImportStatus } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-complete" });

      const result = await handleSaleImportStatus(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("sale-job-complete");
      expect(body.state).toBe("complete");
      expect(body.report).toBeDefined();
      expect(body.report.totalProcessed).toBe(200);
      expect(body.report.imported).toBe(180);
      expect(body.report.lineItemsImported).toBe(600);
      expect(body.report.failures).toHaveLength(1);
      // PK and SK should be stripped from report
      expect(body.report.PK).toBeUndefined();
      expect(body.report.SK).toBeUndefined();
    });

    it("returns status without report for non-completed job", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-running",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:15:00.000Z",
        filterParams: {},
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      const { handleSaleImportStatus } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-running" });

      const result = await handleSaleImportStatus(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("sale-job-running");
      expect(body.state).toBe("running");
      expect(body.progress).toEqual({
        processed: 50,
        imported: 40,
        skipped: 5,
        failed: 5,
      });
      expect(body.report).toBeUndefined();
    });
  });

  describe("handleSaleResumeInternal", () => {
    it("returns type 'sale' so the Step Function loop can distinguish sale from item jobs", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-resume",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:00:00.000Z",
        filterParams: {},
        progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
      });
      mockRunSaleFetchLoop.mockResolvedValue({
        status: "continue",
        jobId: "sale-job-resume",
      });

      const { handleSaleResumeInternal } =
        await import("../../src/import/sale-import-handler");

      const result = await handleSaleResumeInternal("sale-job-resume", "fetch");

      // Regression: this field must always be "sale" so the Terraform state
      // machine's PrepareNextIteration step ($.taskResult.result.type) can
      // route the next loop iteration back through the sale code path.
      expect(result.type).toBe("sale");
      expect(result.status).toBe("continue");
      expect(result.phase).toBe("fetch");
    });

    it("returns type 'sale' even when the job is not found (failed case)", async () => {
      mockGetSaleJob.mockResolvedValue(null);

      const { handleSaleResumeInternal } =
        await import("../../src/import/sale-import-handler");

      const result = await handleSaleResumeInternal("missing-job", "fetch");

      expect(result.status).toBe("failed");
      expect(result.type).toBe("sale");
    });

    it("returns type 'sale' even when the job is not in running state", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-paused-2",
        state: "paused",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:00:00.000Z",
        filterParams: {},
        progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
      });

      const { handleSaleResumeInternal } =
        await import("../../src/import/sale-import-handler");

      const result = await handleSaleResumeInternal(
        "sale-job-paused-2",
        "fetch",
      );

      expect(result.status).toBe("failed");
      expect(result.type).toBe("sale");
    });

    it("passes 'sale' as the third argument to startStepFunction on start/sync/resume", async () => {
      // handleSaleImportStart, handleSaleImportSync, and handleSaleImportResume
      // must all tell the Step Function this is a sale job — otherwise the
      // loop falls back to the item code path and job lookups fail with
      // "Resume-internal: job not found" (ITEM_IMPORT# prefix instead of
      // SALE_IMPORT#).
      const { handleSaleImportStart } =
        await import("../../src/import/sale-import-handler");

      await handleSaleImportStart(makeEvent({}));

      expect(mockStartStepFunction).toHaveBeenCalledWith(
        expect.any(String),
        "fetch",
        "sale",
      );
    });
  });

  describe("handleSaleImportCancel", () => {
    it("transitions to cancelled state via TransactWriteCommand for paused job, returns 200", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-cancel",
        state: "paused",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:30:00.000Z",
        filterParams: {},
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      mockDocClientSend.mockResolvedValue({});

      const { handleSaleImportCancel } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-cancel" });

      const result = await handleSaleImportCancel(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("cancelled");
      expect(body.jobId).toBe("sale-job-cancel");

      // Verify TransactWriteCommand was sent (single call with transaction)
      expect(mockDocClientSend).toHaveBeenCalledTimes(1);

      const transactInput = (
        mockDocClientSend.mock.calls[0][0] as {
          input: { TransactItems: unknown[] };
        }
      ).input;
      expect(transactInput.TransactItems).toHaveLength(3);

      // Verify the update sets state to cancelled
      const updateItem = transactInput.TransactItems[0] as {
        Update: {
          Key: { PK: string; SK: string };
          ExpressionAttributeValues: Record<string, string>;
        };
      };
      expect(updateItem.Update.Key.PK).toBe("SALE_IMPORT#sale-job-cancel");
      expect(updateItem.Update.Key.SK).toBe("METADATA");
      expect(updateItem.Update.ExpressionAttributeValues[":state"]).toBe(
        "cancelled",
      );

      // Verify old pointer is deleted
      const deleteItem = transactInput.TransactItems[1] as {
        Delete: { Key: { PK: string; SK: string } };
      };
      expect(deleteItem.Delete.Key.PK).toBe("JOBS");
      expect(deleteItem.Delete.Key.SK).toBe(
        "SALE_IMPORT#2026-01-15T10:30:00.000Z#sale-job-cancel",
      );

      // Verify new pointer is created with cancelled state
      const putItem = transactInput.TransactItems[2] as {
        Put: {
          Item: { PK: string; state: string; jobId: string; prefix: string };
        };
      };
      expect(putItem.Put.Item.PK).toBe("JOBS");
      expect(putItem.Put.Item.state).toBe("cancelled");
      expect(putItem.Put.Item.jobId).toBe("sale-job-cancel");
      expect(putItem.Put.Item.prefix).toBe("SALE_IMPORT");
    });

    it("allows cancellation of running jobs, returns 200", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-running",
        state: "running",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:15:00.000Z",
        filterParams: {},
        progress: { processed: 30, imported: 25, skipped: 3, failed: 2 },
      });

      mockDocClientSend.mockResolvedValue({});

      const { handleSaleImportCancel } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-running" });

      const result = await handleSaleImportCancel(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("cancelled");
    });

    it("returns 400 when job is in complete state (cannot cancel)", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-complete",
        state: "complete",
        phase: "sync",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T11:00:00.000Z",
        filterParams: {},
        progress: { processed: 100, imported: 90, skipped: 5, failed: 5 },
      });

      const { handleSaleImportCancel } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-complete" });

      const result = await handleSaleImportCancel(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("Cannot cancel");
      expect(mockDocClientSend).not.toHaveBeenCalled();
    });

    it("returns 400 when job is already in cancelled state", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-cancelled",
        state: "cancelled",
        phase: "fetch",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:45:00.000Z",
        filterParams: {},
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      const { handleSaleImportCancel } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-cancelled" });

      const result = await handleSaleImportCancel(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("Cannot cancel");
      expect(body.message).toContain("cancelled");
      expect(mockDocClientSend).not.toHaveBeenCalled();
    });

    it("cancels failed job and preserves error in pointer record", async () => {
      mockGetSaleJob.mockResolvedValue({
        jobId: "sale-job-failed",
        state: "failed",
        phase: "sync",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:45:00.000Z",
        filterParams: {},
        error: "Network timeout",
        progress: { processed: 80, imported: 60, skipped: 10, failed: 10 },
      });

      mockDocClientSend.mockResolvedValue({});

      const { handleSaleImportCancel } =
        await import("../../src/import/sale-import-handler");

      const event = makeEvent({ jobId: "sale-job-failed" });

      const result = await handleSaleImportCancel(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("cancelled");

      // Verify pointer record preserves error from previous state
      const transactInput = (
        mockDocClientSend.mock.calls[0][0] as {
          input: { TransactItems: unknown[] };
        }
      ).input;
      const putItem = transactInput.TransactItems[2] as {
        Put: { Item: { error?: string; state: string } };
      };
      expect(putItem.Put.Item.state).toBe("cancelled");
      expect(putItem.Put.Item.error).toBe("Network timeout");
    });
  });
});
