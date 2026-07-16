import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  QueryCommand,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ProgressCounts } from "./checkpoint-manager";
import { getSaleJob, transitionSaleJob } from "./sale-job-manager";
import {
  saveSaleSyncCheckpoint,
  loadSaleSyncCheckpoint,
} from "./sale-checkpoint-manager";
import {
  mapConsignCloudSale,
  buildSaleKeys,
  buildLineItemSk,
  isFinalizedSale,
} from "./sale-mapper";
import {
  ConsignCloudSale,
  ConsignCloudLineItem,
} from "./sale-consigncloud-client";
import { docClient, TABLE_NAME } from "../dynamodb-client";
import { randomUUID } from "node:crypto";

export interface SaleSyncOrchestratorConfig {
  jobId: string;
  startTime: number;
  timeoutThresholdMs: number;
}

export interface SaleSyncLoopResult {
  status: "continue" | "complete";
  jobId: string;
}

interface FailureEntry {
  saleId: string;
  error: string;
}

const MAX_FAILURES_IN_REPORT = 100;
const MAX_ERROR_LENGTH = 200;
const MAX_SALE_NUMBER_RETRIES = 3;
const SCAN_LIMIT = 1000;

const importClient = new DynamoDBClient({});
const importDocClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(
  importClient,
  { marshallOptions: { removeUndefinedValues: true } },
);

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

