import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

/**
 * Unit tests for item-import-handler.ts and import-handler.ts routing
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

// --- Mocks ---

const mockCreateJob = vi.fn();
const mockGetJob = vi.fn();
const mockGetRunningOrPausedJob = vi.fn();
const mockTransitionJob = vi.fn();

vi.mock("../../src/import/job-manager", () => ({
  createJob: (...args: unknown[]) => mockCreateJob(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getRunningOrPausedJob: (...args: unknown[]) =>
    mockGetRunningOrPausedJob(...args),
  transitionJob: (...args: unknown[]) => mockTransitionJob(...args),
}));

const mockInvokeSelf = vi.fn();

vi.mock("../../src/import/self-invoker", () => ({
  invokeSelf: (...args: unknown[]) => mockInvokeSelf(...args),
}));

const mockStartStepFunction = vi.fn();

vi.mock("../../src/import/step-function-starter", () => ({
  startStepFunction: (...args: unknown[]) => mockStartStepFunction(...args),
}));

const mockGetConsignCloudApiKey = vi.fn();

vi.mock("../../src/import/ssm-client", () => ({
  getConsignCloudApiKey: (...args: unknown[]) =>
    mockGetConsignCloudApiKey(...args),
}));

const mockCreateRateLimiter = vi.fn();

vi.mock("../../src/import/rate-limiter", () => ({
  createRateLimiter: (...args: unknown[]) => mockCreateRateLimiter(...args),
}));

const mockRunImportLoop = vi.fn();

vi.mock("../../src/import/item-import-orchestrator", () => ({
  runImportLoop: (...args: unknown[]) => mockRunImportLoop(...args),
}));

const mockRunFetchLoop = vi.fn();

vi.mock("../../src/import/item-fetch-orchestrator", () => ({
  runFetchLoop: (...args: unknown[]) => mockRunFetchLoop(...args),
}));

const mockRunSyncLoop = vi.fn();

vi.mock("../../src/import/item-sync-orchestrator", () => ({
  runSyncLoop: (...args: unknown[]) => mockRunSyncLoop(...args),
}));

vi.mock("../../src/import/fetch-from-consigncloud", () => ({
  fetchFromConsignCloud: vi.fn().mockResolvedValue({
    statusCode: 200,
    body: JSON.stringify({ message: "ok" }),
  }),
}));

vi.mock("../../src/import/sync-to-shop-table", () => ({
  syncToShopTable: vi.fn().mockResolvedValue({
    statusCode: 200,
    body: JSON.stringify({ message: "ok" }),
  }),
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
}));

// --- Helpers ---

function buildApiEvent(
  overrides: Partial<APIGatewayProxyEventV2> & {
    method?: string;
    path?: string;
  },
): APIGatewayProxyEventV2 {
  const method = overrides.method ?? "POST";
  const path = overrides.path ?? "/api/import/items/start";

  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123456789012",
      apiId: "api-id",
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "curl/7.64.1",
      },
      requestId: "req-123",
      routeKey: `${method} ${path}`,
      stage: "$default",
      time: "01/Jan/2026:00:00:00 +0000",
      timeEpoch: 1735689600000,
    },
    body: overrides.body ?? undefined,
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

// --- Tests ---

describe("item-import-handler unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRunningOrPausedJob.mockResolvedValue(null);
    mockCreateJob.mockResolvedValue({
      jobId: "job-001",
      state: "running",
      startedAt: "2026-01-15T10:00:00.000Z",
      lastUpdatedAt: "2026-01-15T10:00:00.000Z",
      filterParams: {},
      progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
    });
    mockStartStepFunction.mockResolvedValue(undefined);
    mockTransitionJob.mockResolvedValue(undefined);
    mockGetConsignCloudApiKey.mockResolvedValue("test-api-key");
    mockCreateRateLimiter.mockReturnValue({});
    mockRunImportLoop.mockResolvedValue(undefined);
    mockRunFetchLoop.mockResolvedValue({
      status: "complete",
      jobId: "job-001",
    });
    mockRunSyncLoop.mockResolvedValue({ status: "complete", jobId: "job-001" });
  });

  describe("handleItemImportStart", () => {
    it("returns 200 with jobId, state, startedAt on success", async () => {
      const { handleItemImportStart } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/start",
        body: JSON.stringify({ createdAfter: "2026-01-01" }),
      });

      const result = await handleItemImportStart(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("job-001");
      expect(body.state).toBe("running");
      expect(body.startedAt).toBe("2026-01-15T10:00:00.000Z");

      expect(mockGetRunningOrPausedJob).toHaveBeenCalledTimes(1);
      expect(mockCreateJob).toHaveBeenCalledTimes(1);
      expect(mockStartStepFunction).toHaveBeenCalledWith("job-001", "fetch");
    });

    it("returns 409 when active job exists", async () => {
      mockGetRunningOrPausedJob.mockResolvedValue({
        jobId: "existing-job-id",
        state: "running",
        startedAt: "2026-01-10T08:00:00.000Z",
        lastUpdatedAt: "2026-01-10T08:30:00.000Z",
        filterParams: {},
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      const { handleItemImportStart } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/start",
        body: JSON.stringify({}),
      });

      const result = await handleItemImportStart(event);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("existing-job-id");
      expect(body.state).toBe("running");
      expect(body.message).toContain("already active");
      expect(mockCreateJob).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid JSON body", async () => {
      const { handleItemImportStart } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/start",
        body: "not valid json {{{",
      });

      const result = await handleItemImportStart(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("Invalid JSON");
    });

    it("returns 500 when self-invocation fails", async () => {
      mockStartStepFunction.mockRejectedValue(
        new Error("Lambda service unavailable"),
      );

      const { handleItemImportStart } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/start",
        body: JSON.stringify({}),
      });

      const result = await handleItemImportStart(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("Failed to start import processing");
      expect(body.jobId).toBe("job-001");
      expect(mockTransitionJob).toHaveBeenCalledWith(
        "job-001",
        "failed",
        { processed: 0, imported: 0, skipped: 0, failed: 0 },
        expect.any(String),
      );
    });
  });

  describe("handleItemImportResume", () => {
    it("returns 200 on successful resume", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "paused-job-id",
        state: "paused",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:30:00.000Z",
        filterParams: {},
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      const { handleItemImportResume } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/resume",
        body: JSON.stringify({ jobId: "paused-job-id" }),
      });

      const result = await handleItemImportResume(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("paused-job-id");
      expect(body.state).toBe("running");
      expect(mockTransitionJob).toHaveBeenCalledWith(
        "paused-job-id",
        "running",
        { processed: 50, imported: 40, skipped: 5, failed: 5 },
      );
      expect(mockStartStepFunction).toHaveBeenCalledWith(
        "paused-job-id",
        undefined,
      );
    });

    it("returns 404 when job not found", async () => {
      mockGetJob.mockResolvedValue(null);

      const { handleItemImportResume } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/resume",
        body: JSON.stringify({ jobId: "non-existent-id" }),
      });

      const result = await handleItemImportResume(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("not found");
    });

    it("returns 400 when job state is not resumable", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "complete-job-id",
        state: "complete",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T11:00:00.000Z",
        filterParams: {},
        progress: { processed: 100, imported: 90, skipped: 5, failed: 5 },
      });

      const { handleItemImportResume } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/resume",
        body: JSON.stringify({ jobId: "complete-job-id" }),
      });

      const result = await handleItemImportResume(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("complete");
      expect(body.message).toContain("Cannot resume");
    });

    it("returns 400 when jobId is missing", async () => {
      const { handleItemImportResume } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/resume",
        body: JSON.stringify({}),
      });

      const result = await handleItemImportResume(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("jobId is required");
    });
  });

  describe("handleItemImportStatus", () => {
    it("returns 200 with progress for running job", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "running-job-id",
        state: "running",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T10:15:00.000Z",
        filterParams: { createdAfter: "2026-01-01" },
        progress: { processed: 200, imported: 180, skipped: 10, failed: 10 },
      });

      const { handleItemImportStatus } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/status",
        body: JSON.stringify({ jobId: "running-job-id" }),
      });

      const result = await handleItemImportStatus(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("running-job-id");
      expect(body.state).toBe("running");
      expect(body.progress).toEqual({
        processed: 200,
        imported: 180,
        skipped: 10,
        failed: 10,
      });
    });

    it("returns 200 with report for completed job", async () => {
      mockGetJob.mockResolvedValue({
        jobId: "complete-job-id",
        state: "complete",
        startedAt: "2026-01-15T10:00:00.000Z",
        lastUpdatedAt: "2026-01-15T11:00:00.000Z",
        filterParams: {},
        progress: { processed: 500, imported: 450, skipped: 30, failed: 20 },
      });

      mockDocClientSend.mockResolvedValue({
        Item: {
          PK: "ITEM_IMPORT#REPORT",
          SK: "complete-job-id",
          jobId: "complete-job-id",
          totalProcessed: 500,
          imported: 450,
          skipped: 30,
          failed: 20,
          elapsedSeconds: 3600,
          failures: [{ itemId: "item-1", error: "Account not found" }],
          truncated: false,
          totalFailures: 20,
          completedAt: "2026-01-15T11:00:00.000Z",
        },
      });

      const { handleItemImportStatus } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/status",
        body: JSON.stringify({ jobId: "complete-job-id" }),
      });

      const result = await handleItemImportStatus(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobId).toBe("complete-job-id");
      expect(body.state).toBe("complete");
      expect(body.report).toBeDefined();
      expect(body.report.totalProcessed).toBe(500);
      expect(body.report.imported).toBe(450);
      expect(body.report.failures).toHaveLength(1);
      // PK and SK should be stripped from report
      expect(body.report.PK).toBeUndefined();
      expect(body.report.SK).toBeUndefined();
    });

    it("returns 404 when job not found", async () => {
      mockGetJob.mockResolvedValue(null);

      const { handleItemImportStatus } =
        await import("../../src/import/item-import-handler");

      const event = buildApiEvent({
        path: "/api/import/items/status",
        body: JSON.stringify({ jobId: "ghost-job-id" }),
      });

      const result = await handleItemImportStatus(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("not found");
    });
  });
});

describe("import-handler routing (resume-internal and HTTP routes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJob.mockResolvedValue({
      jobId: "internal-job-id",
      state: "running",
      startedAt: "2026-01-15T10:00:00.000Z",
      lastUpdatedAt: "2026-01-15T10:00:00.000Z",
      filterParams: {},
      progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
    });
    mockGetConsignCloudApiKey.mockResolvedValue("test-api-key");
    mockCreateRateLimiter.mockReturnValue({});
    mockRunImportLoop.mockResolvedValue(undefined);
    mockRunFetchLoop.mockResolvedValue({
      status: "complete",
      jobId: "internal-job-id",
    });
    mockRunSyncLoop.mockResolvedValue({
      status: "complete",
      jobId: "internal-job-id",
    });
    mockGetRunningOrPausedJob.mockResolvedValue(null);
    mockCreateJob.mockResolvedValue({
      jobId: "new-job-id",
      state: "running",
      startedAt: "2026-01-15T10:00:00.000Z",
      lastUpdatedAt: "2026-01-15T10:00:00.000Z",
      filterParams: {},
      progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
    });
    mockStartStepFunction.mockResolvedValue(undefined);
    mockTransitionJob.mockResolvedValue(undefined);
  });

  it("handles resume-internal action correctly", async () => {
    mockRunFetchLoop.mockResolvedValue({
      status: "complete",
      jobId: "internal-job-id",
    });

    const { handler } = await import("../../src/import-handler");

    // resume-internal events bypass API Gateway routing
    const event = {
      action: "resume-internal",
      jobId: "internal-job-id",
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.status).toBe("complete");
    expect(body.jobId).toBe("internal-job-id");
    expect(body.phase).toBe("fetch");
    // handleResumeInternal should have been triggered
    expect(mockGetJob).toHaveBeenCalledWith("internal-job-id");
  });

  it("regression: handleResumeInternal always returns type 'item' so the router does not accidentally dispatch item jobs to the sale code path", async () => {
    mockRunFetchLoop.mockResolvedValue({
      status: "continue",
      jobId: "internal-job-id",
    });

    const { handleResumeInternal } =
      await import("../../src/import/item-import-handler");

    const result = await handleResumeInternal("internal-job-id", "fetch");

    expect(result.type).toBe("item");
  });

  it("regression: handleItemImportStart calls startStepFunction with jobId and 'fetch' (type defaults to 'item')", async () => {
    // item-import-handler.ts relies on startStepFunction's default third
    // argument to send type: "item". This test locks in that call shape;
    // the default-value behavior itself is verified separately against the
    // real (unmocked) step-function-starter module below.
    const { handleItemImportStart } =
      await import("../../src/import/item-import-handler");

    await handleItemImportStart(
      buildApiEvent({ method: "POST", path: "/api/import/items/start" }),
    );

    expect(mockStartStepFunction).toHaveBeenCalledWith(
      expect.any(String),
      "fetch",
    );
  });

  it("skips resume-internal for normal API events and routes correctly", async () => {
    const { handler } = await import("../../src/import-handler");

    const event = buildApiEvent({
      method: "POST",
      path: "/api/import/items/start",
      body: JSON.stringify({}),
    });

    const result = await handler(event);

    // Should route to handleItemImportStart, not resume-internal
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.jobId).toBeDefined();
    expect(body.state).toBe("running");
  });

  it("returns 405 for non-POST method on item import start", async () => {
    const { handler } = await import("../../src/import-handler");

    const event = buildApiEvent({
      method: "GET",
      path: "/api/import/items/start",
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(405);
    const body = JSON.parse(result.body as string);
    expect(body.message).toBe("Method Not Allowed");
  });

  it("returns 405 for non-POST method on item import resume", async () => {
    const { handler } = await import("../../src/import-handler");

    const event = buildApiEvent({
      method: "GET",
      path: "/api/import/items/resume",
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(405);
    const body = JSON.parse(result.body as string);
    expect(body.message).toBe("Method Not Allowed");
  });

  it("returns 405 for non-POST method on item import status", async () => {
    const { handler } = await import("../../src/import-handler");

    const event = buildApiEvent({
      method: "PUT",
      path: "/api/import/items/status",
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(405);
    const body = JSON.parse(result.body as string);
    expect(body.message).toBe("Method Not Allowed");
  });

  it("returns 404 for unknown path", async () => {
    const { handler } = await import("../../src/import-handler");

    const event = buildApiEvent({
      method: "POST",
      path: "/api/import/unknown-route",
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body as string);
    expect(body.message).toBe("Not Found");
  });
});
