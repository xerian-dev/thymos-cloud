import {
  fetchAccountPage,
  ConsignCloudAccount,
  AccountClientConfig,
} from "./account-consigncloud-client";
import { createJobManager } from "./generic-job-manager";
import { createCheckpointManager } from "./generic-checkpoint-manager";
import {
  runGenericFetchLoop,
  FetchLoopResult,
} from "./generic-fetch-orchestrator";
import { RateLimiter } from "./rate-limiter";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

export interface AccountFetchOrchestratorConfig {
  jobId: string;
  apiKey: string;
  baseUrl: string;
  rateLimiter: RateLimiter;
  startTime: number;
  timeoutThresholdMs: number;
}

const PAGE_LIMIT = 100;
const BATCH_SIZE = 25;

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

export const accountJobManager = createJobManager({
  prefix: "ACCOUNT_IMPORT",
});

export const accountCheckpointManager = createCheckpointManager({
  prefix: "ACCOUNT_IMPORT",
});

export async function runAccountFetchLoop(
  config: AccountFetchOrchestratorConfig,
): Promise<FetchLoopResult> {
  const { jobId, apiKey, baseUrl, rateLimiter, startTime, timeoutThresholdMs } =
    config;

  // Load job to get filterParams for the client config
  const job = await accountJobManager.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Build account client config
  const clientConfig: AccountClientConfig = {
    apiKey,
    baseUrl,
    rateLimiter,
    updatedAfter: job.filterParams.createdAfter,
  };

  return runGenericFetchLoop<ConsignCloudAccount>({
    jobId,
    startTime,
    timeoutThresholdMs,
    pageLimit: PAGE_LIMIT,
    fetchPage: async (cursor, limit) => {
      const result = await fetchAccountPage(clientConfig, cursor, limit);
      return { data: result.accounts, nextCursor: result.nextCursor };
    },
    stageRecords: async (records) => {
      await batchWriteStagedAccounts(records);
      return { staged: records.length, skipped: 0 };
    },
    jobManager: accountJobManager,
    checkpointManager: accountCheckpointManager,
  });
}

async function batchWriteStagedAccounts(
  accounts: ConsignCloudAccount[],
): Promise<void> {
  const importedAt = new Date().toISOString();

  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);

    const putRequests = batch.map((account) => ({
      PutRequest: {
        Item: {
          PK: `IMPORT#CONSIGNCLOUD#ACCOUNT#${account.id}`,
          SK: "METADATA",
          ...account,
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
