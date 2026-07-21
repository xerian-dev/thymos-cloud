import type {
  ProgressCounts,
  ImportJob,
  JobState,
} from "./generic-job-manager";
import type { Checkpoint } from "./generic-checkpoint-manager";

export interface FetchPageResult<T> {
  data: T[];
  nextCursor: string | null;
}

export interface GenericFetchOrchestratorConfig<T> {
  jobId: string;
  startTime: number;
  timeoutThresholdMs: number;
  pageLimit: number;
  fetchPage: (
    cursor: string | null,
    limit: number,
  ) => Promise<FetchPageResult<T>>;
  stageRecords: (records: T[]) => Promise<{ staged: number; skipped: number }>;
  jobManager: {
    getJob(jobId: string): Promise<ImportJob | null>;
    transitionJob(
      jobId: string,
      state: JobState,
      progress: ProgressCounts,
    ): Promise<void>;
  };
  checkpointManager: {
    saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
    loadCheckpoint(jobId: string): Promise<Checkpoint | null>;
  };
  /**
   * The job state to transition to when all pages are fetched.
   * Defaults to "complete" (items go directly to complete).
   * Sales pass "paused" here so the sync phase can run separately.
   */
  completionState?: JobState;
}

export interface FetchLoopResult {
  status: "continue" | "complete";
  jobId: string;
}

export async function runGenericFetchLoop<T>(
  config: GenericFetchOrchestratorConfig<T>,
): Promise<FetchLoopResult> {
  const {
    jobId,
    startTime,
    timeoutThresholdMs,
    pageLimit,
    fetchPage,
    stageRecords,
    jobManager,
    checkpointManager,
    completionState = "complete",
  } = config;

  // 1. Validate job exists
  const job = await jobManager.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // 2. Load checkpoint if exists (resume scenario)
  const checkpoint = await checkpointManager.loadCheckpoint(jobId);
  const isResume = checkpoint !== null;

  let cursor: string | null = checkpoint?.cursor ?? null;
  const progress: ProgressCounts = checkpoint?.progress ?? {
    processed: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
  };

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Generic fetch loop started",
      jobId,
      isResume,
      cursor,
      progress,
    }),
  );

  let pageNumber = 0;

  // 3. Processing loop
  for (;;) {
    const pageResult = await fetchPage(cursor, pageLimit);
    pageNumber++;

    // Stage records and update progress
    const { staged, skipped } = await stageRecords(pageResult.data);

    progress.imported += staged;
    progress.skipped += skipped;
    progress.processed += pageResult.data.length;

    cursor = pageResult.nextCursor;

    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Fetch page processed",
        jobId,
        pageNumber,
        recordCount: pageResult.data.length,
        staged,
        skipped,
        progress,
      }),
    );

    // Save checkpoint after each page
    await checkpointManager.saveCheckpoint({
      jobId,
      cursor,
      progress,
      lastUpdatedAt: new Date().toISOString(),
    });

    // Check if no more pages — fetch phase is done, transition to completion state
    if (cursor === null) {
      await jobManager.transitionJob(jobId, completionState, progress);

      console.info(
        JSON.stringify({
          level: "INFO",
          message: "Import completed",
          jobId,
          state: completionState,
          progress,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
        }),
      );

      return { status: "complete", jobId };
    }

    // Check elapsed time against threshold
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutThresholdMs) {
      console.info(
        JSON.stringify({
          level: "INFO",
          message:
            "Fetch timeout threshold reached, returning continue for next iteration",
          jobId,
          cursor,
          progress,
          elapsedMs: elapsed,
        }),
      );

      return { status: "continue", jobId };
    }
  }
}
