import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

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
    QueryCommand: class {
      constructor(public input: unknown) {}
    },
  };
});

const mockGetRunningOrPausedJob = vi.hoisted(() => vi.fn());
vi.mock("../job-manager", () => ({
  getRunningOrPausedJob: mockGetRunningOrPausedJob,
}));

const mockGetRunningSaleJob = vi.hoisted(() => vi.fn());
vi.mock("../sale-job-manager", () => ({
  getRunningSaleJob: mockGetRunningSaleJob,
}));

const mockAccountGetRunningOrPausedJob = vi.hoisted(() => vi.fn());
vi.mock("../account-fetch-orchestrator", () => ({
  accountJobManager: {
    getRunningOrPausedJob: mockAccountGetRunningOrPausedJob,
  },
}));

vi.mock("../generic-job-manager", () => ({
  mapPointerToImportJob: (item: Record<string, unknown>) => ({
    jobId: item.jobId as string,
    state: item.state as string,
    phase: (item.phase as string) ?? "fetch",
    startedAt: item.startedAt as string,
    lastUpdatedAt: item.lastUpdatedAt as string,
    filterParams: {},
    error: item.error as string | undefined,
    progress: item.progress,
  }),
}));

import { handleImportStatusAll } from "../import-status-handler";

function createMockEvent(): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /api/import/status",
    rawPath: "/api/import/status",
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123",
      apiId: "api-id",
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: {
        method: "GET",
        path: "/api/import/status",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-123",
      routeKey: "GET /api/import/status",
      stage: "$default",
      time: "2025-01-15T10:00:00Z",
      timeEpoch: 1736935200000,
    },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

function createRunningJob(prefix: string) {
  return {
    jobId: `${prefix}-job-123`,
    state: "running",
    phase: "fetch",
    startedAt: "2025-01-15T10:00:00.000Z",
    lastUpdatedAt: "2025-01-15T10:05:00.000Z",
    filterParams: {},
    progress: { processed: 100, imported: 80, skipped: 15, failed: 5 },
  };
}

function createCompleteJob(prefix: string) {
  return {
    jobId: `${prefix}-job-456`,
    state: "complete",
    phase: "sync",
    startedAt: "2025-01-15T08:00:00.000Z",
    lastUpdatedAt: "2025-01-15T08:45:00.000Z",
    filterParams: {},
    progress: { processed: 500, imported: 480, skipped: 15, failed: 5 },
  };
}

