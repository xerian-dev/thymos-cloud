import {
  fetchSalePage,
  fetchSaleLineItems,
  ConsignCloudSale,
  ConsignCloudLineItem,
  SaleClientConfig,
} from "./sale-consigncloud-client";
import {
  saveSaleFetchCheckpoint,
  loadSaleFetchCheckpoint,
} from "./sale-checkpoint-manager";
import { getSaleJob, transitionSaleJob } from "./sale-job-manager";
import { RateLimiter } from "./rate-limiter";
import {
  runGenericFetchLoop,
  FetchPageResult,
} from "./generic-fetch-orchestrator";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

export interface SaleFetchOrchestratorConfig {
  jobId: string;
  apiKey: string;
  baseUrl: string;
  rateLimiter: RateLimiter;
  startTime: number;
  timeoutThresholdMs: number;
}

export interface SaleFetchLoopResult {
  status: "continue" | "complete";
  jobId: string;
}

interface StagedSaleRecord {
  sale: ConsignCloudSale;
  line_items: ConsignCloudLineItem[];
}

const PAGE_LIMIT = 100;
const BATCH_SIZE = 25;

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

export async function runSaleFetchLoop(
  config: SaleFetchOrchestratorConfig,
): Promise<SaleFetchLoopResult> {
  const { jobId, apiKey, baseUrl, rateLimiter, startTime, timeoutThresholdMs } =
    config;

  // Load job to get filterParams
  const job = await getSaleJob(jobId);
  if (!job) {
    throw new Error(`Sale job ${jobId} not found`);
  }

  // Build client config
  const clientConfig: SaleClientConfig = {
    apiKey,
    baseUrl,
    rateLimiter,
    createdAfter: job.filterParams.createdAfter,
  };

  const result = await runGenericFetchLoop<ConsignCloudSale>({
    jobId,
    startTime,
    timeoutThresholdMs,
    pageLimit: PAGE_LIMIT,
    completionState: "complete",
    fetchPage: async (
      cursor: string | null,
      limit: number,
    ): Promise<FetchPageResult<ConsignCloudSale>> => {
      const pageResult = await fetchSalePage(clientConfig, cursor, limit);
      return { data: pageResult.sales, nextCursor: pageResult.nextCursor };
    },
    stageRecords: async (
      sales: ConsignCloudSale[],
    ): Promise<{ staged: number; skipped: number }> => {
      const salesToStage: StagedSaleRecord[] = [];

      for (const sale of sales) {
        let lineItems: ConsignCloudLineItem[] = [];
        try {
          const lineItemsResult = await fetchSaleLineItems(
            clientConfig,
            sale.id,
          );
          lineItems = lineItemsResult.lineItems;
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          console.warn(
            JSON.stringify({
              level: "WARN",
              message:
                "Failed to fetch line items for sale, storing with empty line_items",
              jobId,
              saleId: sale.id,
              error: message,
            }),
          );
          lineItems = [];
        }

        salesToStage.push({ sale, line_items: lineItems });
      }

      await batchWriteStagedSales(salesToStage);
      return { staged: salesToStage.length, skipped: 0 };
    },
    jobManager: {
      getJob: getSaleJob,
      transitionJob: transitionSaleJob,
    },
    checkpointManager: {
      saveCheckpoint: saveSaleFetchCheckpoint,
      loadCheckpoint: loadSaleFetchCheckpoint,
    },
  });

  return { status: result.status, jobId: result.jobId };
}

async function batchWriteStagedSales(
  records: StagedSaleRecord[],
): Promise<void> {
  const importedAt = new Date().toISOString();

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const putRequests = batch.map((record) => ({
      PutRequest: {
        Item: {
          PK: `IMPORT#CONSIGNCLOUD#SALE#${record.sale.id}`,
          SK: "METADATA",
          ...record.sale,
          line_items: record.line_items,
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
