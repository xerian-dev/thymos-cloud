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
  createSaleJob,
  getSaleJob,
  getRunningSaleJob,
  transitionSaleJob,
  updateSaleJobPhase,
} from "./sale-job-manager";
import { buildPointerSK } from "./generic-job-manager";
import { getConsignCloudApiKey } from "./ssm-client";
import { createRateLimiter } from "./rate-limiter";
import { runSaleFetchLoop } from "./sale-fetch-orchestrator";
import { runSaleSyncLoop } from "./sale-sync-orchestrator";
import { startStepFunction } from "./step-function-starter";
import type { ImportPhase } from "./self-invoker";

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";
const CONSIGNCLOUD_BASE_URL: string = process.env.CONSIGNCLOUD_BASE_URL ?? "";
const TIMEOUT_THRESHOLD_MS = 270_000;

export async function handleSaleImportStart(
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

  // 2. Check for existing running/paused sale job
  const existingJob = await getRunningSaleJob();
  if (existingJob) {
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Sale import start request rejected: existing active job",
        existingJobId: existingJob.jobId,
        existingState: existingJob.state,
      }),
    );

    return {
      statusCode: 409,
      body: JSON.stringify({
        message: "A sale import job is already active",
        jobId: existingJob.jobId,
        state: existingJob.state,
        startedAt: existingJob.startedAt,
      }),
    };
  }

  // 3. Create new job (starts in fetch phase)
  const job = await createSaleJob({ createdAfter });

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Sale import job created (fetch phase)",
      jobId: job.jobId,
      filterParams: job.filterParams,
    }),
  );

  // 4. Start Step Function execution to begin fetch processing
  try {
    await startStepFunction(job.jobId, "fetch", "sale");
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error
        ? error.message
        : "Failed to start sale import processing";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Failed to start Step Function for sale fetch phase",
        jobId: job.jobId,
        error: errorMsg,
      }),
    );

    await transitionSaleJob(job.jobId, "failed", job.progress, errorMsg);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to start sale import processing",
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

export async function handleSaleImportSync(
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
  const job = await getSaleJob(jobId);
  if (!job) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "Job not found", jobId }),
    };
  }

  // 3. Validate state — sync can start from paused (after fetch completes) or failed
  if (job.state !== "paused" && job.state !== "failed") {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: `Cannot start sync for job in '${job.state}' state. Job must be in 'paused' or 'failed' state (fetch phase should be complete).`,
        jobId,
        currentState: job.state,
        currentPhase: job.phase,
      }),
    };
  }

  // 4. Update phase to sync and transition to running
  await updateSaleJobPhase(jobId, "sync");
  await transitionSaleJob(jobId, "running", job.progress);

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Sale import sync phase started",
      jobId,
    }),
  );

  // 5. Start Step Function execution to begin sync processing
  try {
    await startStepFunction(jobId, "sync", "sale");
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error
        ? error.message
        : "Failed to start sale sync processing";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Failed to start Step Function for sale sync phase",
        jobId,
        error: errorMsg,
      }),
    );

    await transitionSaleJob(jobId, "paused", job.progress, errorMsg);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to start sale sync processing",
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
      phase: "sync",
    }),
  };
}

export async function handleSaleImportResume(
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
  const job = await getSaleJob(jobId);
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
  await transitionSaleJob(jobId, "running", job.progress);

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Sale import job resumed",
      jobId,
      previousState: job.state,
      phase: job.phase,
    }),
  );

  // 5. Start Step Function execution with the current phase
  const phase: ImportPhase = job.phase;
  try {
    await startStepFunction(jobId, phase, "sale");
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error
        ? error.message
        : "Failed to resume sale import processing";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Failed to start Step Function for sale job resumption",
        jobId,
        phase,
        error: errorMsg,
      }),
    );

    await transitionSaleJob(jobId, "paused", job.progress, errorMsg);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to resume sale import processing",
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
      phase,
    }),
  };
}

