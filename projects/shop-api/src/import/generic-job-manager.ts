import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

export type JobState = "running" | "paused" | "failed" | "complete";

export type ImportPhase = "fetch" | "sync";

export interface ProgressCounts {
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
}

export interface ImportJob {
  jobId: string;
  state: JobState;
  phase: ImportPhase;
  startedAt: string;
  lastUpdatedAt: string;
  filterParams: { createdAfter?: string };
  error?: string;
  progress: ProgressCounts;
}

export interface GenericJobManagerConfig {
  prefix: string;
  entityLabel?: string;
}

const VALID_TRANSITIONS: Record<JobState, JobState[]> = {
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

export function createJobManager(config: GenericJobManagerConfig): {
  createJob(filterParams: { createdAfter?: string }): Promise<ImportJob>;
  getJob(jobId: string): Promise<ImportJob | null>;
  getRunningOrPausedJob(): Promise<ImportJob | null>;
  transitionJob(
    jobId: string,
    state: JobState,
    progress: ProgressCounts,
    error?: string,
  ): Promise<void>;
  updateJobPhase(jobId: string, phase: ImportPhase): Promise<void>;
} {
  const { prefix, entityLabel = "Job" } = config;

  async function createJob(filterParams: {
    createdAfter?: string;
  }): Promise<ImportJob> {
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    const job: ImportJob = {
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
          PK: `${prefix}#${jobId}`,
          SK: "METADATA",
          ...job,
        },
      }),
    );

    return job;
  }

  async function getJob(jobId: string): Promise<ImportJob | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: IMPORT_TABLE_NAME,
        Key: {
          PK: `${prefix}#${jobId}`,
          SK: "METADATA",
        },
      }),
    );

    if (!result.Item) {
      return null;
    }

    return {
      jobId: result.Item.jobId as string,
      state: result.Item.state as JobState,
      phase: (result.Item.phase as ImportPhase) ?? "fetch",
      startedAt: result.Item.startedAt as string,
      lastUpdatedAt: result.Item.lastUpdatedAt as string,
      filterParams: result.Item.filterParams as { createdAfter?: string },
      error: result.Item.error as string | undefined,
      progress: result.Item.progress as ProgressCounts,
    };
  }

  async function getRunningOrPausedJob(): Promise<ImportJob | null> {
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
            ":pkPrefix": `${prefix}#`,
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
          state: item.state as JobState,
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

  async function transitionJob(
    jobId: string,
    state: JobState,
    progress: ProgressCounts,
    error?: string,
  ): Promise<void> {
    const currentJob = await getJob(jobId);
    if (!currentJob) {
      throw new Error(`${entityLabel} ${jobId} not found`);
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
          PK: `${prefix}#${jobId}`,
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

  async function updateJobPhase(
    jobId: string,
    phase: ImportPhase,
  ): Promise<void> {
    const now = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: IMPORT_TABLE_NAME,
        Key: {
          PK: `${prefix}#${jobId}`,
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

  return {
    createJob,
    getJob,
    getRunningOrPausedJob,
    transitionJob,
    updateJobPhase,
  };
}
