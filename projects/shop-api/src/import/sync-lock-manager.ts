import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export interface SyncLock {
  lockedAt: string;
  correlationId: string;
  ttl: number;
}

export type LockAcquisitionResult =
  | { acquired: true }
  | { acquired: false; existingLock: SyncLock; stale: boolean };

const LOCK_PK = "SYNC_LOCK";
const LOCK_SK = "METADATA";
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes in milliseconds
const TTL_OFFSET_SECONDS = 60 * 60; // 60 minutes in seconds

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

function isStale(lockedAt: string, now: Date): boolean {
  const lockedAtTime = new Date(lockedAt).getTime();
  const nowTime = now.getTime();
  return nowTime - lockedAtTime > STALE_THRESHOLD_MS;
}

export async function acquireLock(
  correlationId: string,
): Promise<LockAcquisitionResult> {
  const now = new Date();
  const lockedAt = now.toISOString();
  const ttl = Math.floor(now.getTime() / 1000) + TTL_OFFSET_SECONDS;

  try {
    await docClient.send(
      new PutCommand({
        TableName: IMPORT_TABLE_NAME,
        Item: {
          PK: LOCK_PK,
          SK: LOCK_SK,
          lockedAt,
          correlationId,
          ttl,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    return { acquired: true };
  } catch (error: unknown) {
    if (error instanceof ConditionalCheckFailedException) {
      const existingLock = await readExistingLock();

      if (!existingLock) {
        console.error(
          JSON.stringify({
            message: "Lock record disappeared after conditional check failure",
            correlationId,
          }),
        );
        return {
          acquired: false,
          existingLock: { lockedAt: "", correlationId: "", ttl: 0 },
          stale: false,
        };
      }

      const stale = isStale(existingLock.lockedAt, now);

      return { acquired: false, existingLock, stale };
    }

    throw error;
  }
}

export async function forceAcquireStaleLock(
  correlationId: string,
  expectedLockedAt: string,
): Promise<boolean> {
  const now = new Date();
  const lockedAt = now.toISOString();
  const ttl = Math.floor(now.getTime() / 1000) + TTL_OFFSET_SECONDS;

  try {
    await docClient.send(
      new PutCommand({
        TableName: IMPORT_TABLE_NAME,
        Item: {
          PK: LOCK_PK,
          SK: LOCK_SK,
          lockedAt,
          correlationId,
          ttl,
        },
        ConditionExpression: "lockedAt = :expectedLockedAt",
        ExpressionAttributeValues: {
          ":expectedLockedAt": expectedLockedAt,
        },
      }),
    );

    return true;
  } catch (error: unknown) {
    if (error instanceof ConditionalCheckFailedException) {
      return false;
    }

    throw error;
  }
}

export async function releaseLock(): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: LOCK_PK,
        SK: LOCK_SK,
      },
    }),
  );
}

async function readExistingLock(): Promise<SyncLock | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: LOCK_PK,
        SK: LOCK_SK,
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  return {
    lockedAt: result.Item.lockedAt as string,
    correlationId: result.Item.correlationId as string,
    ttl: result.Item.ttl as number,
  };
}
