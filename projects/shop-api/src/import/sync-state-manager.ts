import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

export interface SyncState {
  lastAccountSyncAt: string | null;
  lastItemSyncAt: string | null;
  lastSaleSyncAt: string | null;
  updatedAt: string;
}

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

const SYNC_STATE_PK = "SYNC_STATE";
const SYNC_STATE_SK = "METADATA";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

export async function getSyncState(): Promise<SyncState | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: SYNC_STATE_PK,
        SK: SYNC_STATE_SK,
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  return {
    lastAccountSyncAt: (result.Item.lastAccountSyncAt as string) ?? null,
    lastItemSyncAt: (result.Item.lastItemSyncAt as string) ?? null,
    lastSaleSyncAt: (result.Item.lastSaleSyncAt as string) ?? null,
    updatedAt: result.Item.updatedAt as string,
  };
}

export async function updateSyncStateField(
  field: "lastAccountSyncAt" | "lastItemSyncAt" | "lastSaleSyncAt",
  value: string,
): Promise<void> {
  const now = new Date().toISOString();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: IMPORT_TABLE_NAME,
          Key: {
            PK: SYNC_STATE_PK,
            SK: SYNC_STATE_SK,
          },
          UpdateExpression: "SET #field = :value, #updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#field": field,
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":value": value,
            ":updatedAt": now,
          },
        }),
      );
      return;
    } catch (error: unknown) {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        console.error(
          JSON.stringify({
            level: "ERROR",
            message: "Failed to update sync state field after retries",
            field,
            value,
            attempts: MAX_ATTEMPTS,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  }
}
