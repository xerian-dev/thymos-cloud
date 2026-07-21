import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  createJob,
  getJob,
  getRunningOrPausedJob,
  transitionJob,
} from "./job-manager";
import { buildPointerSK } from "./generic-job-manager";
import { getConsignCloudApiKey } from "./ssm-client";
import { createRateLimiter } from "./rate-limiter";
import { runFetchLoop } from "./item-fetch-orchestrator";
import { startStepFunction } from "./step-function-starter";
import type { ImportPhase } from "./self-invoker";

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";
const CONSIGNCLOUD_BASE_URL: string = process.env.CONSIGNCLOUD_BASE_URL ?? "";
const TIMEOUT_THRESHOLD_MS = 270_000;

export async function handleItemImportStart(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // 1. Parse body
  let createdAfter: string | undefined;
  try {
    if (event.body) {
      const parsed = JSON.parse(event.body) as { createdAfter?: string };
      createdAfter = parsed.createdAfter;
    }
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON body" }),
    };
  }

  // 2. Check for existing running/paused job
  const existingJob = await getRunningOrPausedJob();
  if (existingJob) {
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Start request rejected: existing active job",
        existingJobId: existingJob.jobId,
        existingState: existingJob.state,
      }),
    );

    return {
      statusCode: 409,
      body: JSON.stringify({
        message: "An import job is already active",
        jobId: existingJob.jobId,
        state: existingJob.state,
        startedAt: existingJob.startedAt,
      }),
    };
  }

  // 3. Create new job (starts in fetch phase)
  const job = await createJob({ createdAfter });

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Item import job created (fetch phase)",
      jobId: job.jobId,
      filterParams: job.filterParams,
    }),
  );

  // 4. Start Step Function execution to begin fetch processing
  try {
    await startStepFunction(job.jobId, "fetch");
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error
        ? error.message
        : "Failed to start import processing";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Failed to start Step Function for fetch phase",
        jobId: job.jobId,
        error: errorMsg,
      }),
    );

    await transitionJob(job.jobId, "failed", job.progress, errorMsg);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to start import processing",
        jobId: job.jobId,
      }),
    };
  }

  // 5. Return 200 with job info
  return {
    statusCode: 200,
    body: JSON.stringify({
      jobId: job.jobId,
      state: job.state,
      phase: job.phase,
      startedAt: job.startedAt,
    }),
  };
}

export async function handleItemImportResume(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // 1. Parse body
  let jobId: string | undefined;
  try {
    if (event.body) {
      const parsed = JSON.parse(event.body) as { jobId?: string };
      jobId = parsed.jobId;
    }
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON body" }),
    };
  }

  if (!jobId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "jobId is required" }),
    };
  }

  // 2. Get job
  const job = await getJob(jobId);
  if (!job) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "Job not found", jobId }),
    };
  }

  // 3. Validate state
  if (job.state !== "failed" && job.state !== "paused") {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: `Cannot resume job in '${job.state}' state. Job must be in 'failed' or 'paused' state.`,
        jobId,
        currentState: job.state,
      }),
    };
  }

  // 4. Transition to running
  await transitionJob(jobId, "running", job.progress);

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Item import job resumed",
      jobId,
      previousState: job.state,
      phase: job.phase,
    }),
  );

  // 5. Start Step Function execution (always fetch phase now)
  try {
    await startStepFunction(jobId, "fetch");
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error
        ? error.message
        : "Failed to resume import processing";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Failed to start Step Function for job resumption",
        jobId,
        error: errorMsg,
      }),
    );

    await transitionJob(jobId, "paused", job.progress, errorMsg);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to resume import processing",
        jobId,
      }),
    };
  }

  // 6. Return 200
  return {
    statusCode: 200,
    body: JSON.stringify({
      jobId,
      state: "running",
      phase: "fetch",
    }),
  };
}

export async function handleItemImportStatus(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // 1. Parse body
  let jobId: string | undefined;
  try {
    if (event.body) {
      const parsed = JSON.parse(event.body) as { jobId?: string };
      jobId = parsed.jobId;
    }
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON body" }),
    };
  }

  if (!jobId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "jobId is required" }),
    };
  }

  // 2. Get job
  const job = await getJob(jobId);
  if (!job) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "Job not found", jobId }),
    };
  }

  // 3. If complete, fetch the report
  if (job.state === "complete") {
    const report = await getImportReport(jobId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        jobId: job.jobId,
        state: job.state,
        phase: job.phase,
        startedAt: job.startedAt,
        lastUpdatedAt: job.lastUpdatedAt,
        progress: job.progress,
        report: report ?? undefined,
      }),
    };
  }

  // 4. Return status and progress
  return {
    statusCode: 200,
    body: JSON.stringify({
      jobId: job.jobId,
      state: job.state,
      phase: job.phase,
      startedAt: job.startedAt,
      lastUpdatedAt: job.lastUpdatedAt,
      progress: job.progress,
      error: job.error,
    }),
  };
}

