import {
  fetchItemPage,
  ConsignCloudItem,
  ItemClientConfig,
} from "./item-consigncloud-client";
import { saveCheckpoint, loadCheckpoint } from "./checkpoint-manager";
import { getJob, transitionJob } from "./job-manager";
import { RateLimiter } from "./rate-limiter";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { runGenericFetchLoop } from "./generic-fetch-orchestrator";

export interface FetchOrchestratorConfig {
  jobId: string;
  apiKey: string;
  baseUrl: string;
  rateLimiter: RateLimiter;
  startTime: number;
  timeoutThresholdMs: number;
}

export interface FetchLoopResult {
  status: "continue" | "complete";
  jobId: string;
}

const PAGE_LIMIT = 100;
const BATCH_SIZE = 25;

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

export async function runFetchLoop(
  config: FetchOrchestratorConfig,
): Promise<FetchLoopResult> {
  const { jobId, apiKey, baseUrl, rateLimiter, startTime, timeoutThresholdMs } =
    config;

  // Load job to get filterParams for the client config
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Build item client config
  const clientConfig: ItemClientConfig = {
    apiKey,
    baseUrl,
    rateLimiter,
    createdAfter: job.filterParams.createdAfter,
  };

  return runGenericFetchLoop<ConsignCloudItem>({
    jobId,
    startTime,
    timeoutThresholdMs,
    pageLimit: PAGE_LIMIT,
    fetchPage: async (cursor, limit) => {
      const result = await fetchItemPage(clientConfig, cursor, limit);
      return { data: result.items, nextCursor: result.nextCursor };
    },
    stageRecords: async (records) => {
      await batchWriteStagedItems(records);

      return { staged: records.length, skipped: 0 };
    },
    jobManager: { getJob, transitionJob },
    checkpointManager: { saveCheckpoint, loadCheckpoint },
  });
}

async function batchWriteStagedItems(items: ConsignCloudItem[]): Promise<void> {
  const importedAt = new Date().toISOString();

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const putRequests = batch.map((item) => ({
      PutRequest: {
        Item: {
          PK: `IMPORT#CONSIGNCLOUD#ITEM#${item.id}`,
          SK: "METADATA",
          ...item,
          importedAt,
        },
      },
    }));

    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [IMPORT_TABLE_NAME]: putRequests,
        },
      }),
    );
  }
}
