import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ImportJob } from "./generic-job-manager";

interface HistoryJobSummary {
  jobId: string;
  state: string;
  phase: string;
  startedAt: string;
  lastUpdatedAt: string;
  progress: {
    processed: number;
    imported: number;
    skipped: number;
    failed: number;
  };
  error?: string;
  report?: Record<string, unknown>;
}

interface ImportHistoryResponse {
  jobs: HistoryJobSummary[];
  nextToken?: string;
}

type ValidImportType = "items" | "sales" | "accounts";

const VALID_IMPORT_TYPES: ValidImportType[] = ["items", "sales", "accounts"];

const TYPE_PREFIX_MAP: Record<ValidImportType, string> = {
  items: "ITEM_IMPORT",
  sales: "SALE_IMPORT",
  accounts: "ACCOUNT_IMPORT",
};

const VALID_PAGE_SIZES = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

export async function handleImportHistory(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // Extract type from path
  const path = event.rawPath;
  const typeMatch = path.match(
    /^\/api\/import\/(items|sales|accounts)\/history$/,
  );

  if (!typeMatch) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid import type" }),
    };
  }

  const importType = typeMatch[1] as ValidImportType;

  if (!VALID_IMPORT_TYPES.includes(importType)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid import type" }),
    };
  }

  // Extract and normalize pageSize
  const pageSizeParam = event.queryStringParameters?.pageSize;
  const pageSize = normalizePageSize(pageSizeParam);

  // Extract nextToken
  const nextToken = event.queryStringParameters?.nextToken;

  const prefix = TYPE_PREFIX_MAP[importType];

  try {
    const result = await getHistoryJobs(prefix, pageSize, nextToken);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: `Failed to fetch import history for ${importType}`,
        error: errorMsg,
      }),
    );
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to fetch import history" }),
    };
  }
}

function normalizePageSize(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PAGE_SIZE;
  }
  const parsed = Number(value);
  if (VALID_PAGE_SIZES.includes(parsed as (typeof VALID_PAGE_SIZES)[number])) {
    return parsed;
  }
  return DEFAULT_PAGE_SIZE;
}

async function getHistoryJobs(
  prefix: string,
  pageSize: number,
  nextToken: string | undefined,
): Promise<ImportHistoryResponse> {
  const jobs: ImportJob[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  // Scan all matching records (we need all to sort correctly since
  // DynamoDB scan returns items in arbitrary order)
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: IMPORT_TABLE_NAME,
        FilterExpression: "begins_with(PK, :pkPrefix) AND SK = :sk",
        ExpressionAttributeValues: {
          ":pkPrefix": `${prefix}#`,
          ":sk": "METADATA",
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    if (result.Items) {
      for (const item of result.Items) {
        jobs.push({
          jobId: item.jobId as string,
          state: item.state as ImportJob["state"],
          phase: (item.phase as ImportJob["phase"]) ?? "fetch",
          startedAt: item.startedAt as string,
          lastUpdatedAt: item.lastUpdatedAt as string,
          filterParams: item.filterParams as { createdAfter?: string },
          error: item.error as string | undefined,
          progress: item.progress as ImportJob["progress"],
        });
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  // Sort by lastUpdatedAt descending
  jobs.sort(
    (a, b) =>
      new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime(),
  );

  // Determine the page start offset from nextToken
  let startIndex = 0;
  if (nextToken) {
    try {
      const decoded = Buffer.from(nextToken, "base64").toString("utf-8");
      const cursor = JSON.parse(decoded) as { offset: number };
      if (typeof cursor.offset === "number" && cursor.offset >= 0) {
        startIndex = cursor.offset;
      }
    } catch {
      startIndex = 0;
    }
  }

  const pageJobs = jobs.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < jobs.length;

  // Build response with report enrichment for complete jobs
  const summaries: HistoryJobSummary[] = await Promise.all(
    pageJobs.map(async (job) => {
      const summary: HistoryJobSummary = {
        jobId: job.jobId,
        state: job.state,
        phase: job.phase,
        startedAt: job.startedAt,
        lastUpdatedAt: job.lastUpdatedAt,
        progress: job.progress,
      };

      if (job.error) {
        summary.error = job.error;
      }

      if (job.state === "complete") {
        const report = await getImportReport(prefix, job.jobId);
        if (report) {
          summary.report = report;
        }
      }

      return summary;
    }),
  );

  const response: ImportHistoryResponse = {
    jobs: summaries,
  };

  if (hasMore) {
    const nextCursor = { offset: startIndex + pageSize };
    response.nextToken = Buffer.from(JSON.stringify(nextCursor)).toString(
      "base64",
    );
  }

  return response;
}

async function getImportReport(
  prefix: string,
  jobId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: IMPORT_TABLE_NAME,
        Key: {
          PK: `${prefix}#REPORT`,
          SK: jobId,
        },
      }),
    );

    if (!result.Item) {
      return null;
    }

    // Remove DynamoDB key attributes from the response
    const { PK, SK, ...reportData } = result.Item;
    return reportData as Record<string, unknown>;
  } catch (error: unknown) {
    // Graceful degradation: if report fetch fails, return null
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: `Failed to fetch import report for job ${jobId}`,
        error: errorMsg,
      }),
    );
    return null;
  }
}