export async function handleSaleImportStatus(
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
  const job = await getSaleJob(jobId);
  if (!job) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "Job not found", jobId }),
    };
  }

  // 3. If complete, fetch the report
  if (job.state === "complete") {
    const report = await getSaleImportReport(jobId);

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

export async function handleSaleImportCancel(
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
  const job = await getSaleJob(jobId);
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

  // 4. Transition to cancelled state with pointer update
  const now = new Date().toISOString();
  const oldPointerSK = buildPointerSK("SALE_IMPORT", job.lastUpdatedAt, jobId);
  const newPointerSK = buildPointerSK("SALE_IMPORT", now, jobId);

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: IMPORT_TABLE_NAME,
            Key: { PK: `SALE_IMPORT#${jobId}`, SK: "METADATA" },
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
              prefix: "SALE_IMPORT",
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
      message: "Sale import job cancelled",
      jobId,
    }),
  );

  // 5. Return 200
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Sale import job cancelled",
      jobId,
    }),
  };
}

export interface SaleResumeInternalResult {
  status: "continue" | "complete" | "failed";
  jobId: string;
  phase: ImportPhase;
  type: "sale";
}

export async function handleSaleResumeInternal(
  jobId: string,
  phase: ImportPhase = "fetch",
): Promise<SaleResumeInternalResult> {
  // 1. Validate job exists and is in running state
  const job = await getSaleJob(jobId);
  if (!job) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Sale resume-internal: job not found",
        jobId,
      }),
    );
    return { status: "failed", jobId, phase, type: "sale" };
  }

  if (job.state !== "running") {
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Sale resume-internal: job not in running state, skipping",
        jobId,
        currentState: job.state,
      }),
    );
    return { status: "failed", jobId, phase, type: "sale" };
  }

  if (phase === "fetch") {
    return runSaleFetchPhase(jobId, job);
  } else {
    return runSaleSyncPhase(jobId, job);
  }
}

async function runSaleFetchPhase(
  jobId: string,
  job: {
    progress: {
      processed: number;
      imported: number;
      skipped: number;
      failed: number;
    };
  },
): Promise<SaleResumeInternalResult> {
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
        message: "Sale resume-internal fetch: failed to get API key",
        jobId,
        error: errorMsg,
      }),
    );
    await transitionSaleJob(jobId, "paused", job.progress, errorMsg);
    return { status: "failed", jobId, phase: "fetch", type: "sale" };
  }

  const rateLimiter = createRateLimiter({ capacity: 100, drainRate: 10 });

  try {
    const result = await runSaleFetchLoop({
      jobId,
      apiKey,
      baseUrl: CONSIGNCLOUD_BASE_URL,
      rateLimiter,
      startTime: Date.now(),
      timeoutThresholdMs: TIMEOUT_THRESHOLD_MS,
    });
    return { status: result.status, jobId, phase: "fetch", type: "sale" };
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error ? error.message : "Sale fetch loop failed";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Sale resume-internal: fetch loop threw an error",
        jobId,
        error: errorMsg,
      }),
    );

    const currentJob = await getSaleJob(jobId);
    if (currentJob && currentJob.state === "running") {
      await transitionSaleJob(jobId, "paused", currentJob.progress, errorMsg);
    }
    return { status: "failed", jobId, phase: "fetch", type: "sale" };
  }
}

async function runSaleSyncPhase(
  jobId: string,
  job: {
    progress: {
      processed: number;
      imported: number;
      skipped: number;
      failed: number;
    };
  },
): Promise<SaleResumeInternalResult> {
  try {
    const result = await runSaleSyncLoop({
      jobId,
      startTime: Date.now(),
      timeoutThresholdMs: TIMEOUT_THRESHOLD_MS,
    });
    return { status: result.status, jobId, phase: "sync", type: "sale" };
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error ? error.message : "Sale sync loop failed";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Sale resume-internal: sync loop threw an error",
        jobId,
        error: errorMsg,
      }),
    );

    const currentJob = await getSaleJob(jobId);
    if (currentJob && currentJob.state === "running") {
      await transitionSaleJob(jobId, "paused", currentJob.progress, errorMsg);
    }
    return { status: "failed", jobId, phase: "sync", type: "sale" };
  }
}

async function getSaleImportReport(
  jobId: string,
): Promise<Record<string, unknown> | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: IMPORT_TABLE_NAME,
      Key: {
        PK: "SALE_IMPORT#REPORT",
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
