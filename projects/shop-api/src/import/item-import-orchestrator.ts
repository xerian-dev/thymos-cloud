import {
  fetchItemPage,
  ConsignCloudItem,
  ItemClientConfig,
} from "./item-consigncloud-client";
import { mapConsignCloudItem } from "./item-mapper";
import { isDeletedItem } from "./item-filter";
import { saveCheckpoint, loadCheckpoint } from "./checkpoint-manager";
import { getJob, transitionJob, ProgressCounts } from "./job-manager";
import { invokeSelf } from "./self-invoker";
import { RateLimiter } from "./rate-limiter";
import { docClient, TABLE_NAME } from "../dynamodb-client";
import {
  PutCommand,
  QueryCommand,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { buildItemPk, formatSkuGsi1sk } from "../pk-utils";

export interface OrchestratorConfig {
  jobId: string;
  apiKey: string;
  baseUrl: string;
  rateLimiter: RateLimiter;
  startTime: number;
  timeoutThresholdMs: number; // 270_000
}

interface FailureEntry {
  itemId: string;
  error: string;
}

const PAGE_LIMIT = 100;
const MAX_FAILURES_IN_REPORT = 100;
const MAX_ERROR_LENGTH = 200;
const MAX_SKU_RETRIES = 3;

export async function runImportLoop(config: OrchestratorConfig): Promise<void> {
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

  // 3. Initialize in-memory account cache
  const accountCache = new Map<string, string>();

  // 4. Initialize failures list (for report)
  const failures: FailureEntry[] = [];

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
      message: "Item import loop started",
      jobId,
      filterParams: job.filterParams,
      isResume,
      cursor,
      progress,
    }),
  );

  let pageNumber = 0;

  // 5. Processing loop
  for (;;) {
    // Fetch next page
    const pageResult = await fetchItemPage(clientConfig, cursor, PAGE_LIMIT);
    pageNumber++;

    // Process each item
    for (const item of pageResult.items) {
      // Skip deleted items
      if (isDeletedItem(item)) {
        progress.skipped++;
        progress.processed++;
        continue;
      }

      // Check deduplication: does sourceId already exist?
      const isDuplicate = await checkSourceIdExists(item.id);
      if (isDuplicate) {
        progress.skipped++;
        progress.processed++;
        continue;
      }

      // Resolve account by ConsignCloud account number
      const accountNumber = item.account?.number;
      const accountUuid = await resolveAccountByNumber(
        accountNumber,
        accountCache,
      );
      if (!accountUuid) {
        const errorMsg = `Account not found for ConsignCloud account number: ${accountNumber}`;
        recordFailure(failures, item.id, errorMsg);
        progress.failed++;
        progress.processed++;
        console.info(
          JSON.stringify({
            level: "WARN",
            message: "Item import failed: account not found",
            jobId,
            itemId: item.id,
            accountNumber,
            reason: errorMsg,
          }),
        );
        continue;
      }

      // Map item
      const mappingResult = mapConsignCloudItem(item);
      if (!mappingResult.success) {
        const errorMsg = mappingResult.error;
        recordFailure(failures, item.id, errorMsg);
        progress.failed++;
        progress.processed++;
        console.info(
          JSON.stringify({
            level: "WARN",
            message: "Item import failed: mapping error",
            jobId,
            itemId: item.id,
            reason: errorMsg,
          }),
        );
        continue;
      }

      // Get next SKU from sequence counter
      let sku: number;
      try {
        sku = await getNextSku();
      } catch (error: unknown) {
        const errorMsg =
          error instanceof Error
            ? `SKU generation failed: ${error.message}`
            : "SKU generation failed";
        recordFailure(failures, item.id, errorMsg);
        progress.failed++;
        progress.processed++;
        console.info(
          JSON.stringify({
            level: "WARN",
            message: "Item import failed: SKU generation error",
            jobId,
            itemId: item.id,
            reason: errorMsg,
          }),
        );
        continue;
      }

      // Write item to Shop_Table with conditional expression
      try {
        await writeItem(item, mappingResult.mapped, accountUuid, sku);
        progress.imported++;
        progress.processed++;
      } catch (error: unknown) {
        if (isConditionalCheckFailed(error)) {
          // Duplicate race condition — another invocation wrote it first
          progress.skipped++;
          progress.processed++;
        } else {
          const errorMsg =
            error instanceof Error
              ? `Write failed: ${error.message}`
              : "Write failed";
          recordFailure(failures, item.id, errorMsg);
          progress.failed++;
          progress.processed++;
          console.info(
            JSON.stringify({
              level: "WARN",
              message: "Item import failed: write error",
              jobId,
              itemId: item.id,
              reason: errorMsg,
            }),
          );
        }
      }
    }

    // Update cursor from page result
    cursor = pageResult.nextCursor;

    // Log after each page
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Page processed",
        jobId,
        pageNumber,
        itemCount: pageResult.items.length,
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
      // All pages processed — complete the job
      await transitionJob(jobId, "complete", progress);

      // Write import report
      await writeImportReport(jobId, progress, failures, startTime);

      console.info(
        JSON.stringify({
          level: "INFO",
          message: "Item import completed",
          jobId,
          state: "complete",
          progress,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
        }),
      );
      return;
    }

    // Check elapsed time against threshold
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutThresholdMs) {
      // Self-re-invoke
      console.info(
        JSON.stringify({
          level: "INFO",
          message: "Timeout threshold reached, self-invoking",
          jobId,
          cursor,
          progress,
          elapsedMs: elapsed,
        }),
      );

      try {
        await invokeSelf(jobId);
      } catch (error: unknown) {
        // Self-invocation failed — transition to paused
        const errorMsg =
          error instanceof Error ? error.message : "Self-invocation failed";
        await transitionJob(jobId, "paused", progress, errorMsg);
        console.info(
          JSON.stringify({
            level: "WARN",
            message: "Self-invocation failed, job paused",
            jobId,
            reason: errorMsg,
          }),
        );
      }
      return;
    }
  }
}

