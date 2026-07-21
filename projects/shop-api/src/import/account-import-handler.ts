import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  accountJobManager,
  accountCheckpointManager,
  runAccountFetchLoop,
} from "./account-fetch-orchestrator";
import { buildPointerSK } from "./generic-job-manager";
import { getConsignCloudApiKey } from "./ssm-client";
import { createRateLimiter } from "./rate-limiter";
import { startStepFunction } from "./step-function-starter";

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";
const CONSIGNCLOUD_BASE_URL: string = process.env.CONSIGNCLOUD_BASE_URL ?? "";
const TIMEOUT_THRESHOLD_MS = 270_000;

export async function handleAccountImportStart(
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

  // 2. Check for existing running/paused account job
  const existingJob = await accountJobManager.getRunningOrPausedJob();
  if (existingJob) {
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Account import start request rejected: existing active job",
        existingJobId: existingJob.jobId,
        existingState: existingJob.state,
      }),
    );

    return {
      statusCode: 409,
      body: JSON.stringify({
        message: "An account import job is already active",
        jobId: existingJob.jobId,
        state: existingJob.state,
        startedAt: existingJob.startedAt,
      }),
    };
  }

  // 3. Create new job (starts in fetch phase)
  const job = await accountJobManager.createJob({ createdAfter });

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Account import job created (fetch phase)",
      jobId: job.jobId,
      filterParams: job.filterParams,
    }),
  );

  // 4. Start Step Function execution to begin fetch processing
  try {
    await startStepFunction(job.jobId, "fetch", "account");
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error
        ? error.message
        : "Failed to start account import processing";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Failed to start Step Function for account fetch phase",
        jobId: job.jobId,
        error: errorMsg,
      }),
    );

    await accountJobManager.transitionJob(
      job.jobId,
      "failed",
      job.progress,
      errorMsg,
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to start account import processing",
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

export async function handleAccountImportStatus(
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
  const job = await accountJobManager.getJob(jobId);
  if (!job) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "Job not found", jobId }),
    };
  }

  // 3. Return status and progress (no report lookup for accounts)
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

export async function handleAccountImportResume(
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
  const job = await accountJobManager.getJob(jobId);
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
  await accountJobManager.transitionJob(jobId, "running", job.progress);

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Account import job resumed",
      jobId,
      previousState: job.state,
      phase: job.phase,
    }),
  );

  // 5. Start Step Function execution (always fetch phase for accounts)
  try {
    await startStepFunction(jobId, "fetch", "account");
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error
        ? error.message
        : "Failed to resume account import processing";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Failed to start Step Function for account job resumption",
        jobId,
        error: errorMsg,
      }),
    );

    await accountJobManager.transitionJob(
      jobId,
      "paused",
      job.progress,
      errorMsg,
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to resume account import processing",
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

export async function handleAccountImportCancel(
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
  const job = await accountJobManager.getJob(jobId);
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

  // 4. Transition to cancelled state via transaction with pointer update
  const now = new Date().toISOString();
  const prefix = "ACCOUNT_IMPORT";
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
      message: "Account import job cancelled",
      jobId,
    }),
  );

  // 5. Return 200
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Account import job cancelled",
      jobId,
    }),
  };
}

export interface AccountResumeInternalResult {
  status: "continue" | "complete" | "failed";
  jobId: string;
  phase: "fetch";
  type: "account";
}

export async function handleAccountResumeInternal(
  jobId: string,
  _phase?: string,
): Promise<AccountResumeInternalResult> {
  // 1. Validate job exists and is in running state
  const job = await accountJobManager.getJob(jobId);
  if (!job) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Account resume-internal: job not found",
        jobId,
      }),
    );
    return { status: "failed", jobId, phase: "fetch", type: "account" };
  }

  if (job.state !== "running") {
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Account resume-internal: job not in running state, skipping",
        jobId,
        currentState: job.state,
      }),
    );
    return { status: "failed", jobId, phase: "fetch", type: "account" };
  }

  // 2. Get API key
  let apiKey: string;
  try {
    apiKey = await getConsignCloudApiKey();
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error ? error.message : "Failed to retrieve API key";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Account resume-internal: failed to get API key",
        jobId,
        error: errorMsg,
      }),
    );
    await accountJobManager.transitionJob(
      jobId,
      "paused",
      job.progress,
      errorMsg,
    );
    return { status: "failed", jobId, phase: "fetch", type: "account" };
  }

  // 3. Create rate limiter
  const rateLimiter = createRateLimiter({ capacity: 100, drainRate: 10 });

  // 4. Run the fetch loop
  const startTime = Date.now();
  try {
    const result = await runAccountFetchLoop({
      jobId,
      apiKey,
      baseUrl: CONSIGNCLOUD_BASE_URL,
      rateLimiter,
      startTime,
      timeoutThresholdMs: TIMEOUT_THRESHOLD_MS,
    });

    if (result.status === "complete") {
      // The generic fetch loop set the job to "paused" when all pages were exhausted.
      // For accounts there is no sync phase, so finalize the job here.
      const finalJob = await accountJobManager.getJob(jobId);
      const progress = finalJob?.progress ?? {
        processed: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
      };

      // Transition paused → running → complete
      await accountJobManager.transitionJob(jobId, "running", progress);
      await accountJobManager.transitionJob(jobId, "complete", progress);

      // Write import report
      await docClient.send(
        new PutCommand({
          TableName: IMPORT_TABLE_NAME,
          Item: {
            PK: "ACCOUNT_IMPORT#REPORT",
            SK: jobId,
            jobId,
            totalProcessed: progress.processed,
            imported: progress.imported,
            skipped: progress.skipped,
            failed: progress.failed,
            elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
            failures: [],
            truncated: false,
            totalFailures: 0,
            completedAt: new Date().toISOString(),
          },
        }),
      );

      console.info(
        JSON.stringify({
          level: "INFO",
          message: "Account import job completed",
          jobId,
          progress,
        }),
      );

      return { status: "complete", jobId, phase: "fetch", type: "account" };
    }

    // status === "continue" — timeout reached, Step Function will re-invoke
    return { status: result.status, jobId, phase: "fetch", type: "account" };
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error ? error.message : "Account fetch loop failed";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Account resume-internal: fetch loop threw an error",
        jobId,
        error: errorMsg,
      }),
    );

    // 5. On error, transition job to "paused" (not "failed")
    const currentJob = await accountJobManager.getJob(jobId);
    if (currentJob && currentJob.state === "running") {
      await accountJobManager.transitionJob(
        jobId,
        "paused",
        currentJob.progress,
        errorMsg,
      );
    }
    return { status: "failed", jobId, phase: "fetch", type: "account" };
  }
}
