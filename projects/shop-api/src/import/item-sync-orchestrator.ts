import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  QueryCommand,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConsignCloudItem } from "./item-consigncloud-client";
import { mapConsignCloudItem } from "./item-mapper";
import { getJob, transitionJob, ProgressCounts } from "./job-manager";
import { docClient, TABLE_NAME } from "../dynamodb-client";
import { randomUUID } from "node:crypto";
import { buildItemPk, formatSkuGsi1sk } from "../pk-utils";

export interface SyncOrchestratorConfig {
  jobId: string;
  startTime: number;
  timeoutThresholdMs: number;
}

export interface SyncLoopResult {
  status: "continue" | "complete";
  jobId: string;
}

interface FailureEntry {
  itemId: string;
  error: string;
}

interface SyncCheckpoint {
  exclusiveStartKey: Record<string, unknown> | null;
  progress: ProgressCounts;
  failures: FailureEntry[];
}

const MAX_FAILURES_IN_REPORT = 100;
const MAX_ERROR_LENGTH = 200;
const MAX_SKU_RETRIES = 3;
const SCAN_LIMIT = 100;

const importClient = new DynamoDBClient({});
const importDocClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(
  importClient,
  { marshallOptions: { removeUndefinedValues: true } },
);

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

export async function runSyncLoop(
  config: SyncOrchestratorConfig,
): Promise<SyncLoopResult> {
  const { jobId, startTime, timeoutThresholdMs } = config;

  // 1. Load job
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // 2. Load sync checkpoint if exists
  const syncCheckpoint = await loadSyncCheckpoint(jobId);

  let exclusiveStartKey: Record<string, unknown> | null =
    syncCheckpoint?.exclusiveStartKey ?? null;
  const progress: ProgressCounts = syncCheckpoint?.progress ?? {
    processed: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
  };
  const failures: FailureEntry[] = syncCheckpoint?.failures ?? [];

  // 3. Initialize in-memory caches
  const accountCache = new Map<string, string>();
  const employeeCache = new Map<string, string>();
  const categoryCache = new Map<string, string>();

  // Log start
  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Item sync loop started",
      jobId,
      isResume: syncCheckpoint !== null,
      progress,
    }),
  );

  // 4. Scan loop
  for (;;) {
    const scanResult = await importDocClient.send(
      new ScanCommand({
        TableName: IMPORT_TABLE_NAME,
        FilterExpression: "begins_with(PK, :pkPrefix) AND SK = :sk",
        ExpressionAttributeValues: {
          ":pkPrefix": "IMPORT#CONSIGNCLOUD#ITEM#",
          ":sk": "METADATA",
        },
        Limit: SCAN_LIMIT,
        ExclusiveStartKey: exclusiveStartKey ?? undefined,
      }),
    );

    const items = scanResult.Items ?? [];

    // Process each staged item
    for (const record of items) {
      const item = record as unknown as ConsignCloudItem & {
        PK: string;
        SK: string;
        importedAt: string;
      };

      // Check deduplication: does sourceId already exist in Shop_Table?
      const isDuplicate = await checkSourceIdExists(item.id);
      if (isDuplicate) {
        progress.skipped++;
        progress.processed++;
        continue;
      }

      // Resolve account by ConsignCloud account number (non-fatal if not found)
      const accountNumber = item.account?.number;
      const accountUuid = await resolveAccountByNumber(
        accountNumber,
        accountCache,
      );
      if (!accountUuid && accountNumber) {
        console.info(
          JSON.stringify({
            level: "INFO",
            message: "Item imported without account (account not found)",
            jobId,
            itemId: item.id,
            accountNumber,
          }),
        );
      }

      // Resolve or create employee from created_by
      const createdByUuid = await resolveOrCreateEmployee(
        item.created_by,
        employeeCache,
      );

      // Resolve or create category
      const categoryId = await resolveOrCreateCategory(
        item.category,
        categoryCache,
      );

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
            message: "Item sync failed: mapping error",
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
        continue;
      }

      // Write item to Shop_Table with conditional expression
      try {
        await writeItem(
          item,
          mappingResult.mapped,
          accountUuid ?? undefined,
          sku,
          createdByUuid,
          categoryId,
        );
        progress.imported++;
        progress.processed++;
      } catch (error: unknown) {
        if (isConditionalCheckFailed(error)) {
          // Duplicate race condition — already written
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
        }
      }
    }

    // Update exclusiveStartKey for next scan page
    exclusiveStartKey =
      (scanResult.LastEvaluatedKey as Record<string, unknown>) ?? null;

    // Log after each scan page
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Sync scan page processed",
        jobId,
        itemsInPage: items.length,
        progress,
        hasMorePages: exclusiveStartKey !== null,
      }),
    );

    // Save sync checkpoint
    await saveSyncCheckpoint(jobId, {
      exclusiveStartKey,
      progress,
      failures: failures.slice(0, MAX_FAILURES_IN_REPORT),
    });

    // Check if scan is complete
    if (exclusiveStartKey === null) {
      // Sync complete
      await transitionJob(jobId, "complete", progress);
      await writeImportReport(jobId, progress, failures, startTime);

      console.info(
        JSON.stringify({
          level: "INFO",
          message: "Item sync phase completed",
          jobId,
          state: "complete",
          progress,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
        }),
      );
      return { status: "complete", jobId };
    }

    // Check elapsed time against threshold
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutThresholdMs) {
      console.info(
        JSON.stringify({
          level: "INFO",
          message:
            "Sync timeout threshold reached, returning continue for next iteration",
          jobId,
          progress,
          elapsedMs: elapsed,
        }),
      );

      return { status: "continue", jobId };
    }
  }
}

