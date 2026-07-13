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
import { ProgressCounts } from "./checkpoint-manager";
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

  // 1. Load job to get filterParams
  const job = await getSaleJob(jobId);
  if (!job) {
    throw new Error(`Sale job ${jobId} not found`);
  }

  // 2. Load checkpoint if exists (resume scenario)
  const checkpoint = await loadSaleFetchCheckpoint(jobId);
  const isResume = checkpoint !== null;

  let cursor: string | null = checkpoint?.cursor ?? null;
  const progress: ProgressCounts = checkpoint?.progress ?? {
    processed: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
  };

  // Build client config
  const clientConfig: SaleClientConfig = {
    apiKey,
    baseUrl,
    rateLimiter,
    createdAfter: job.filterParams.createdAfter,
  };

  // Log start
  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Sale fetch loop started",
      jobId,
      filterParams: job.filterParams,
      isResume,
      cursor,
      progress,
    }),
  );

  let pageNumber = 0;

  // 3. Processing loop
  for (;;) {
    // Fetch next page
    const pageResult = await fetchSalePage(clientConfig, cursor, PAGE_LIMIT);
    pageNumber++;

    // Stage all sales with their line items
    const salesToStage: StagedSaleRecord[] = [];

    for (const sale of pageResult.sales) {
      // Fetch line items for this sale
      let lineItems: ConsignCloudLineItem[] = [];
      try {
        const lineItemsResult = await fetchSaleLineItems(clientConfig, sale.id);
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

    // Batch write staged sales to Import_Table
    await batchWriteStagedSales(salesToStage);

    // Update progress
    progress.imported += salesToStage.length;
    progress.processed += pageResult.sales.length;

    // Update cursor from page result
    cursor = pageResult.nextCursor;

    // Log after each page
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Sale fetch page processed",
        jobId,
        pageNumber,
        saleCount: pageResult.sales.length,
        staged: salesToStage.length,
        progress,
      }),
    );

    // Save checkpoint after each page
    await saveSaleFetchCheckpoint({
      jobId,
      cursor,
      progress,
      lastUpdatedAt: new Date().toISOString(),
    });

    // Check if no more pages
    if (cursor === null) {
      // Fetch phase complete — transition job to paused so sync can pick it up
      await transitionSaleJob(jobId, "paused", progress);

      console.info(
        JSON.stringify({
          level: "INFO",
          message: "Sale fetch phase completed",
          jobId,
          state: "paused",
          progress,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
        }),
      );
      return { status: "complete", jobId };
    }

    // Check elapsed time against threshold
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutThresholdMs) {
      // Return continue so Step Function will re-invoke
      console.info(
        JSON.stringify({
          level: "INFO",
          message:
            "Sale fetch timeout threshold reached, returning continue for next iteration",
          jobId,
          cursor,
          progress,
          elapsedMs: elapsed,
        }),
      );

      return { status: "continue", jobId };
    }
  }
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
