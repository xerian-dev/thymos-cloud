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

import { handleImportHistory } from "../import-history-handler";

function createMockEvent(
  type: string,
  queryParams?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `GET /api/import/${type}/history`,
    rawPath: `/api/import/${type}/history`,
    rawQueryString: "",
    headers: {},
    queryStringParameters: queryParams,
    requestContext: {
      accountId: "123",
      apiId: "api-id",
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: {
        method: "GET",
        path: `/api/import/${type}/history`,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-123",
      routeKey: `GET /api/import/${type}/history`,
      stage: "$default",
      time: "2025-01-15T10:00:00Z",
      timeEpoch: 1736935200000,
    },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

function createJobItem(
  jobId: string,
  state: string,
  lastUpdatedAt: string,
  overrides?: Record<string, unknown>,
) {
  return {
    PK: "JOBS",
    SK: `ITEM_IMPORT#${lastUpdatedAt}#${jobId}`,
    jobId,
    state,
    phase: "sync",
    startedAt: "2025-01-15T08:00:00.000Z",
    lastUpdatedAt,
    prefix: "ITEM_IMPORT",
    progress: { processed: 100, imported: 80, skipped: 15, failed: 5 },
    ...overrides,
  };
}

describe("import-history-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("valid type returns 200 with sorted jobs", () => {
    it("returns 200 with jobs for valid type 'items'", async () => {
      const job1 = createJobItem(
        "job-1",
        "complete",
        "2025-01-15T10:00:00.000Z",
      );
      const job2 = createJobItem(
        "job-2",
        "failed",
        "2025-01-14T08:00:00.000Z",
        {
          error: "Connection timeout",
        },
      );

      mockSend.mockImplementation(
        (command: { input: Record<string, unknown> }) => {
          const input = command.input as Record<string, unknown>;
          if (input.Key) {
            return Promise.resolve({
              Item: {
                PK: "ITEM_IMPORT#REPORT",
                SK: "job-1",
                jobId: "job-1",
                totalProcessed: 100,
                imported: 80,
                skipped: 15,
                failed: 5,
                elapsedSeconds: 600,
                failures: [],
                truncated: false,
                totalFailures: 5,
                completedAt: "2025-01-15T10:00:00.000Z",
              },
            });
          }
          // DynamoDB Query returns items in descending SK order (most recent first)
          return Promise.resolve({
            Items: [job1, job2],
            LastEvaluatedKey: undefined,
          });
        },
      );

      const event = createMockEvent("items");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobs).toHaveLength(2);
      expect(body.jobs[0].jobId).toBe("job-1");
      expect(body.jobs[1].jobId).toBe("job-2");
    });

    it("returns 200 with jobs for valid type 'sales'", async () => {
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

      const event = createMockEvent("sales");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobs).toEqual([]);
    });

    it("returns 200 with jobs for valid type 'accounts'", async () => {
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

      const event = createMockEvent("accounts");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobs).toEqual([]);
    });
  });

  describe("invalid type returns 400", () => {
    it("returns 400 for invalid type 'widgets'", async () => {
      const event = createMockEvent("widgets");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.error).toBe("Invalid import type");
    });

    it("returns 400 for invalid type 'invalid'", async () => {
      const event = createMockEvent("invalid");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string);
      expect(body.error).toBe("Invalid import type");
    });
  });

  describe("jobs are sorted by lastUpdatedAt descending", () => {
    it("returns jobs in the order provided by DynamoDB query (reverse chronological)", async () => {
      // With ScanIndexForward: false, DynamoDB returns items in descending SK order
      const newJob = createJobItem(
        "new-job",
        "failed",
        "2025-01-15T08:00:00.000Z",
        {
          error: "New error",
        },
      );
      const midJob = createJobItem(
        "mid-job",
        "failed",
        "2025-01-12T08:00:00.000Z",
        {
          error: "Mid error",
        },
      );
      const oldJob = createJobItem(
        "old-job",
        "failed",
        "2025-01-10T08:00:00.000Z",
        {
          error: "Old error",
        },
      );

      // DynamoDB returns them pre-sorted descending by SK
      mockSend.mockResolvedValue({
        Items: [newJob, midJob, oldJob],
        LastEvaluatedKey: undefined,
      });

      const event = createMockEvent("items");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      const body = JSON.parse(result.body as string);
      expect(body.jobs[0].jobId).toBe("new-job");
      expect(body.jobs[1].jobId).toBe("mid-job");
      expect(body.jobs[2].jobId).toBe("old-job");
    });
  });

  describe("pageSize defaults to 20 for invalid values", () => {
    it("defaults to 20 for string 'abc'", async () => {
      // With Query + Limit, DynamoDB returns at most pageSize items.
      // We mock the response to return 20 items (simulating Limit: 20).
      const jobs = Array.from({ length: 20 }, (_, i) =>
        createJobItem(
          `job-${i}`,
          "failed",
          `2025-01-${String(20 - i).padStart(2, "0")}T08:00:00.000Z`,
          {
            error: "Some error",
          },
        ),
      );

      mockSend.mockResolvedValue({
        Items: jobs,
        LastEvaluatedKey: {
          PK: "JOBS",
          SK: "ITEM_IMPORT#2025-01-01T08:00:00.000Z#job-extra",
        },
      });

      const event = createMockEvent("items", { pageSize: "abc" });
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      const body = JSON.parse(result.body as string);
      expect(body.jobs).toHaveLength(20);
      expect(body.nextToken).toBeDefined();
    });

    it("defaults to 20 for negative value '-5'", async () => {
      const jobs = Array.from({ length: 20 }, (_, i) =>
        createJobItem(
          `job-${i}`,
          "failed",
          `2025-01-${String(20 - i).padStart(2, "0")}T08:00:00.000Z`,
          {
            error: "Some error",
          },
        ),
      );

      mockSend.mockResolvedValue({
        Items: jobs,
        LastEvaluatedKey: {
          PK: "JOBS",
          SK: "ITEM_IMPORT#2025-01-01T08:00:00.000Z#job-extra",
        },
      });

      const event = createMockEvent("items", { pageSize: "-5" });
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      const body = JSON.parse(result.body as string);
      expect(body.jobs).toHaveLength(20);
    });

    it("defaults to 20 for value '10' (not valid page size)", async () => {
      const jobs = Array.from({ length: 20 }, (_, i) =>
        createJobItem(
          `job-${i}`,
          "failed",
          `2025-01-${String(20 - i).padStart(2, "0")}T08:00:00.000Z`,
          {
            error: "Some error",
          },
        ),
      );

      mockSend.mockResolvedValue({
        Items: jobs,
        LastEvaluatedKey: {
          PK: "JOBS",
          SK: "ITEM_IMPORT#2025-01-01T08:00:00.000Z#job-extra",
        },
      });

      const event = createMockEvent("items", { pageSize: "10" });
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      const body = JSON.parse(result.body as string);
      expect(body.jobs).toHaveLength(20);
    });

    it("defaults to 20 for value '25' (not valid page size)", async () => {
      const jobs = Array.from({ length: 20 }, (_, i) =>
        createJobItem(
          `job-${i}`,
          "failed",
          `2025-01-${String(20 - i).padStart(2, "0")}T08:00:00.000Z`,
          {
            error: "Some error",
          },
        ),
      );

      mockSend.mockResolvedValue({
        Items: jobs,
        LastEvaluatedKey: {
          PK: "JOBS",
          SK: "ITEM_IMPORT#2025-01-01T08:00:00.000Z#job-extra",
        },
      });

      const event = createMockEvent("items", { pageSize: "25" });
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      const body = JSON.parse(result.body as string);
      expect(body.jobs).toHaveLength(20);
    });
  });

  describe("pageSize correctly limits results", () => {
    it("returns 20 results when pageSize is 20 and more exist", async () => {
      const jobs = Array.from({ length: 20 }, (_, i) =>
        createJobItem(
          `job-${i}`,
          "failed",
          `2025-01-${String(20 - i).padStart(2, "0")}T08:00:00.000Z`,
          {
            error: "Error",
          },
        ),
      );

      mockSend.mockResolvedValue({
        Items: jobs,
        LastEvaluatedKey: {
          PK: "JOBS",
          SK: "ITEM_IMPORT#2025-01-01T00:00:00.000Z#job-next",
        },
      });

      const event = createMockEvent("items", { pageSize: "20" });
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      const body = JSON.parse(result.body as string);
      expect(body.jobs).toHaveLength(20);
      expect(body.nextToken).toBeDefined();
    });

    it("returns 50 results when pageSize is 50 and more exist", async () => {
      const jobs = Array.from({ length: 50 }, (_, i) =>
        createJobItem(
          `job-${i}`,
          "failed",
          `2025-02-${String((i % 28) + 1).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00.000Z`,
          {
            error: "Error",
          },
        ),
      );

      mockSend.mockResolvedValue({
        Items: jobs,
        LastEvaluatedKey: {
          PK: "JOBS",
          SK: "ITEM_IMPORT#2025-01-01T00:00:00.000Z#job-next",
        },
      });

      const event = createMockEvent("items", { pageSize: "50" });
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      const body = JSON.parse(result.body as string);
      expect(body.jobs).toHaveLength(50);
      expect(body.nextToken).toBeDefined();
    });

    it("returns 100 results when pageSize is 100 and more exist", async () => {
      const jobs = Array.from({ length: 100 }, (_, i) =>
        createJobItem(
          `job-${i}`,
          "failed",
          `2025-03-${String((i % 28) + 1).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00.000Z`,
          {
            error: "Error",
          },
        ),
      );

      mockSend.mockResolvedValue({
        Items: jobs,
        LastEvaluatedKey: {
          PK: "JOBS",
          SK: "ITEM_IMPORT#2025-01-01T00:00:00.000Z#job-next",
        },
      });

      const event = createMockEvent("items", { pageSize: "100" });
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      const body = JSON.parse(result.body as string);
      expect(body.jobs).toHaveLength(100);
      expect(body.nextToken).toBeDefined();
    });
  });

  describe("nextToken pagination", () => {
    it("returns second page of results when nextToken is provided", async () => {
      // First page: 20 items with LastEvaluatedKey
      const firstPageJobs = Array.from({ length: 20 }, (_, i) =>
        createJobItem(
          `job-${i}`,
          "failed",
          `2025-01-${String(25 - i).padStart(2, "0")}T08:00:00.000Z`,
          {
            error: "Error",
          },
        ),
      );
      const lastEvaluatedKey = {
        PK: "JOBS",
        SK: "ITEM_IMPORT#2025-01-05T08:00:00.000Z#job-20",
      };

      mockSend.mockResolvedValueOnce({
        Items: firstPageJobs,
        LastEvaluatedKey: lastEvaluatedKey,
      });

      const event1 = createMockEvent("items", { pageSize: "20" });
      const result1 = (await handleImportHistory(
        event1,
      )) as APIGatewayProxyStructuredResultV2;
      const body1 = JSON.parse(result1.body as string);
      expect(body1.jobs).toHaveLength(20);
      expect(body1.nextToken).toBeDefined();

      // Verify nextToken is the base64-encoded LastEvaluatedKey
      const decodedToken = JSON.parse(
        Buffer.from(body1.nextToken, "base64").toString("utf-8"),
      );
      expect(decodedToken).toEqual(lastEvaluatedKey);

      // Second page: remaining 5 items, no LastEvaluatedKey
      const secondPageJobs = Array.from({ length: 5 }, (_, i) =>
        createJobItem(
          `job-${20 + i}`,
          "failed",
          `2025-01-${String(5 - i).padStart(2, "0")}T08:00:00.000Z`,
          {
            error: "Error",
          },
        ),
      );

      mockSend.mockResolvedValueOnce({
        Items: secondPageJobs,
        LastEvaluatedKey: undefined,
      });

      const event2 = createMockEvent("items", {
        pageSize: "20",
        nextToken: body1.nextToken,
      });
      const result2 = (await handleImportHistory(
        event2,
      )) as APIGatewayProxyStructuredResultV2;
      const body2 = JSON.parse(result2.body as string);

      expect(body2.jobs).toHaveLength(5);
      expect(body2.nextToken).toBeUndefined();
    });

    it("returns empty page when no items match on subsequent page", async () => {
      mockSend.mockResolvedValue({
        Items: [],
        LastEvaluatedKey: undefined,
      });

      const nextToken = Buffer.from(
        JSON.stringify({
          PK: "JOBS",
          SK: "ITEM_IMPORT#2025-01-01T00:00:00.000Z#job-999",
        }),
      ).toString("base64");
      const event = createMockEvent("items", { pageSize: "20", nextToken });
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.jobs).toHaveLength(0);
      expect(body.nextToken).toBeUndefined();
    });

    it("handles malformed nextToken gracefully (starts from beginning)", async () => {
      const jobs = Array.from({ length: 5 }, (_, i) =>
        createJobItem(
          `job-${i}`,
          "failed",
          `2025-01-${String(5 - i).padStart(2, "0")}T08:00:00.000Z`,
          {
            error: "Error",
          },
        ),
      );

      mockSend.mockResolvedValue({ Items: jobs, LastEvaluatedKey: undefined });

      const event = createMockEvent("items", {
        pageSize: "20",
        nextToken: "not-valid-base64!!!",
      });
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(result.statusCode).toBe(200);
      expect(body.jobs).toHaveLength(5);
    });
  });

  describe("report enrichment for complete jobs", () => {
    it("includes report data for jobs with state 'complete'", async () => {
      const completeJob = createJobItem(
        "complete-job",
        "complete",
        "2025-01-15T10:00:00.000Z",
      );

      mockSend.mockImplementation(
        (command: { input: Record<string, unknown> }) => {
          const input = command.input as Record<string, unknown>;
          if (input.Key) {
            const key = input.Key as Record<string, string>;
            if (key.PK === "ITEM_IMPORT#REPORT" && key.SK === "complete-job") {
              return Promise.resolve({
                Item: {
                  PK: "ITEM_IMPORT#REPORT",
                  SK: "complete-job",
                  jobId: "complete-job",
                  totalProcessed: 100,
                  imported: 80,
                  skipped: 15,
                  failed: 5,
                  elapsedSeconds: 600,
                  failures: [{ itemId: "ext-1", error: "Missing field" }],
                  truncated: false,
                  totalFailures: 5,
                  completedAt: "2025-01-15T10:00:00.000Z",
                },
              });
            }
          }
          return Promise.resolve({
            Items: [completeJob],
            LastEvaluatedKey: undefined,
          });
        },
      );

      const event = createMockEvent("items");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.jobs[0].report).toBeDefined();
      expect(body.jobs[0].report.jobId).toBe("complete-job");
      expect(body.jobs[0].report.totalProcessed).toBe(100);
      expect(body.jobs[0].report.failures).toHaveLength(1);
    });

    it("does not include report for non-complete jobs", async () => {
      const failedJob = createJobItem(
        "failed-job",
        "failed",
        "2025-01-15T10:00:00.000Z",
        {
          error: "Connection failed",
        },
      );

      mockSend.mockImplementation(
        (command: { input: Record<string, unknown> }) => {
          const input = command.input as Record<string, unknown>;
          if (input.Key) {
            throw new Error(
              "GetCommand should not be called for non-complete jobs",
            );
          }
          return Promise.resolve({
            Items: [failedJob],
            LastEvaluatedKey: undefined,
          });
        },
      );

      const event = createMockEvent("items");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.jobs[0].report).toBeUndefined();
      expect(body.jobs[0].error).toBe("Connection failed");
    });

    it("strips PK and SK from report data", async () => {
      const completeJob = createJobItem(
        "job-strip",
        "complete",
        "2025-01-15T10:00:00.000Z",
      );

      mockSend.mockImplementation(
        (command: { input: Record<string, unknown> }) => {
          const input = command.input as Record<string, unknown>;
          if (input.Key) {
            return Promise.resolve({
              Item: {
                PK: "ITEM_IMPORT#REPORT",
                SK: "job-strip",
                jobId: "job-strip",
                totalProcessed: 50,
                imported: 40,
                skipped: 5,
                failed: 5,
              },
            });
          }
          return Promise.resolve({
            Items: [completeJob],
            LastEvaluatedKey: undefined,
          });
        },
      );

      const event = createMockEvent("items");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(body.jobs[0].report.PK).toBeUndefined();
      expect(body.jobs[0].report.SK).toBeUndefined();
      expect(body.jobs[0].report.jobId).toBe("job-strip");
    });
  });

  describe("report fetch failure graceful degradation", () => {
    it("returns job without report when report fetch fails", async () => {
      const completeJob = createJobItem(
        "job-no-report",
        "complete",
        "2025-01-15T10:00:00.000Z",
      );

      mockSend.mockImplementation(
        (command: { input: Record<string, unknown> }) => {
          const input = command.input as Record<string, unknown>;
          if (input.Key) {
            return Promise.reject(new Error("DynamoDB GetCommand failed"));
          }
          return Promise.resolve({
            Items: [completeJob],
            LastEvaluatedKey: undefined,
          });
        },
      );

      const event = createMockEvent("items");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;
      const body = JSON.parse(result.body as string);

      expect(result.statusCode).toBe(200);
      expect(body.jobs[0].jobId).toBe("job-no-report");
      expect(body.jobs[0].state).toBe("complete");
      expect(body.jobs[0].report).toBeUndefined();
    });
  });

  describe("DynamoDB query error returns 500", () => {
    it("returns 500 when DynamoDB query fails", async () => {
      mockSend.mockRejectedValue(new Error("DynamoDB service unavailable"));

      const event = createMockEvent("items");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body as string);
      expect(body.error).toBe("Failed to fetch import history");
    });
  });

  describe("empty results return empty jobs array", () => {
    it("returns empty jobs array when no jobs exist", async () => {
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

      const event = createMockEvent("items");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobs).toEqual([]);
      expect(body.nextToken).toBeUndefined();
    });

    it("returns empty jobs array when query returns no items", async () => {
      mockSend.mockResolvedValue({
        Items: undefined,
        LastEvaluatedKey: undefined,
      });

      const event = createMockEvent("items");
      const result = (await handleImportHistory(
        event,
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.jobs).toEqual([]);
    });
  });
});