describe("import-status-handler", () => {
  const event = createMockEvent();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("returns aggregated status for all three types", () => {
    it("returns all three types when each has a running job", async () => {
      const itemJob = createRunningJob("items");
      const saleJob = createRunningJob("sales");
      const accountJob = createRunningJob("accounts");

      mockGetRunningOrPausedJob.mockResolvedValue(itemJob);
      mockGetRunningSaleJob.mockResolvedValue(saleJob);
      mockAccountGetRunningOrPausedJob.mockResolvedValue(accountJob);

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);

      expect(body.items).toEqual({
        jobId: itemJob.jobId,
        state: "running",
        phase: "fetch",
        startedAt: itemJob.startedAt,
        lastUpdatedAt: itemJob.lastUpdatedAt,
        progress: itemJob.progress,
      });

      expect(body.sales).toEqual({
        jobId: saleJob.jobId,
        state: "running",
        phase: "fetch",
        startedAt: saleJob.startedAt,
        lastUpdatedAt: saleJob.lastUpdatedAt,
        progress: saleJob.progress,
      });

      expect(body.accounts).toEqual({
        jobId: accountJob.jobId,
        state: "running",
        phase: "fetch",
        startedAt: accountJob.startedAt,
        lastUpdatedAt: accountJob.lastUpdatedAt,
        progress: accountJob.progress,
      });
    });

    it("returns correct Content-Type header", async () => {
      mockGetRunningOrPausedJob.mockResolvedValue(createRunningJob("items"));
      mockGetRunningSaleJob.mockResolvedValue(null);
      mockAccountGetRunningOrPausedJob.mockResolvedValue(null);
      mockSend.mockResolvedValue({ Items: [] });

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.headers).toEqual({ "Content-Type": "application/json" });
    });
  });

  describe("includes report data when job is complete", () => {
    it("fetches and includes report for a completed job found via query", async () => {
      const completeJob = createCompleteJob("items");
      mockGetRunningOrPausedJob.mockResolvedValue(null);
      mockGetRunningSaleJob.mockResolvedValue(null);
      mockAccountGetRunningOrPausedJob.mockResolvedValue(null);

      mockSend.mockImplementation(
        (command: { input: Record<string, unknown> }) => {
          const input = command.input as Record<string, unknown>;

          // QueryCommand for items type (getMostRecentJob)
          if (
            input.KeyConditionExpression &&
            (input.ExpressionAttributeValues as Record<string, string>)[
              ":skPrefix"
            ] === "ITEM_IMPORT#"
          ) {
            return Promise.resolve({
              Items: [
                {
                  PK: "JOBS",
                  SK: `ITEM_IMPORT#${completeJob.lastUpdatedAt}#${completeJob.jobId}`,
                  jobId: completeJob.jobId,
                  state: "complete",
                  phase: "sync",
                  startedAt: completeJob.startedAt,
                  lastUpdatedAt: completeJob.lastUpdatedAt,
                  progress: completeJob.progress,
                  prefix: "ITEM_IMPORT",
                },
              ],
            });
          }

          // QueryCommand for sales type
          if (
            input.KeyConditionExpression &&
            (input.ExpressionAttributeValues as Record<string, string>)[
              ":skPrefix"
            ] === "SALE_IMPORT#"
          ) {
            return Promise.resolve({ Items: [] });
          }

          // QueryCommand for accounts type
          if (
            input.KeyConditionExpression &&
            (input.ExpressionAttributeValues as Record<string, string>)[
              ":skPrefix"
            ] === "ACCOUNT_IMPORT#"
          ) {
            return Promise.resolve({ Items: [] });
          }

          // GetCommand for report
          if (input.Key) {
            const key = input.Key as Record<string, string>;
            if (
              key.PK === "ITEM_IMPORT#REPORT" &&
              key.SK === completeJob.jobId
            ) {
              return Promise.resolve({
                Item: {
                  PK: "ITEM_IMPORT#REPORT",
                  SK: completeJob.jobId,
                  jobId: completeJob.jobId,
                  totalProcessed: 500,
                  imported: 480,
                  skipped: 15,
                  failed: 5,
                  elapsedSeconds: 2700,
                  failures: [{ itemId: "ext-123", error: "Missing field" }],
                  truncated: false,
                  totalFailures: 5,
                  completedAt: "2025-01-15T08:45:00.000Z",
                },
              });
            }
            return Promise.resolve({ Item: undefined });
          }

          return Promise.resolve({ Items: [] });
        },
      );

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.items).not.toBeNull();
      expect(body.items.state).toBe("complete");
      expect(body.items.report).toEqual({
        jobId: completeJob.jobId,
        totalProcessed: 500,
        imported: 480,
        skipped: 15,
        failed: 5,
        elapsedSeconds: 2700,
        failures: [{ itemId: "ext-123", error: "Missing field" }],
        truncated: false,
        totalFailures: 5,
        completedAt: "2025-01-15T08:45:00.000Z",
      });
    });

    it("does not include report when report is not found", async () => {
      const completeJob = createCompleteJob("items");
      mockGetRunningOrPausedJob.mockResolvedValue(null);
      mockGetRunningSaleJob.mockResolvedValue(null);
      mockAccountGetRunningOrPausedJob.mockResolvedValue(null);

      mockSend.mockImplementation(
        (command: { input: Record<string, unknown> }) => {
          const input = command.input as Record<string, unknown>;

          if (
            input.KeyConditionExpression &&
            (input.ExpressionAttributeValues as Record<string, string>)[
              ":skPrefix"
            ] === "ITEM_IMPORT#"
          ) {
            return Promise.resolve({
              Items: [
                {
                  jobId: completeJob.jobId,
                  state: "complete",
                  phase: "sync",
                  startedAt: completeJob.startedAt,
                  lastUpdatedAt: completeJob.lastUpdatedAt,
                  progress: completeJob.progress,
                  prefix: "ITEM_IMPORT",
                },
              ],
            });
          }

          if (input.KeyConditionExpression) {
            return Promise.resolve({ Items: [] });
          }

          // GetCommand — report not found
          return Promise.resolve({ Item: undefined });
        },
      );

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.items).not.toBeNull();
      expect(body.items.state).toBe("complete");
      expect(body.items.report).toBeUndefined();
    });

    it("does not fetch report for non-complete jobs", async () => {
      const failedJob = {
        ...createCompleteJob("items"),
        state: "failed",
        error: "Timeout occurred",
      };
      mockGetRunningOrPausedJob.mockResolvedValue(null);
      mockGetRunningSaleJob.mockResolvedValue(null);
      mockAccountGetRunningOrPausedJob.mockResolvedValue(null);

      mockSend.mockImplementation(
        (command: { input: Record<string, unknown> }) => {
          const input = command.input as Record<string, unknown>;

          if (
            input.KeyConditionExpression &&
            (input.ExpressionAttributeValues as Record<string, string>)[
              ":skPrefix"
            ] === "ITEM_IMPORT#"
          ) {
            return Promise.resolve({
              Items: [
                {
                  jobId: failedJob.jobId,
                  state: "failed",
                  phase: "sync",
                  startedAt: failedJob.startedAt,
                  lastUpdatedAt: failedJob.lastUpdatedAt,
                  error: "Timeout occurred",
                  progress: failedJob.progress,
                  prefix: "ITEM_IMPORT",
                },
              ],
            });
          }

          if (input.KeyConditionExpression) {
            return Promise.resolve({ Items: [] });
          }

          // GetCommand should not be called for non-complete jobs
          throw new Error(
            "GetCommand should not be called for non-complete jobs",
          );
        },
      );

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.items.state).toBe("failed");
      expect(body.items.error).toBe("Timeout occurred");
      expect(body.items.report).toBeUndefined();
    });
  });

  describe("returns null for types with no job", () => {
    it("returns null when job manager returns null and query finds no jobs", async () => {
      mockGetRunningOrPausedJob.mockResolvedValue(null);
      mockGetRunningSaleJob.mockResolvedValue(null);
      mockAccountGetRunningOrPausedJob.mockResolvedValue(null);
      mockSend.mockResolvedValue({ Items: [] });

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.items).toBeNull();
      expect(body.sales).toBeNull();
      expect(body.accounts).toBeNull();
    });

    it("returns null only for the type with no job while others succeed", async () => {
      const itemJob = createRunningJob("items");
      mockGetRunningOrPausedJob.mockResolvedValue(itemJob);
      mockGetRunningSaleJob.mockResolvedValue(null);
      mockAccountGetRunningOrPausedJob.mockResolvedValue(null);
      mockSend.mockResolvedValue({ Items: [] });

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.items).not.toBeNull();
      expect(body.items.jobId).toBe(itemJob.jobId);
      expect(body.sales).toBeNull();
      expect(body.accounts).toBeNull();
    });
  });

  describe("graceful degradation when one job manager fails", () => {
    it("returns null for the failing type while others succeed", async () => {
      const saleJob = createRunningJob("sales");
      const accountJob = createRunningJob("accounts");

      mockGetRunningOrPausedJob.mockRejectedValue(
        new Error("DynamoDB timeout"),
      );
      mockGetRunningSaleJob.mockResolvedValue(saleJob);
      mockAccountGetRunningOrPausedJob.mockResolvedValue(accountJob);

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);

      expect(body.items).toBeNull();
      expect(body.sales).not.toBeNull();
      expect(body.sales.jobId).toBe(saleJob.jobId);
      expect(body.accounts).not.toBeNull();
      expect(body.accounts.jobId).toBe(accountJob.jobId);
    });

    it("returns null when sales job manager fails", async () => {
      const itemJob = createRunningJob("items");
      mockGetRunningOrPausedJob.mockResolvedValue(itemJob);
      mockGetRunningSaleJob.mockRejectedValue(new Error("Connection refused"));
      mockAccountGetRunningOrPausedJob.mockResolvedValue(null);
      mockSend.mockResolvedValue({ Items: [] });

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.items).not.toBeNull();
      expect(body.sales).toBeNull();
      expect(body.accounts).toBeNull();
    });

    it("returns null when account job manager fails", async () => {
      const itemJob = createRunningJob("items");
      mockGetRunningOrPausedJob.mockResolvedValue(itemJob);
      mockGetRunningSaleJob.mockResolvedValue(null);
      mockAccountGetRunningOrPausedJob.mockRejectedValue(
        new Error("Internal error"),
      );
      mockSend.mockResolvedValue({ Items: [] });

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.items).not.toBeNull();
      expect(body.sales).toBeNull();
      expect(body.accounts).toBeNull();
    });

    it("still returns 200 even when all job managers fail", async () => {
      mockGetRunningOrPausedJob.mockRejectedValue(new Error("Fail 1"));
      mockGetRunningSaleJob.mockRejectedValue(new Error("Fail 2"));
      mockAccountGetRunningOrPausedJob.mockRejectedValue(new Error("Fail 3"));

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.items).toBeNull();
      expect(body.sales).toBeNull();
      expect(body.accounts).toBeNull();
    });

    it("returns null when query fails after job manager returns null", async () => {
      mockGetRunningOrPausedJob.mockResolvedValue(null);
      mockGetRunningSaleJob.mockResolvedValue(createRunningJob("sales"));
      mockAccountGetRunningOrPausedJob.mockResolvedValue(null);

      mockSend.mockImplementation(
        (command: { input: Record<string, unknown> }) => {
          const input = command.input as Record<string, unknown>;

          if (
            input.KeyConditionExpression &&
            (input.ExpressionAttributeValues as Record<string, string>)[
              ":skPrefix"
            ] === "ITEM_IMPORT#"
          ) {
            return Promise.reject(new Error("Query failed"));
          }

          if (input.KeyConditionExpression) {
            return Promise.resolve({ Items: [] });
          }

          return Promise.resolve({ Item: undefined });
        },
      );

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.items).toBeNull();
      expect(body.sales).not.toBeNull();
      expect(body.accounts).toBeNull();
    });
  });

  describe("DynamoDB interactions", () => {
    it("returns the most recent job via query with ScanIndexForward false and Limit 1", async () => {
      mockGetRunningOrPausedJob.mockResolvedValue(null);
      mockGetRunningSaleJob.mockResolvedValue(null);
      mockAccountGetRunningOrPausedJob.mockResolvedValue(null);

      const newerJob = {
        jobId: "newer-job",
        state: "complete",
        phase: "sync",
        startedAt: "2025-01-15T08:00:00.000Z",
        lastUpdatedAt: "2025-01-15T08:45:00.000Z",
        progress: { processed: 500, imported: 480, skipped: 15, failed: 5 },
        prefix: "ITEM_IMPORT",
      };

      mockSend.mockImplementation(
        (command: { input: Record<string, unknown> }) => {
          const input = command.input as Record<string, unknown>;

          if (
            input.KeyConditionExpression &&
            (input.ExpressionAttributeValues as Record<string, string>)[
              ":skPrefix"
            ] === "ITEM_IMPORT#"
          ) {
            // Verify query parameters
            expect(input.ScanIndexForward).toBe(false);
            expect(input.Limit).toBe(1);
            expect(
              (input.ExpressionAttributeValues as Record<string, string>)[
                ":pk"
              ],
            ).toBe("JOBS");

            return Promise.resolve({
              Items: [newerJob],
            });
          }

          if (input.KeyConditionExpression) {
            return Promise.resolve({ Items: [] });
          }

          // GetCommand for report
          return Promise.resolve({
            Item: {
              PK: "ITEM_IMPORT#REPORT",
              SK: "newer-job",
              jobId: "newer-job",
              totalProcessed: 500,
            },
          });
        },
      );

      const result = (await handleImportStatusAll(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.items.jobId).toBe("newer-job");
    });
  });
});