async function checkSourceIdExists(sourceId: string): Promise<boolean> {
  if (!sourceId) {
    return false;
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "sourceId-index",
      KeyConditionExpression: "#sid = :sourceId",
      ExpressionAttributeNames: { "#sid": "sourceId" },
      ExpressionAttributeValues: { ":sourceId": sourceId },
      Limit: 1,
      ProjectionExpression: "PK",
    }),
  );

  return (result.Items?.length ?? 0) > 0;
}

async function resolveAccountByNumber(
  accountNumber: string | undefined,
  cache: Map<string, string>,
): Promise<string | null> {
  if (!accountNumber) {
    return null;
  }

  // Check cache first
  const cached = cache.get(accountNumber);
  if (cached) {
    return cached;
  }

  // Query GSI1 for account with matching shopUid
  // Accounts store GSI1PK = "ACCOUNT", GSI1SK = 7-digit zero-padded number
  const paddedNumber = String(parseInt(accountNumber, 10)).padStart(7, "0");

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
      ExpressionAttributeValues: {
        ":pk": "ACCOUNT",
        ":sk": paddedNumber,
      },
      ExpressionAttributeNames: { "#uuid": "uuid" },
      Limit: 1,
      ProjectionExpression: "#uuid",
    }),
  );

  if (result.Items && result.Items.length > 0) {
    const uuid = result.Items[0].uuid as string;
    cache.set(accountNumber, uuid);
    return uuid;
  }

  return null;
}