// --- Sync checkpoint persistence ---

async function saveSyncCheckpoint(
  jobId: string,
  checkpoint: SyncCheckpoint,
): Promise<void> {
  await importDocClient.send(
    new PutCommand({
      TableName: IMPORT_TABLE_NAME,
      Item: {
        PK: `ITEM_IMPORT#${jobId}`,
        SK: "SYNC_CHECKPOINT",
        jobId,
        exclusiveStartKey: checkpoint.exclusiveStartKey,
        progress: checkpoint.progress,
        failures: checkpoint.failures,
        lastUpdatedAt: new Date().toISOString(),
      },
    }),
  );
}

async function loadSyncCheckpoint(
  jobId: string,
): Promise<SyncCheckpoint | null> {
  const result = await importDocClient.send(
    new GetCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: `ITEM_IMPORT#${jobId}`,
        SK: "SYNC_CHECKPOINT",
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  return {
    exclusiveStartKey:
      (result.Item.exclusiveStartKey as Record<string, unknown> | null) ?? null,
    progress: result.Item.progress as ProgressCounts,
    failures: (result.Item.failures as FailureEntry[]) ?? [],
  };
}

// --- Helper functions (same as item-import-orchestrator) ---

async function resolveOrCreateEmployee(
  createdBy:
    | { id: string; name: string; user_type?: string }
    | null
    | undefined,
  cache: Map<string, string>,
): Promise<string | undefined> {
  if (!createdBy?.id) {
    return undefined;
  }

  // Check cache first
  const cached = cache.get(createdBy.id);
  if (cached) {
    return cached;
  }

  // Look up by sourceId in Shop_Table
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "sourceId-index",
      KeyConditionExpression: "#sid = :sourceId",
      ExpressionAttributeNames: { "#sid": "sourceId", "#uuid": "uuid" },
      ExpressionAttributeValues: { ":sourceId": createdBy.id },
      Limit: 1,
      ProjectionExpression: "#uuid",
    }),
  );

  if (result.Items && result.Items.length > 0) {
    const uuid = result.Items[0].uuid as string;
    cache.set(createdBy.id, uuid);
    return uuid;
  }

  // Employee doesn't exist — create on the fly
  const employeeUuid = randomUUID();
  const now = new Date().toISOString();

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `EMPLOYEE#${employeeUuid}`,
        SK: "METADATA",
        uuid: employeeUuid,
        name: createdBy.name,
        sourceId: createdBy.id,
        GSI2PK: "EMPLOYEES",
        GSI2SK: `EMPLOYEE#${employeeUuid}`,
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    }),
  );

  cache.set(createdBy.id, employeeUuid);
  return employeeUuid;
}

async function resolveOrCreateCategory(
  category: { id: string; name: string } | null | undefined,
  cache: Map<string, string>,
): Promise<string | undefined> {
  if (!category?.id) {
    return undefined;
  }

  // Check cache first
  const cached = cache.get(category.id);
  if (cached) {
    return cached;
  }

  // Look up by sourceId in Shop_Table
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "sourceId-index",
      KeyConditionExpression: "#sid = :sourceId",
      ExpressionAttributeNames: { "#sid": "sourceId", "#uuid": "uuid" },
      ExpressionAttributeValues: { ":sourceId": category.id },
      Limit: 1,
      ProjectionExpression: "#uuid",
    }),
  );

  if (result.Items && result.Items.length > 0) {
    const uuid = result.Items[0].uuid as string;
    cache.set(category.id, uuid);
    return uuid;
  }

  // Category doesn't exist — create on the fly
  const categoryUuid = randomUUID();
  const now = new Date().toISOString();

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `CATEGORY#${categoryUuid}`,
        SK: "METADATA",
        uuid: categoryUuid,
        name: category.name,
        sourceId: category.id,
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    }),
  );

  cache.set(category.id, categoryUuid);
  return categoryUuid;
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

  const cached = cache.get(accountNumber);
  if (cached) {
    return cached;
  }

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
  inventoryType: string;
  terms: string;
  taxExempt: boolean;
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
  accountUuid: string | undefined,
  sku: number,
  createdByUuid?: string,
  categoryId?: string,
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

  if (createdByUuid) record.createdBy = createdByUuid;
  if (categoryId) record.categoryId = categoryId;
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

  await importDocClient.send(
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
