import {
  fetchItemPage,
  ConsignCloudItem,
  ItemClientConfig,
} from "./item-consigncloud-client";
import { isDeletedItem } from "./item-filter";
import { saveCheckpoint, loadCheckpoint } from "./checkpoint-manager";
import { getJob, transitionJob, ProgressCounts } from "./job-manager";
import { RateLimiter } from "./rate-limiter";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

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

interface FetchProgress {
  fetched: number;
  skipped: number;
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

  // 1. Load job to get filterParams
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // 2. Load checkpoint if exists (resume scenario)
  const checkpoint = await loadCheckpoint(jobId);
  const isResume = checkpoint !== null;

  let cursor: string | null = checkpoint?.cursor ?? null;
  const progress: ProgressCounts = checkpoint?.progress ?? {
    processed: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
  };

  // We track fetch-specific counts in the imported/skipped fields:
  // imported = fetched (staged to Import_Table)
  // skipped = deleted items skipped

  // Build client config
  const clientConfig: ItemClientConfig = {
    apiKey,
    baseUrl,
    rateLimiter,
    createdAfter: job.filterParams.createdAfter,
  };

  // Log start
  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Item fetch loop started",
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
    const pageResult = await fetchItemPage(clientConfig, cursor, PAGE_LIMIT);
    pageNumber++;

    // Filter out deleted items, stage the rest
    const itemsToStage: ConsignCloudItem[] = [];
    let pageSkipped = 0;

    for (const item of pageResult.items) {
      if (isDeletedItem(item)) {
        pageSkipped++;
        continue;
      }
      itemsToStage.push(item);
    }

    // Batch write staged items to Import_Table
    await batchWriteStagedItems(itemsToStage);

    // Update progress
    progress.imported += itemsToStage.length;
    progress.skipped += pageSkipped;
    progress.processed += pageResult.items.length;

    // Update cursor from page result
    cursor = pageResult.nextCursor;

    // Log after each page
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Fetch page processed",
        jobId,
        pageNumber,
        itemCount: pageResult.items.length,
        staged: itemsToStage.length,
        skippedDeleted: pageSkipped,
        progress,
      }),
    );

    // Save checkpoint after each page
    await saveCheckpoint({
      jobId,
      cursor,
      progress,
      lastUpdatedAt: new Date().toISOString(),
    });

    // Check if no more pages
    if (cursor === null) {
      // Fetch phase complete — transition job to paused so sync can pick it up
      await transitionJob(jobId, "paused", progress);

      console.info(
        JSON.stringify({
          level: "INFO",
          message: "Item fetch phase completed",
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
            "Fetch timeout threshold reached, returning continue for next iteration",
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
