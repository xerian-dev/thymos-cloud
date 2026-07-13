import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ImportPhase, ProgressCounts } from "./job-manager";

export type SaleJobState = "running" | "paused" | "failed" | "complete";

export interface SaleImportJob {
  jobId: string;
  state: SaleJobState;
  phase: ImportPhase;
  startedAt: string;
  lastUpdatedAt: string;
  filterParams: { createdAfter?: string };
  error?: string;
  progress: ProgressCounts;
}

const VALID_TRANSITIONS: Record<SaleJobState, SaleJobState[]> = {
  running: ["complete", "paused", "failed"],
  paused: ["running"],
  failed: ["running"],
  complete: [],
};

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

export async function createSaleJob(filterParams: {
  createdAfter?: string;
}): Promise<SaleImportJob> {
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  const job: SaleImportJob = {
    jobId,
    state: "running",
    phase: "fetch",
    startedAt: now,
    lastUpdatedAt: now,
    filterParams,
    progress: {
      processed: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
    },
  };

  await docClient.send(
    new PutCommand({
      TableName: IMPORT_TABLE_NAME,
      Item: {
        PK: `SALE_IMPORT#${jobId}`,
        SK: "METADATA",
        ...job,
      },
    }),
  );

  return job;
}

export async function getSaleJob(jobId: string): Promise<SaleImportJob | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: `SALE_IMPORT#${jobId}`,
        SK: "METADATA",
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  return {
    jobId: result.Item.jobId as string,
    state: result.Item.state as SaleJobState,
    phase: (result.Item.phase as ImportPhase) ?? "fetch",
    startedAt: result.Item.startedAt as string,
    lastUpdatedAt: result.Item.lastUpdatedAt as string,
    filterParams: result.Item.filterParams as { createdAfter?: string },
    error: result.Item.error as string | undefined,
    progress: result.Item.progress as ProgressCounts,
  };
}

export async function getRunningSaleJob(): Promise<SaleImportJob | null> {
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: IMPORT_TABLE_NAME,
        FilterExpression:
          "begins_with(PK, :pkPrefix) AND SK = :sk AND (#state = :running OR #state = :paused)",
        ExpressionAttributeNames: {
          "#state": "state",
        },
        ExpressionAttributeValues: {
          ":pkPrefix": "SALE_IMPORT#",
          ":running": "running",
          ":paused": "paused",
          ":sk": "METADATA",
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    if (result.Items && result.Items.length > 0) {
      const item = result.Items[0];
      return {
        jobId: item.jobId as string,
        state: item.state as SaleJobState,
        phase: (item.phase as ImportPhase) ?? "fetch",
        startedAt: item.startedAt as string,
        lastUpdatedAt: item.lastUpdatedAt as string,
        filterParams: item.filterParams as { createdAfter?: string },
        error: item.error as string | undefined,
        progress: item.progress as ProgressCounts,
      };
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return null;
}

export async function transitionSaleJob(
  jobId: string,
  state: SaleJobState,
  progress: ProgressCounts,
  error?: string,
): Promise<void> {
  const currentJob = await getSaleJob(jobId);
  if (!currentJob) {
    throw new Error(`Sale job ${jobId} not found`);
  }

  const validTargets = VALID_TRANSITIONS[currentJob.state];
  if (!validTargets.includes(state)) {
    throw new Error(
      `Invalid state transition: cannot transition from '${currentJob.state}' to '${state}'`,
    );
  }

  const now = new Date().toISOString();
  const truncatedError = error ? error.slice(0, 500) : undefined;

  await docClient.send(
    new UpdateCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: `SALE_IMPORT#${jobId}`,
        SK: "METADATA",
      },
      UpdateExpression:
        "SET #state = :state, progress = :progress, lastUpdatedAt = :lastUpdatedAt" +
        (truncatedError !== undefined ? ", #error = :error" : ""),
      ExpressionAttributeNames: {
        "#state": "state",
        ...(truncatedError !== undefined ? { "#error": "error" } : {}),
      },
      ExpressionAttributeValues: {
        ":state": state,
        ":progress": progress,
        ":lastUpdatedAt": now,
        ...(truncatedError !== undefined ? { ":error": truncatedError } : {}),
      },
    }),
  );
}

export async function updateSaleJobPhase(
  jobId: string,
  phase: ImportPhase,
): Promise<void> {
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: `SALE_IMPORT#${jobId}`,
        SK: "METADATA",
      },
      UpdateExpression: "SET #phase = :phase, lastUpdatedAt = :lastUpdatedAt",
      ExpressionAttributeNames: {
        "#phase": "phase",
      },
      ExpressionAttributeValues: {
        ":phase": phase,
        ":lastUpdatedAt": now,
      },
    }),
  );
}