export async function runSaleSyncLoop(
  config: SaleSyncOrchestratorConfig,
): Promise<SaleSyncLoopResult> {
  const { jobId, startTime, timeoutThresholdMs } = config;

  // 1. Load job
  const job = await getSaleJob(jobId);
  if (!job) {
    throw new Error(`Sale job ${jobId} not found`);
  }

  // 2. Load sync checkpoint if exists
  const syncCheckpoint = await loadSaleSyncCheckpoint(jobId);

  let exclusiveStartKey: Record<string, unknown> | null =
    syncCheckpoint?.exclusiveStartKey ?? null;
  const progress: ProgressCounts = syncCheckpoint?.progress ?? {
    processed: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
  };
  const failures: FailureEntry[] = syncCheckpoint?.failures ?? [];
  let lineItemsImported: number = syncCheckpoint?.lineItemsImported ?? 0;

  // 3. Initialize in-memory caches
  const employeeCache = new Map<string, string>();
  const itemCache = new Map<string, string | null>();

  // Log start
  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Sale sync loop started",
      jobId,
      isResume: syncCheckpoint !== null,
      progress,
      lineItemsImported,
    }),
  );

  // 4. Scan loop
  for (;;) {
    const scanResult = await importDocClient.send(
      new ScanCommand({
        TableName: IMPORT_TABLE_NAME,
        FilterExpression: "begins_with(PK, :pkPrefix) AND SK = :sk",
        ExpressionAttributeValues: {
          ":pkPrefix": "IMPORT#CONSIGNCLOUD#SALE#",
          ":sk": "METADATA",
        },
        Limit: SCAN_LIMIT,
        ExclusiveStartKey: exclusiveStartKey ?? undefined,
      }),
    );

    const items = scanResult.Items ?? [];

    // Process each staged sale
    for (const record of items) {
      const sale = record as unknown as ConsignCloudSale & {
        PK: string;
        SK: string;
        line_items?: ConsignCloudLineItem[];
        importedAt: string;
      };

      // Skip non-finalized sales (open or voided)
      if (!isFinalizedSale(sale)) {
        progress.skipped++;
        progress.processed++;
        continue;
      }

      // Check deduplication: does sourceId already exist in Shop_Table?
      const isDuplicate = await checkSaleSourceIdExists(sale.id);
      if (isDuplicate) {
        progress.skipped++;
        progress.processed++;
        continue;
      }

      // Map sale fields
      const mappingResult = mapConsignCloudSale(sale);
      if (!mappingResult.success) {
        const errorMsg = mappingResult.error;
        recordFailure(failures, sale.id, errorMsg);
        progress.failed++;
        progress.processed++;
        console.info(
          JSON.stringify({
            level: "WARN",
            message: "Sale sync failed: mapping error",
            jobId,
            saleId: sale.id,
            reason: errorMsg,
          }),
        );
        continue;
      }

      // Resolve cashier
      const cashierId = await resolveOrCreateEmployee(
        sale.cashier,
        employeeCache,
      );

      // Resolve line item references
      const lineItems = sale.line_items ?? [];
      const resolvedLineItemIds: (string | null)[] = [];
      for (const lineItem of lineItems) {
        const itemSourceId = extractItemSourceId(lineItem);
        if (!itemSourceId) {
          resolvedLineItemIds.push(null);
          continue;
        }

        const itemId = await resolveItemBySourceId(itemSourceId, itemCache);
        if (itemId === null) {
          console.info(
            JSON.stringify({
              level: "WARN",
              message: "Line item references unresolved item",
              jobId,
              saleId: sale.id,
              itemSourceId,
            }),
          );
        }
        resolvedLineItemIds.push(itemId);
      }

      // Generate sale number: atomic increment SEQUENCE#SALE / COUNTER
      let saleNumber: number;
      try {
        saleNumber = await getNextSaleNumber();
      } catch (error: unknown) {
        const errorMsg =
          error instanceof Error
            ? `Sale number generation failed: ${error.message}`
            : "Sale number generation failed";
        recordFailure(failures, sale.id, errorMsg);
        progress.failed++;
        progress.processed++;
        continue;
      }

      // Build keys
      const saleUuid = randomUUID();
      const saleKeys = buildSaleKeys(saleUuid, saleNumber);
      const now = new Date().toISOString();

      // Build TransactWrite items: Sale record + all Sale_Line_Item records
      const transactItems: Array<Record<string, unknown>> = [];

      // Sale record
      transactItems.push({
        Put: {
          TableName: TABLE_NAME,
          Item: {
            ...saleKeys,
            uuid: saleUuid,
            number: saleNumber,
            sourceNumber: mappingResult.mapped.sourceNumber,
            status: mappingResult.mapped.status,
            cashierId: cashierId ?? null,
            subtotal: mappingResult.mapped.subtotal,
            total: mappingResult.mapped.total,
            storePortion: mappingResult.mapped.storePortion,
            consignorPortion: mappingResult.mapped.consignorPortion,
            change: mappingResult.mapped.change,
            memo: mappingResult.mapped.memo,
            finalizedAt: mappingResult.mapped.finalizedAt,
            voidedAt: mappingResult.mapped.voidedAt,
            sourceId: mappingResult.mapped.sourceId,
            createdAt: mappingResult.mapped.createdAt,
            importedAt: now,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      });

      // Line Item records
      for (let i = 0; i < mappingResult.lineItems.length; i++) {
        const mappedLineItem = mappingResult.lineItems[i];
        const lineItemSk = buildLineItemSk(i);

        transactItems.push({
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: saleKeys.PK,
              SK: lineItemSk,
              itemId: resolvedLineItemIds[i] ?? null,
              salePrice: mappedLineItem.salePrice,
              discount: mappedLineItem.discount,
              consignorPortion: mappedLineItem.consignorPortion,
              storePortion: mappedLineItem.storePortion,
              quantity: mappedLineItem.quantity,
              daysOnShelf: mappedLineItem.daysOnShelf,
            },
          },
        });
      }

      // Execute TransactWrite
      try {
        await docClient.send(
          new TransactWriteCommand({
            TransactItems: transactItems,
          }),
        );
        progress.imported++;
        progress.processed++;
        lineItemsImported += mappingResult.lineItems.length;
      } catch (error: unknown) {
        if (isTransactionCanceledException(error)) {
          // Treat as duplicate (conditional check failed)
          progress.skipped++;
          progress.processed++;
        } else {
          const errorMsg =
            error instanceof Error
              ? `TransactWrite failed: ${error.message}`
              : "TransactWrite failed";
          recordFailure(failures, sale.id, errorMsg);
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
        message: "Sale sync scan page processed",
        jobId,
        itemsInPage: items.length,
        progress,
        lineItemsImported,
        hasMorePages: exclusiveStartKey !== null,
      }),
    );

    // Save sync checkpoint
    await saveSaleSyncCheckpoint({
      jobId,
      exclusiveStartKey,
      progress,
      failures: failures.slice(0, MAX_FAILURES_IN_REPORT),
      lineItemsImported,
      lastUpdatedAt: new Date().toISOString(),
    });

    // Check if scan is complete
    if (exclusiveStartKey === null) {
      // Sync complete
      await transitionSaleJob(jobId, "complete", progress);
      await writeSaleImportReport(
        jobId,
        progress,
        failures,
        lineItemsImported,
        startTime,
      );

      console.info(
        JSON.stringify({
          level: "INFO",
          message: "Sale sync phase completed",
          jobId,
          state: "complete",
          progress,
          lineItemsImported,
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
            "Sale sync timeout threshold reached, returning continue for next iteration",
          jobId,
          progress,
          lineItemsImported,
          elapsedMs: elapsed,
        }),
      );

      return { status: "continue", jobId };
    }
  }
}

// --- Helper functions ---

