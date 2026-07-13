import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { ProgressCounts } from "./checkpoint-manager";

export interface SaleFetchCheckpoint {
  jobId: string;
  cursor: string | null;
  progress: ProgressCounts;
  lastUpdatedAt: string;
}

export interface SaleSyncCheckpoint {
  jobId: string;
  exclusiveStartKey: Record<string, unknown> | null;
  progress: ProgressCounts;
  failures: Array<{ saleId: string; error: string }>;
  lineItemsImported: number;
  lastUpdatedAt: string;
}

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function saveSaleFetchCheckpoint(
  checkpoint: SaleFetchCheckpoint,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: IMPORT_TABLE_NAME,
          Item: {
            PK: `SALE_IMPORT#${checkpoint.jobId}`,
            SK: "CHECKPOINT",
            jobId: checkpoint.jobId,
            cursor: checkpoint.cursor,
            progress: checkpoint.progress,
            lastUpdatedAt: checkpoint.lastUpdatedAt,
          },
        }),
      );
      return;
    } catch (error: unknown) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

export async function loadSaleFetchCheckpoint(
  jobId: string,
): Promise<SaleFetchCheckpoint | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: `SALE_IMPORT#${jobId}`,
        SK: "CHECKPOINT",
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  return {
    jobId: result.Item.jobId as string,
    cursor: result.Item.cursor as string | null,
    progress: result.Item.progress as ProgressCounts,
    lastUpdatedAt: result.Item.lastUpdatedAt as string,
  };
}

export async function saveSaleSyncCheckpoint(
  checkpoint: SaleSyncCheckpoint,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: IMPORT_TABLE_NAME,
          Item: {
            PK: `SALE_IMPORT#${checkpoint.jobId}`,
            SK: "SYNC_CHECKPOINT",
            jobId: checkpoint.jobId,
            exclusiveStartKey: checkpoint.exclusiveStartKey,
            progress: checkpoint.progress,
            failures: checkpoint.failures,
            lineItemsImported: checkpoint.lineItemsImported,
            lastUpdatedAt: checkpoint.lastUpdatedAt,
          },
        }),
      );
      return;
    } catch (error: unknown) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

export async function loadSaleSyncCheckpoint(
  jobId: string,
): Promise<SaleSyncCheckpoint | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: `SALE_IMPORT#${jobId}`,
        SK: "SYNC_CHECKPOINT",
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  return {
    jobId: result.Item.jobId as string,
    exclusiveStartKey:
      (result.Item.exclusiveStartKey as Record<string, unknown> | null) ?? null,
    progress: result.Item.progress as ProgressCounts,
    failures: result.Item.failures as Array<{ saleId: string; error: string }>,
    lineItemsImported: result.Item.lineItemsImported as number,
    lastUpdatedAt: result.Item.lastUpdatedAt as string,
  };
}
