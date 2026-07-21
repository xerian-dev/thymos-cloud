import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

export type JobState =
  | "running"
  | "paused"
  | "failed"
  | "complete"
  | "cancelled";

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

export interface PointerRecord {
  jobId: string;
  state: JobState;
  phase: ImportPhase;
  progress: ProgressCounts;
  startedAt: string;
  lastUpdatedAt: string;
  error?: string;
  prefix: string;
}

export function buildPointerSK(
  prefix: string,
  lastUpdatedAt: string,
  jobId: string,
): string {
  return `${prefix}#${lastUpdatedAt}#${jobId}`;
}

export function mapPointerToImportJob(
  item: Record<string, unknown>,
): ImportJob {
  return {
    jobId: item.jobId as string,
    state: item.state as JobState,
    phase: (item.phase as ImportPhase) ?? "fetch",
    startedAt: item.startedAt as string,
    lastUpdatedAt: item.lastUpdatedAt as string,
    filterParams: {},
    error: item.error as string | undefined,
    progress: item.progress as ProgressCounts,
  };
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
  cancelled: [],
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

    const pointerSK = buildPointerSK(prefix, now, jobId);

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: IMPORT_TABLE_NAME,
              Item: {
                PK: `${prefix}#${jobId}`,
                SK: "METADATA",
                ...job,
              },
            },
          },
          {
            Put: {
              TableName: IMPORT_TABLE_NAME,
              Item: {
                PK: "JOBS",
                SK: pointerSK,
                jobId,
                state: "running" as JobState,
                phase: "fetch" as ImportPhase,
                progress: job.progress,
                startedAt: now,
                lastUpdatedAt: now,
                prefix,
              },
            },
          },
        ],
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
    const result = await docClient.send(
      new QueryCommand({
        TableName: IMPORT_TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        FilterExpression: "#state = :running OR #state = :paused",
        ExpressionAttributeNames: { "#state": "state" },
        ExpressionAttributeValues: {
          ":pk": "JOBS",
          ":skPrefix": `${prefix}#`,
          ":running": "running",
          ":paused": "paused",
        },
        ScanIndexForward: false,
      }),
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return mapPointerToImportJob(result.Items[0]);
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
    const oldPointerSK = buildPointerSK(
      prefix,
      currentJob.lastUpdatedAt,
      jobId,
    );
    const newPointerSK = buildPointerSK(prefix, now, jobId);
    const truncatedError = error ? error.slice(0, 500) : undefined;

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: IMPORT_TABLE_NAME,
              Key: { PK: `${prefix}#${jobId}`, SK: "METADATA" },
              UpdateExpression:
                "SET #state = :state, progress = :progress, lastUpdatedAt = :now" +
                (truncatedError !== undefined ? ", #error = :error" : ""),
              ExpressionAttributeNames: {
                "#state": "state",
                ...(truncatedError !== undefined ? { "#error": "error" } : {}),
              },
              ExpressionAttributeValues: {
                ":state": state,
                ":progress": progress,
                ":now": now,
                ...(truncatedError !== undefined
                  ? { ":error": truncatedError }
                  : {}),
              },
            },
          },
          {
            Delete: {
              TableName: IMPORT_TABLE_NAME,
              Key: { PK: "JOBS", SK: oldPointerSK },
            },
          },
          {
            Put: {
              TableName: IMPORT_TABLE_NAME,
              Item: {
                PK: "JOBS",
                SK: newPointerSK,
                jobId,
                state,
                phase: currentJob.phase,
                progress,
                startedAt: currentJob.startedAt,
                lastUpdatedAt: now,
                prefix,
                ...(truncatedError !== undefined
                  ? { error: truncatedError }
                  : {}),
              },
            },
          },
        ],
      }),
    );
  }

  async function updateJobPhase(
    jobId: string,
    phase: ImportPhase,
  ): Promise<void> {
    const currentJob = await getJob(jobId);
    if (!currentJob) {
      throw new Error(`${entityLabel} ${jobId} not found`);
    }

    const now = new Date().toISOString();
    const oldPointerSK = buildPointerSK(
      prefix,
      currentJob.lastUpdatedAt,
      jobId,
    );
    const newPointerSK = buildPointerSK(prefix, now, jobId);

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: IMPORT_TABLE_NAME,
              Key: { PK: `${prefix}#${jobId}`, SK: "METADATA" },
              UpdateExpression: "SET #phase = :phase, lastUpdatedAt = :now",
              ExpressionAttributeNames: { "#phase": "phase" },
              ExpressionAttributeValues: { ":phase": phase, ":now": now },
            },
          },
          {
            Delete: {
              TableName: IMPORT_TABLE_NAME,
              Key: { PK: "JOBS", SK: oldPointerSK },
            },
          },
          {
            Put: {
              TableName: IMPORT_TABLE_NAME,
              Item: {
                PK: "JOBS",
                SK: newPointerSK,
                jobId,
                state: currentJob.state,
                phase,
                progress: currentJob.progress,
                startedAt: currentJob.startedAt,
                lastUpdatedAt: now,
                prefix,
                ...(currentJob.error ? { error: currentJob.error } : {}),
              },
            },
          },
        ],
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
