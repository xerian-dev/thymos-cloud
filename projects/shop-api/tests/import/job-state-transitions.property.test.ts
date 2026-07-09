import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import type { JobState, ProgressCounts } from "../../src/import/job-manager";

/** Feature: consigncloud-item-import, Property 6: Job state transitions are valid */

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDynamoDBClient {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: sendMock }),
  },
  GetCommand: class MockGetCommand {
    input: unknown;
    _type = "Get";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutCommand: class MockPutCommand {
    input: unknown;
    _type = "Put";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  ScanCommand: class MockScanCommand {
    input: unknown;
    _type = "Scan";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  UpdateCommand: class MockUpdateCommand {
    input: unknown;
    _type = "Update";
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

const VALID_TRANSITIONS: Record<JobState, JobState[]> = {
  running: ["complete", "paused", "failed"],
  paused: ["running"],
  failed: ["running"],
  complete: [],
};

const ALL_STATES: JobState[] = ["running", "paused", "failed", "complete"];

function isValidTransition(from: JobState, to: JobState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

describe("Property 6: Job state transitions are valid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const jobStateArb = fc.constantFrom<JobState>(
    "running",
    "paused",
    "failed",
    "complete",
  );
  const targetStateArb = fc.constantFrom<JobState>(
    "running",
    "paused",
    "failed",
    "complete",
  );

  const progressArb: fc.Arbitrary<ProgressCounts> = fc.record({
    processed: fc.nat({ max: 10000 }),
    imported: fc.nat({ max: 10000 }),
    skipped: fc.nat({ max: 10000 }),
    failed: fc.nat({ max: 10000 }),
  });

  /**
   * Validates: Requirements 6.1, 6.3, 6.4, 6.5
   */
  it("valid transitions succeed without throwing", async () => {
    const { transitionJob } = await import("../../src/import/job-manager");

    await fc.assert(
      fc.asyncProperty(
        jobStateArb,
        targetStateArb,
        progressArb,
        async (currentState, targetState, progress) => {
          if (!isValidTransition(currentState, targetState)) return;

          sendMock.mockReset();
          sendMock.mockResolvedValueOnce({
            Item: {
              jobId: "test-job-id",
              state: currentState,
              startedAt: "2026-01-01T00:00:00.000Z",
              lastUpdatedAt: "2026-01-01T00:00:00.000Z",
              filterParams: {},
              progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
            },
          });
          sendMock.mockResolvedValueOnce({});

          await expect(
            transitionJob("test-job-id", targetState, progress),
          ).resolves.toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("invalid transitions throw an error mentioning invalid transition", async () => {
    const { transitionJob } = await import("../../src/import/job-manager");

    await fc.assert(
      fc.asyncProperty(
        jobStateArb,
        targetStateArb,
        progressArb,
        async (currentState, targetState, progress) => {
          if (isValidTransition(currentState, targetState)) return;

          sendMock.mockReset();
          sendMock.mockResolvedValueOnce({
            Item: {
              jobId: "test-job-id",
              state: currentState,
              startedAt: "2026-01-01T00:00:00.000Z",
              lastUpdatedAt: "2026-01-01T00:00:00.000Z",
              filterParams: {},
              progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
            },
          });

          await expect(
            transitionJob("test-job-id", targetState, progress),
          ).rejects.toThrow(/[Ii]nvalid.*transition/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("all valid transition pairs are covered", () => {
    const expectedValid: Array<[JobState, JobState]> = [
      ["running", "complete"],
      ["running", "paused"],
      ["running", "failed"],
      ["paused", "running"],
      ["failed", "running"],
    ];

    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        const shouldBeValid = expectedValid.some(
          ([f, t]) => f === from && t === to,
        );
        expect(isValidTransition(from, to)).toBe(shouldBeValid);
      }
    }
  });

  it("transition from any state to the same state is invalid (no self-transitions)", () => {
    fc.assert(
      fc.property(jobStateArb, (state) => {
        expect(isValidTransition(state, state)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
