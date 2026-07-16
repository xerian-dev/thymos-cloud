import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

export interface ProgressCounts {
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
}

export interface Checkpoint {
  jobId: string;
  cursor: string | null;
  progress: ProgressCounts;
  lastUpdatedAt: string;
}

export interface GenericCheckpointManagerConfig {
  prefix: string; // e.g. "ITEM_IMPORT", "SALE_IMPORT", "ACCOUNT_IMPORT"
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

export function createCheckpointManager(config: GenericCheckpointManagerConfig): {
  saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
  loadCheckpoint(jobId: string): Promise<Checkpoint | null>;
} {
  const { prefix } = config;

  async function saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: IMPORT_TABLE_NAME,
            Item: {
              PK: `${prefix}#${checkpoint.jobId}`,
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

  async function loadCheckpoint(jobId: string): Promise<Checkpoint | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: IMPORT_TABLE_NAME,
        Key: {
          PK: `${prefix}#${jobId}`,
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

  return { saveCheckpoint, loadCheckpoint };
}