export async function handleItemImportCancel(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // 1. Parse body
  let jobId: string | undefined;
  try {
    if (event.body) {
      const parsed = JSON.parse(event.body) as { jobId?: string };
      jobId = parsed.jobId;
    }
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON body" }),
    };
  }

  if (!jobId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "jobId is required" }),
    };
  }

  // 2. Get job
  const job = await getJob(jobId);
  if (!job) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "Job not found", jobId }),
    };
  }

  // 3. Validate state — can cancel running, paused, or failed jobs
  if (
    job.state !== "running" &&
    job.state !== "paused" &&
    job.state !== "failed"
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: `Cannot cancel job in '${job.state}' state. Job must be in 'running', 'paused', or 'failed' state.`,
        jobId,
        currentState: job.state,
      }),
    };
  }

  // 4. Transition job to cancelled state via TransactWriteCommand
  const prefix = "ITEM_IMPORT";
  const now = new Date().toISOString();
  const oldPointerSK = buildPointerSK(prefix, job.lastUpdatedAt, jobId);
  const newPointerSK = buildPointerSK(prefix, now, jobId);

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: IMPORT_TABLE_NAME,
            Key: { PK: `${prefix}#${jobId}`, SK: "METADATA" },
            UpdateExpression: "SET #state = :state, lastUpdatedAt = :now",
            ExpressionAttributeNames: { "#state": "state" },
            ExpressionAttributeValues: { ":state": "cancelled", ":now": now },
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
              state: "cancelled",
              phase: job.phase,
              progress: job.progress,
              startedAt: job.startedAt,
              lastUpdatedAt: now,
              prefix,
              ...(job.error ? { error: job.error } : {}),
            },
          },
        },
      ],
    }),
  );

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Item import job cancelled via state transition",
      jobId,
    }),
  );

  // 5. Return 200
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Item import job cancelled",
      jobId,
    }),
  };
}

export interface ResumeInternalResult {
  status: "continue" | "complete" | "failed";
  jobId: string;
  phase: ImportPhase;
  type: "item";
}

export async function handleResumeInternal(
  jobId: string,
): Promise<ResumeInternalResult> {
  // 1. Validate job exists and is in running state
  const job = await getJob(jobId);
  if (!job) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Resume-internal: job not found",
        jobId,
      }),
    );
    return { status: "failed", jobId, phase: "fetch", type: "item" };
  }

  if (job.state !== "running") {
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Resume-internal: job not in running state, skipping",
        jobId,
        currentState: job.state,
      }),
    );
    return { status: "failed", jobId, phase: "fetch", type: "item" };
  }

  return runFetchPhase(jobId, job);
}

async function runFetchPhase(
  jobId: string,
  job: {
    progress: {
      processed: number;
      imported: number;
      skipped: number;
      failed: number;
    };
  },
): Promise<ResumeInternalResult> {
  // Get API key and create rate limiter
  let apiKey: string;
  try {
    apiKey = await getConsignCloudApiKey();
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error ? error.message : "Failed to retrieve API key";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Resume-internal fetch: failed to get API key",
        jobId,
        error: errorMsg,
      }),
    );
    await transitionJob(jobId, "paused", job.progress, errorMsg);
    return { status: "failed", jobId, phase: "fetch", type: "item" };
  }

  const rateLimiter = createRateLimiter({ capacity: 100, drainRate: 10 });

  try {
    const result = await runFetchLoop({
      jobId,
      apiKey,
      baseUrl: CONSIGNCLOUD_BASE_URL,
      rateLimiter,
      startTime: Date.now(),
      timeoutThresholdMs: TIMEOUT_THRESHOLD_MS,
    });
    return { status: result.status, jobId, phase: "fetch", type: "item" };
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error ? error.message : "Fetch loop failed";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Resume-internal: fetch loop threw an error",
        jobId,
        error: errorMsg,
      }),
    );

    const currentJob = await getJob(jobId);
    if (currentJob && currentJob.state === "running") {
      await transitionJob(jobId, "paused", currentJob.progress, errorMsg);
    }
    return { status: "failed", jobId, phase: "fetch", type: "item" };
  }
}

async function getImportReport(
  jobId: string,
): Promise<Record<string, unknown> | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: "ITEM_IMPORT#REPORT",
        SK: jobId,
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  // Remove DynamoDB key attributes from the response
  const { PK, SK, ...reportData } = result.Item;
  return reportData as Record<string, unknown>;
}
