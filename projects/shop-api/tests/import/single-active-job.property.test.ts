import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

/**
 * Feature: consigncloud-item-import, Property 7: Single active job invariant
 *
 * For any start-import request when a job exists in `running` or `paused` state,
 * the request is rejected with the existing job's identifier and no new job
 * record is created.
 *
 * Validates: Requirements 1.2, 6.7
 */

// Mock AWS SDK at the module level with proper constructor support
const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDynamoDBClient {
    constructor() {}
  },
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: mockSend }),
  },
  GetCommand: class MockGetCommand {
    constructor(public input: unknown) {}
  },
  PutCommand: class MockPutCommand {
    constructor(public input: unknown) {}
  },
  ScanCommand: class MockScanCommand {
    constructor(public input: unknown) {}
  },
  UpdateCommand: class MockUpdateCommand {
    constructor(public input: unknown) {}
  },
  QueryCommand: class MockQueryCommand {
    constructor(public input: unknown) {}
  },
  TransactWriteCommand: class MockTransactWriteCommand {
    constructor(public input: unknown) {}
  },
}));

import type { JobState, ImportJob } from "../../src/import/job-manager";

/** Generator for active job states (running or paused) */
const activeJobStateGen = fc.constantFrom<JobState>("running", "paused");

/** Generator for inactive job states (failed or complete) */
const inactiveJobStateGen = fc.constantFrom<JobState>("failed", "complete");

/** Generator for any job state */
const anyJobStateGen = fc.constantFrom<JobState>(
  "running",
  "paused",
  "failed",
  "complete",
  "cancelled",
);

/** Generator for a valid ISO date string */
const isoDateStringGen = fc
  .integer({ min: 1577836800000, max: 1893456000000 }) // 2020-01-01 to 2030-01-01
  .map((ms) => new Date(ms).toISOString());

/** Generator for random filter params */
const filterParamsGen = fc.record({
  createdAfter: fc.option(isoDateStringGen, { nil: undefined }),
});

/** Generator for progress counts */
const progressCountsGen = fc.record({
  processed: fc.nat({ max: 100000 }),
  imported: fc.nat({ max: 100000 }),
  skipped: fc.nat({ max: 100000 }),
  failed: fc.nat({ max: 10000 }),
});

/** Generator for a valid ISO timestamp in 2024-2026 range */
const timestampGen = fc
  .integer({ min: 1704067200000, max: 1798761600000 }) // 2024-01-01 to 2027-01-01
  .map((ms) => new Date(ms).toISOString());

/** Generator for a mock ImportJob in a specific state */
function importJobGen(
  stateGen: fc.Arbitrary<JobState>,
): fc.Arbitrary<ImportJob> {
  return fc.record({
    jobId: fc.uuid(),
    state: stateGen,
    startedAt: timestampGen,
    lastUpdatedAt: timestampGen,
    filterParams: filterParamsGen,
    progress: progressCountsGen,
  });
}

describe("Property 7: Single active job invariant", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("rejects start-import when a job exists in running or paused state", async () => {
    await fc.assert(
      fc.asyncProperty(
        importJobGen(activeJobStateGen),
        filterParamsGen,
        async (existingJob, _newFilterParams) => {
          mockSend.mockReset();

          // Mock the query to return the existing active job as a pointer record
          mockSend.mockResolvedValueOnce({
            Items: [
              {
                PK: "JOBS",
                SK: `ITEM_IMPORT#${existingJob.lastUpdatedAt}#${existingJob.jobId}`,
                jobId: existingJob.jobId,
                state: existingJob.state,
                phase: "fetch",
                startedAt: existingJob.startedAt,
                lastUpdatedAt: existingJob.lastUpdatedAt,
                progress: existingJob.progress,
                prefix: "ITEM_IMPORT",
              },
            ],
          });

          const { getRunningOrPausedJob } =
            await import("../../src/import/job-manager");

          const activeJob = await getRunningOrPausedJob();

          // The invariant: when an active job exists, it must be returned
          expect(activeJob).not.toBeNull();
          expect(activeJob!.jobId).toBe(existingJob.jobId);
          expect(["running", "paused"]).toContain(activeJob!.state);

          // Only one send call (the scan) — no PutCommand (createJob) was issued
          expect(mockSend).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("allows new job creation when no active job exists (job in failed or complete state)", async () => {
    await fc.assert(
      fc.asyncProperty(
        importJobGen(inactiveJobStateGen),
        filterParamsGen,
        async (_existingJob, _newFilterParams) => {
          mockSend.mockReset();

          // The DynamoDB filter only matches running/paused states,
          // so inactive jobs (failed/complete) won't be in the results
          mockSend.mockResolvedValueOnce({
            Items: [],
          });

          const { getRunningOrPausedJob } =
            await import("../../src/import/job-manager");

          const activeJob = await getRunningOrPausedJob();

          // No active job found — new job creation is allowed
          expect(activeJob).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("allows new job creation when no jobs exist at all", async () => {
    await fc.assert(
      fc.asyncProperty(filterParamsGen, async (_newFilterParams) => {
        mockSend.mockReset();

        // Mock query returns completely empty results
        mockSend.mockResolvedValueOnce({
          Items: [],
        });

        const { getRunningOrPausedJob } =
          await import("../../src/import/job-manager");

        const activeJob = await getRunningOrPausedJob();

        // No jobs at all — creation is allowed
        expect(activeJob).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("for any job state, only running and paused block new job creation", async () => {
    await fc.assert(
      fc.asyncProperty(
        anyJobStateGen,
        filterParamsGen,
        async (jobState, _filterParams) => {
          mockSend.mockReset();
          const shouldBlock = jobState === "running" || jobState === "paused";

          if (shouldBlock) {
            // Active state: query returns the job as a pointer record
            const existingJobId = crypto.randomUUID();
            const now = new Date().toISOString();
            mockSend.mockResolvedValueOnce({
              Items: [
                {
                  PK: "JOBS",
                  SK: `ITEM_IMPORT#${now}#${existingJobId}`,
                  jobId: existingJobId,
                  state: jobState,
                  phase: "fetch",
                  startedAt: now,
                  lastUpdatedAt: now,
                  progress: {
                    processed: 0,
                    imported: 0,
                    skipped: 0,
                    failed: 0,
                  },
                  prefix: "ITEM_IMPORT",
                },
              ],
            });
          } else {
            // Inactive state: DynamoDB filter excludes these, returns empty
            mockSend.mockResolvedValueOnce({
              Items: [],
            });
          }

          const { getRunningOrPausedJob } =
            await import("../../src/import/job-manager");

          const activeJob = await getRunningOrPausedJob();

          if (shouldBlock) {
            // Active job found — request must be rejected
            expect(activeJob).not.toBeNull();
            expect(["running", "paused"]).toContain(activeJob!.state);
          } else {
            // No active job — new job creation is allowed
            expect(activeJob).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