async function getNextSku(): Promise<number> {
  for (let attempt = 0; attempt < MAX_SKU_RETRIES; attempt++) {
    // Read current counter
    const counterResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: "SEQUENCE#ITEM", SK: "COUNTER" },
        ProjectionExpression: "#val",
        ExpressionAttributeNames: { "#val": "value" },
      }),
    );

    const currentCounter = (counterResult.Item?.value as number) ?? 0;
    const nextSku = currentCounter + 1;

    // Atomically increment using TransactWriteCommand
    const counterUpdate =
      currentCounter === 0
        ? {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: "SEQUENCE#ITEM",
                SK: "COUNTER",
                value: 1,
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          }
        : {
            Update: {
              TableName: TABLE_NAME,
              Key: { PK: "SEQUENCE#ITEM", SK: "COUNTER" },
              UpdateExpression: "SET #val = :newVal",
              ConditionExpression: "#val = :currentVal",
              ExpressionAttributeNames: { "#val": "value" },
              ExpressionAttributeValues: {
                ":newVal": nextSku,
                ":currentVal": currentCounter,
              },
            },
          };

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [counterUpdate],
        }),
      );
      return nextSku;
    } catch (error: unknown) {
      if (isTransactionCanceledException(error)) {
        // Counter conflict — retry
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Failed to increment SKU counter after ${MAX_SKU_RETRIES} attempts`,
  );
}

interface MappedFields {
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: "Consignment";
  terms: "Return To Consignor";
  taxExempt: boolean;
  category?: string;
  tags?: string[];
  description?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  imageKeys?: string[];
}

async function writeItem(
  item: ConsignCloudItem,
  mapped: MappedFields,
  accountUuid: string,
  sku: number,
): Promise<void> {
  const uuid = randomUUID();
  const now = new Date().toISOString();
  const pk = buildItemPk(uuid);
  const gsi1sk = formatSkuGsi1sk(sku);

  const record: Record<string, unknown> = {
    PK: pk,
    SK: "METADATA",
    uuid,
    GSI1PK: "ITEMS",
    GSI1SK: gsi1sk,
    accountId: accountUuid,
    title: mapped.title,
    tagPrice: mapped.tagPrice,
    quantity: mapped.quantity,
    split: mapped.split,
    inventoryType: mapped.inventoryType,
    terms: mapped.terms,
    taxExempt: mapped.taxExempt,
    sourceId: item.id,
    createdAt: now,
    updatedAt: now,
  };

  // Add optional fields
  if (mapped.category) record.category = mapped.category;
  if (mapped.brand) record.brand = mapped.brand;
  if (mapped.color) record.color = mapped.color;
  if (mapped.size) record.size = mapped.size;
  if (mapped.shelf) record.shelf = mapped.shelf;
  if (mapped.description) record.description = mapped.description;
  if (mapped.tags && mapped.tags.length > 0) record.tags = mapped.tags;
  if (mapped.imageKeys && mapped.imageKeys.length > 0)
    record.imageKeys = mapped.imageKeys;

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: record,
      ConditionExpression: "attribute_not_exists(PK)",
    }),
  );
}

async function writeImportReport(
  jobId: string,
  progress: ProgressCounts,
  failures: FailureEntry[],
  startTime: number,
): Promise<void> {
  const completedAt = new Date().toISOString();
  const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
  const totalFailures = progress.failed;
  const truncated = totalFailures > MAX_FAILURES_IN_REPORT;

  const reportFailures = failures.slice(0, MAX_FAILURES_IN_REPORT).map((f) => ({
    itemId: f.itemId,
    error: f.error.slice(0, MAX_ERROR_LENGTH),
  }));

  const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

  await docClient.send(
    new PutCommand({
      TableName: IMPORT_TABLE_NAME,
      Item: {
        PK: "ITEM_IMPORT#REPORT",
        SK: jobId,
        jobId,
        totalProcessed: progress.processed,
        imported: progress.imported,
        skipped: progress.skipped,
        failed: progress.failed,
        elapsedSeconds,
        failures: reportFailures,
        truncated,
        totalFailures,
        completedAt,
      },
    }),
  );
}

function recordFailure(
  failures: FailureEntry[],
  itemId: string,
  error: string,
): void {
  if (failures.length < MAX_FAILURES_IN_REPORT) {
    failures.push({
      itemId,
      error: error.slice(0, MAX_ERROR_LENGTH),
    });
  }
}

function isConditionalCheckFailed(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "ConditionalCheckFailedException";
  }
  return false;
}

interface TransactionCanceledError extends Error {
  CancellationReasons?: Array<{ Code?: string }>;
}

function isTransactionCanceledException(
  error: unknown,
): error is TransactionCanceledError {
  return (
    error instanceof Error && error.name === "TransactionCanceledException"
  );
}