async function checkSaleSourceIdExists(sourceId: string): Promise<boolean> {
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

async function resolveOrCreateEmployee(
  cashier: { id: string; name: string } | null | undefined,
  cache: Map<string, string>,
): Promise<string | null> {
  if (!cashier?.id) {
    return null;
  }

  // Check cache first
  const cached = cache.get(cashier.id);
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
      ExpressionAttributeValues: { ":sourceId": cashier.id },
      Limit: 1,
      ProjectionExpression: "#uuid",
    }),
  );

  if (result.Items && result.Items.length > 0) {
    const uuid = result.Items[0].uuid as string;
    cache.set(cashier.id, uuid);
    return uuid;
  }

  // Employee doesn't exist — create on the fly
  const employeeUuid = randomUUID();
  const now = new Date().toISOString();

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `EMPLOYEE#${employeeUuid}`,
          SK: "METADATA",
          uuid: employeeUuid,
          name: cashier.name,
          sourceId: cashier.id,
          GSI2PK: "EMPLOYEES",
          GSI2SK: `EMPLOYEE#${employeeUuid}`,
          createdAt: now,
          updatedAt: now,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
  } catch (error: unknown) {
    if (isConditionalCheckFailed(error)) {
      // Another invocation created it — look up again
      const retryResult = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "sourceId-index",
          KeyConditionExpression: "#sid = :sourceId",
          ExpressionAttributeNames: { "#sid": "sourceId", "#uuid": "uuid" },
          ExpressionAttributeValues: { ":sourceId": cashier.id },
          Limit: 1,
          ProjectionExpression: "#uuid",
        }),
      );

      if (retryResult.Items && retryResult.Items.length > 0) {
        const uuid = retryResult.Items[0].uuid as string;
        cache.set(cashier.id, uuid);
        return uuid;
      }
    }
    // Non-conditional failure — return null (non-fatal)
    return null;
  }

  cache.set(cashier.id, employeeUuid);
  return employeeUuid;
}

function extractItemSourceId(lineItem: ConsignCloudLineItem): string | null {
  if (!lineItem.item) {
    return null;
  }

  return lineItem.item.id ?? null;
}

async function resolveItemBySourceId(
  sourceId: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  // Check cache first
  const cached = cache.get(sourceId);
  if (cached !== undefined) {
    return cached;
  }

  // Look up by sourceId in Shop_Table
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "sourceId-index",
      KeyConditionExpression: "#sid = :sourceId",
      ExpressionAttributeNames: { "#sid": "sourceId", "#uuid": "uuid" },
      ExpressionAttributeValues: { ":sourceId": sourceId },
      Limit: 1,
      ProjectionExpression: "#uuid",
    }),
  );

  if (result.Items && result.Items.length > 0) {
    const uuid = result.Items[0].uuid as string;
    cache.set(sourceId, uuid);
    return uuid;
  }

  cache.set(sourceId, null);
  return null;
}

async function getNextSaleNumber(): Promise<number> {
  for (let attempt = 0; attempt < MAX_SALE_NUMBER_RETRIES; attempt++) {
    const counterResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: "SEQUENCE#SALE", SK: "COUNTER" },
        ProjectionExpression: "#val",
        ExpressionAttributeNames: { "#val": "value" },
      }),
    );

    const currentCounter = (counterResult.Item?.value as number) ?? 0;
    const nextNumber = currentCounter + 1;

    const counterUpdate =
      currentCounter === 0
        ? {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: "SEQUENCE#SALE",
                SK: "COUNTER",
                value: 1,
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          }
        : {
            Update: {
              TableName: TABLE_NAME,
              Key: { PK: "SEQUENCE#SALE", SK: "COUNTER" },
              UpdateExpression: "SET #val = :newVal",
              ConditionExpression: "#val = :currentVal",
              ExpressionAttributeNames: { "#val": "value" },
              ExpressionAttributeValues: {
                ":newVal": nextNumber,
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
      return nextNumber;
    } catch (error: unknown) {
      if (isTransactionCanceledException(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Failed to increment sale number counter after ${MAX_SALE_NUMBER_RETRIES} attempts`,
  );
}

async function writeSaleImportReport(
  jobId: string,
  progress: ProgressCounts,
  failures: FailureEntry[],
  lineItemsImported: number,
  startTime: number,
): Promise<void> {
  const completedAt = new Date().toISOString();
  const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
  const totalFailures = progress.failed;
  const truncated = totalFailures > MAX_FAILURES_IN_REPORT;

  const reportFailures = failures.slice(0, MAX_FAILURES_IN_REPORT).map((f) => ({
    saleId: f.saleId,
    error: f.error.slice(0, MAX_ERROR_LENGTH),
  }));

  await importDocClient.send(
    new PutCommand({
      TableName: IMPORT_TABLE_NAME,
      Item: {
        PK: "SALE_IMPORT#REPORT",
        SK: jobId,
        jobId,
        totalProcessed: progress.processed,
        imported: progress.imported,
        skipped: progress.skipped,
        failed: progress.failed,
        lineItemsImported,
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
  saleId: string,
  error: string,
): void {
  if (failures.length < MAX_FAILURES_IN_REPORT) {
    failures.push({
      saleId,
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
