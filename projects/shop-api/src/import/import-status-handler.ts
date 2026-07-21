import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getRunningOrPausedJob } from "./job-manager";
import { getRunningSaleJob } from "./sale-job-manager";
import { accountJobManager } from "./account-fetch-orchestrator";
import { mapPointerToImportJob } from "./generic-job-manager";
import type { ImportJob } from "./generic-job-manager";

interface ImportJobStatus {
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

interface ImportStatusResponse {
  items: ImportJobStatus | null;
  sales: ImportJobStatus | null;
  accounts: ImportJobStatus | null;
}

interface ImportTypeConfig {
  prefix: string;
  getRunningOrPausedJob: () => Promise<ImportJob | null>;
}

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

const IMPORT_TYPE_CONFIGS: Record<string, ImportTypeConfig> = {
  items: {
    prefix: "ITEM_IMPORT",
    getRunningOrPausedJob,
  },
  sales: {
    prefix: "SALE_IMPORT",
    getRunningOrPausedJob: getRunningSaleJob,
  },
  accounts: {
    prefix: "ACCOUNT_IMPORT",
    getRunningOrPausedJob: accountJobManager.getRunningOrPausedJob,
  },
};

export async function handleImportStatusAll(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const response: ImportStatusResponse = {
    items: null,
    sales: null,
    accounts: null,
  };

  const types = ["items", "sales", "accounts"] as const;

  await Promise.all(
    types.map(async (type) => {
      try {
        response[type] = await getStatusForType(IMPORT_TYPE_CONFIGS[type]);
      } catch (error: unknown) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          JSON.stringify({
            level: "ERROR",
            message: `Failed to get import status for ${type}`,
            error: errorMsg,
          }),
        );
        response[type] = null;
      }
    }),
  );

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response),
  };
}

async function getStatusForType(
  config: ImportTypeConfig,
): Promise<ImportJobStatus | null> {
  // 1. Check for a running or paused job
  const activeJob = await config.getRunningOrPausedJob();
  if (activeJob) {
    return mapJobToStatus(activeJob);
  }

  // 2. No active job — find the most recent completed/failed job
  const recentJob = await getMostRecentJob(config.prefix);
  if (!recentJob) {
    return null;
  }

  const status = mapJobToStatus(recentJob);

  // 3. If complete, fetch the report
  if (recentJob.state === "complete") {
    const report = await getImportReport(config.prefix, recentJob.jobId);
    if (report) {
      status.report = report;
    }
  }

  return status;
}

function mapJobToStatus(job: ImportJob): ImportJobStatus {
  const status: ImportJobStatus = {
    jobId: job.jobId,
    state: job.state,
    phase: job.phase,
    startedAt: job.startedAt,
    lastUpdatedAt: job.lastUpdatedAt,
    progress: job.progress,
  };

  if (job.error) {
    status.error = job.error;
  }

  return status;
}

async function getMostRecentJob(prefix: string): Promise<ImportJob | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: IMPORT_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": "JOBS",
        ":skPrefix": `${prefix}#`,
      },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  return mapPointerToImportJob(result.Items[0]);
}

async function getImportReport(
  prefix: string,
  jobId: string,
): Promise<Record<string, unknown> | null> {
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
}
