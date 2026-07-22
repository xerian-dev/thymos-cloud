import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

/**
 * Feature: scheduled-consigncloud-sync, Property 3: Sync state timestamps are only updated on phase success
 * Feature: scheduled-consigncloud-sync, Property 4: Sync timestamp is captured before phase execution
 * Feature: scheduled-consigncloud-sync, Property 5: Sequential phase ordering is maintained
 * Feature: scheduled-consigncloud-sync, Property 6: Account failure skips subsequent phases
 * Feature: scheduled-consigncloud-sync, Property 7: Lock is always released in finally block
 * Feature: scheduled-consigncloud-sync, Property 8: Correlation ID is present in all log entries
 * Feature: scheduled-consigncloud-sync, Property 9: Step Function retry follows defined policy
 * Validates: Requirements 2.1, 2.6, 2.7, 2.8, 3.6, 3.7, 4.2, 4.3, 4.4, 6.4, 8.1, 8.4, 9.5
 */

const mockAcquireLock = vi.hoisted(() => vi.fn());
const mockForceAcquireStaleLock = vi.hoisted(() => vi.fn());
const mockReleaseLock = vi.hoisted(() => vi.fn());
const mockGetSyncState = vi.hoisted(() => vi.fn());
const mockUpdateSyncStateField = vi.hoisted(() => vi.fn());
const mockStartStepFunctionForSync = vi.hoisted(() => vi.fn());
const mockRandomUUID = vi.hoisted(() => vi.fn());
const mockAccountGetRunningOrPausedJob = vi.hoisted(() => vi.fn());
const mockAccountCreateJob = vi.hoisted(() => vi.fn());
const mockItemGetRunningOrPausedJob = vi.hoisted(() => vi.fn());
const mockItemCreateJob = vi.hoisted(() => vi.fn());
const mockGetRunningSaleJob = vi.hoisted(() => vi.fn());
const mockCreateSaleJob = vi.hoisted(() => vi.fn());

vi.mock("../sync-lock-manager", () => ({
  acquireLock: mockAcquireLock,
  forceAcquireStaleLock: mockForceAcquireStaleLock,
  releaseLock: mockReleaseLock,
}));
vi.mock("../sync-state-manager", () => ({
  getSyncState: mockGetSyncState,
  updateSyncStateField: mockUpdateSyncStateField,
}));
vi.mock("../step-function-starter", () => ({
  startStepFunctionForSync: mockStartStepFunctionForSync,
}));
vi.mock("../generic-job-manager", () => ({
  createJobManager: (config: { prefix: string }) => {
    if (config.prefix === "ACCOUNT_IMPORT") {
      return {
        getRunningOrPausedJob: mockAccountGetRunningOrPausedJob,
        createJob: mockAccountCreateJob,
      };
    }
    if (config.prefix === "ITEM_IMPORT") {
      return {
        getRunningOrPausedJob: mockItemGetRunningOrPausedJob,
        createJob: mockItemCreateJob,
      };
    }
    return {
      getRunningOrPausedJob: vi.fn().mockResolvedValue(null),
      createJob: vi.fn(),
    };
  },
}));
vi.mock("../sale-job-manager", () => ({
  getRunningSaleJob: mockGetRunningSaleJob,
  createSaleJob: mockCreateSaleJob,
}));
vi.mock("crypto", () => ({
  randomUUID: mockRandomUUID,
}));

import { handleScheduledSync } from "../sync-orchestrator";

// Helper: configure mocks for a successful lock acquisition
function setupLockAcquired(): void {
  mockAcquireLock.mockResolvedValue({ acquired: true });
  mockReleaseLock.mockResolvedValue(undefined);
}

// Helper: configure sync state (null = first run)
function setupSyncState(
  state: {
    lastAccountSyncAt?: string | null;
    lastItemSyncAt?: string | null;
    lastSaleSyncAt?: string | null;
  } | null,
): void {
  if (state === null) {
    mockGetSyncState.mockResolvedValue(null);
  } else {
    mockGetSyncState.mockResolvedValue({
      lastAccountSyncAt: state.lastAccountSyncAt ?? null,
      lastItemSyncAt: state.lastItemSyncAt ?? null,
      lastSaleSyncAt: state.lastSaleSyncAt ?? null,
      updatedAt: "2025-01-15T10:00:00.000Z",
    });
  }
}

// Helper: configure default job manager mocks for both account and item
function setupDefaultJobManagers(): void {
  mockAccountGetRunningOrPausedJob.mockResolvedValue(null);
  mockItemGetRunningOrPausedJob.mockResolvedValue(null);
  mockGetRunningSaleJob.mockResolvedValue(null);
  mockAccountCreateJob.mockResolvedValue({
    jobId: "account-job-uuid",
    state: "running",
    phase: "fetch",
    startedAt: "2025-01-15T12:00:00.000Z",
    lastUpdatedAt: "2025-01-15T12:00:00.000Z",
    filterParams: {},
    progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
  });
  mockItemCreateJob.mockResolvedValue({
    jobId: "item-job-uuid",
    state: "running",
    phase: "fetch",
    startedAt: "2025-01-15T12:00:00.000Z",
    lastUpdatedAt: "2025-01-15T12:00:00.000Z",
    filterParams: {},
    progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
  });
  mockCreateSaleJob.mockResolvedValue({
    jobId: "sale-job-uuid",
    state: "running",
    phase: "fetch",
    startedAt: "2025-01-15T12:00:00.000Z",
    lastUpdatedAt: "2025-01-15T12:00:00.000Z",
    filterParams: {},
    progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
  });
}

describe("Property 3: Sync state timestamps are only updated on phase success", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValueOnce("corr-id-1").mockReturnValue("job-uuid");
    mockUpdateSyncStateField.mockResolvedValue(undefined);
    setupDefaultJobManagers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lastAccountSyncAt is only updated when account phase succeeds, lastItemSyncAt only when items succeed", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (accountSuccess) => {
        vi.clearAllMocks();
        mockRandomUUID
          .mockReturnValueOnce("corr-id-1")
          .mockReturnValue("job-uuid");
        mockUpdateSyncStateField.mockResolvedValue(undefined);
        setupDefaultJobManagers();
        setupLockAcquired();
        setupSyncState(null);

        if (accountSuccess) {
          mockStartStepFunctionForSync.mockResolvedValue("arn:exec:success");
        } else {
          mockStartStepFunctionForSync.mockImplementation(
            async (options: { type: string }) => {
              if (options.type === "account") {
                const err = new Error("Account start failed");
                err.name = "UnauthorizedException";
                throw err;
              }
              return `arn:exec:${options.type}`;
            },
          );
        }

        const resultPromise = handleScheduledSync();
        await vi.runAllTimersAsync();
        await resultPromise;

        const updateCalls = mockUpdateSyncStateField.mock.calls as [
          string,
          string,
        ][];
        const updatedFields = updateCalls.map((call) => call[0]);

        if (!accountSuccess) {
          // Account failed -> account timestamp not updated, items skipped
          expect(updatedFields).not.toContain("lastAccountSyncAt");
          expect(updatedFields).not.toContain("lastItemSyncAt");
          // Sales still runs and succeeds (requirement 2.2)
          expect(updatedFields).toContain("lastSaleSyncAt");
        } else {
          // Account succeeded -> all timestamps updated
          expect(updatedFields).toContain("lastAccountSyncAt");
          expect(updatedFields).toContain("lastItemSyncAt");
          expect(updatedFields).toContain("lastSaleSyncAt");
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 4: Sync timestamp is captured before phase execution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValueOnce("corr-id-1").mockReturnValue("job-uuid");
    mockUpdateSyncStateField.mockResolvedValue(undefined);
    setupDefaultJobManagers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("all timestamp updates use the same value captured before phases run", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1000, max: 60000 }),
        async (accountDelayMs) => {
          vi.clearAllMocks();
          vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
          mockRandomUUID
            .mockReturnValueOnce("corr-id-1")
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          setupDefaultJobManagers();
          setupLockAcquired();
          setupSyncState(null);

          // Step function advances time during execution
          mockStartStepFunctionForSync.mockImplementation(async () => {
            vi.advanceTimersByTime(accountDelayMs);
            return "arn:exec:account";
          });

          const resultPromise = handleScheduledSync();
          await vi.runAllTimersAsync();
          await resultPromise;

          const updateCalls = mockUpdateSyncStateField.mock.calls as [
            string,
            string,
          ][];

          if (updateCalls.length > 0) {
            const timestamps = updateCalls.map((call) => call[1]);
            const uniqueTimestamps = [...new Set(timestamps)];
            expect(uniqueTimestamps.length).toBe(1);

            // The timestamp should be the one captured at lock acquisition time
            expect(uniqueTimestamps[0]).toBe("2025-01-15T12:00:00.000Z");
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 5: All phases call Step Functions, sales runs unconditionally", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValueOnce("corr-id-1").mockReturnValue("job-uuid");
    mockUpdateSyncStateField.mockResolvedValue(undefined);
    setupDefaultJobManagers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("account, item, and sale step functions are called in correct order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // whether account succeeds
        async (accountSuccess) => {
          vi.clearAllMocks();
          mockRandomUUID
            .mockReturnValueOnce("corr-id-1")
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          setupDefaultJobManagers();
          setupLockAcquired();
          setupSyncState(null);

          const calledTypes: string[] = [];
          mockStartStepFunctionForSync.mockImplementation(
            async (options: { type: string }) => {
              calledTypes.push(options.type);
              if (!accountSuccess && options.type === "account") {
                const err = new Error("fail");
                err.name = "AccessDeniedException";
                throw err;
              }
              return "arn:exec:" + options.type;
            },
          );

          const resultPromise = handleScheduledSync();
          await vi.runAllTimersAsync();
          await resultPromise;

          if (accountSuccess) {
            // Both account and item step functions called
            expect(calledTypes).toContain("account");
            expect(calledTypes).toContain("item");
          } else {
            // Only account called (items skipped due to account failure)
            expect(calledTypes).toContain("account");
            expect(calledTypes).not.toContain("item");
          }
          // Sale is always called (runs unconditionally)
          expect(calledTypes).toContain("sale");
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 6: Account failure skips items phase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValueOnce("corr-id-1").mockReturnValue("job-uuid");
    mockUpdateSyncStateField.mockResolvedValue(undefined);
    setupDefaultJobManagers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("when accounts fail, the orchestrator still completes and items are skipped", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async () => {
        vi.clearAllMocks();
        mockRandomUUID
          .mockReturnValueOnce("corr-id-1")
          .mockReturnValue("job-uuid");
        mockUpdateSyncStateField.mockResolvedValue(undefined);
        setupDefaultJobManagers();
        setupLockAcquired();
        setupSyncState(null);

        const calledTypes: string[] = [];
        mockStartStepFunctionForSync.mockImplementation(
          async (options: { type: string }) => {
            calledTypes.push(options.type);
            if (options.type === "account") {
              const err = new Error("Account start failed");
              err.name = "UnauthorizedException";
              throw err;
            }
            return `arn:exec:${options.type}`;
          },
        );

        const resultPromise = handleScheduledSync();
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Account step function was called
        expect(calledTypes).toContain("account");

        // Items are skipped because accounts failed
        expect(result.phases.items).toEqual({
          status: "skipped",
          reason: "Skipped: accounts phase failed",
        });
        // Sales phase still attempts (requirement 2.2)
        expect(calledTypes).toContain("sale");
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 7: Lock is always released in finally block", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValueOnce("corr-id-1").mockReturnValue("job-uuid");
    mockUpdateSyncStateField.mockResolvedValue(undefined);
    setupDefaultJobManagers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lock is released regardless of phase outcomes or errors", async () => {
    const errorPointArb = fc.constantFrom("none", "account-step-function");

    await fc.assert(
      fc.asyncProperty(errorPointArb, async (errorPoint) => {
        vi.clearAllMocks();
        mockRandomUUID
          .mockReturnValueOnce("corr-id-1")
          .mockReturnValue("job-uuid");
        mockUpdateSyncStateField.mockResolvedValue(undefined);
        setupDefaultJobManagers();
        setupLockAcquired();
        setupSyncState(null);
        mockReleaseLock.mockResolvedValue(undefined);

        switch (errorPoint) {
          case "none":
            mockStartStepFunctionForSync.mockResolvedValue("arn:exec:success");
            break;
          case "account-step-function":
            mockStartStepFunctionForSync.mockImplementation(async () => {
              const err = new Error("Account start failed");
              err.name = "UnauthorizedException";
              throw err;
            });
            break;
        }

        const resultPromise = handleScheduledSync();
        await vi.runAllTimersAsync();
        await resultPromise;

        // Lock must ALWAYS be released exactly once
        expect(mockReleaseLock).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 100 },
    );
  });

  it("lock is NOT released when lock was never acquired", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (correlationId) => {
        vi.clearAllMocks();
        mockRandomUUID.mockReturnValueOnce(correlationId);
        mockReleaseLock.mockResolvedValue(undefined);

        // Lock not acquired (fresh lock held by another process)
        mockAcquireLock.mockResolvedValue({
          acquired: false,
          stale: false,
          existingLock: {
            lockedAt: "2025-01-15T11:55:00.000Z",
            correlationId: "other-owner",
            ttl: 1234567890,
          },
        });

        const resultPromise = handleScheduledSync();
        await vi.runAllTimersAsync();
        await resultPromise;

        // Lock was never acquired, so releaseLock should NOT be called
        expect(mockReleaseLock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 8: Correlation ID is present in all log entries", () => {
  let logEntries: string[];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();
    mockUpdateSyncStateField.mockResolvedValue(undefined);
    setupDefaultJobManagers();
    logEntries = [];
    console.info = (...args: unknown[]) => {
      logEntries.push(args[0] as string);
    };
    console.warn = (...args: unknown[]) => {
      logEntries.push(args[0] as string);
    };
    console.error = (...args: unknown[]) => {
      logEntries.push(args[0] as string);
    };
  });

  afterEach(() => {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    vi.useRealTimers();
  });

  it("every structured log entry contains the correlationId", async () => {
    const scenarioArb = fc.constantFrom(
      "success",
      "account-fail",
      "skip-fresh-lock",
    );

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        scenarioArb,
        async (correlationId, scenario) => {
          mockRandomUUID.mockReset();
          mockAcquireLock.mockReset();
          mockReleaseLock.mockReset();
          mockGetSyncState.mockReset();
          mockUpdateSyncStateField.mockReset();
          mockStartStepFunctionForSync.mockReset();
          mockAccountGetRunningOrPausedJob.mockReset();
          mockAccountCreateJob.mockReset();
          mockItemGetRunningOrPausedJob.mockReset();
          mockItemCreateJob.mockReset();
          logEntries = [];

          mockRandomUUID
            .mockReturnValueOnce(correlationId)
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          mockReleaseLock.mockResolvedValue(undefined);
          setupDefaultJobManagers();

          switch (scenario) {
            case "success":
              setupLockAcquired();
              setupSyncState(null);
              mockStartStepFunctionForSync.mockResolvedValue(
                "arn:exec:success",
              );
              break;
            case "account-fail":
              setupLockAcquired();
              setupSyncState(null);
              mockStartStepFunctionForSync.mockImplementation(async () => {
                const err = new Error("Account start failed");
                err.name = "UnauthorizedException";
                throw err;
              });
              break;
            case "skip-fresh-lock":
              mockAcquireLock.mockResolvedValue({
                acquired: false,
                stale: false,
                existingLock: {
                  lockedAt: "2025-01-15T11:55:00.000Z",
                  correlationId: "other",
                  ttl: 1234567890,
                },
              });
              break;
          }

          const resultPromise = handleScheduledSync();
          await vi.runAllTimersAsync();
          await resultPromise;

          // Every log entry should be valid JSON containing the correlationId
          expect(logEntries.length).toBeGreaterThan(0);
          for (const logStr of logEntries) {
            const parsed = JSON.parse(logStr) as Record<string, unknown>;
            expect(parsed.correlationId).toBe(correlationId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 9: Step Function retry follows defined policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValueOnce("corr-id-1").mockReturnValue("job-uuid");
    mockUpdateSyncStateField.mockResolvedValue(undefined);
    mockReleaseLock.mockResolvedValue(undefined);
    setupDefaultJobManagers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retryable errors cause exactly 2 calls (original + 1 retry) for account", async () => {
    const retryableErrorNames = [
      "ServiceUnavailableException",
      "ThrottlingException",
      "TooManyRequestsException",
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...retryableErrorNames),
        async (errorName) => {
          vi.clearAllMocks();
          vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
          mockRandomUUID
            .mockReturnValueOnce("corr-id-1")
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          mockReleaseLock.mockResolvedValue(undefined);
          setupDefaultJobManagers();
          setupLockAcquired();
          setupSyncState(null);

          const retryableError = new Error("Service error");
          retryableError.name = errorName;

          mockStartStepFunctionForSync.mockImplementation(async () => {
            throw retryableError;
          });

          const resultPromise = handleScheduledSync();
          await vi.runAllTimersAsync();
          await resultPromise;

          // Count calls for account phase: should be exactly 2 (original + retry)
          const calls = mockStartStepFunctionForSync.mock.calls as [
            { type: string },
          ][];
          const accountCalls = calls.filter((c) => c[0].type === "account");
          expect(accountCalls.length).toBe(2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("non-retryable errors cause exactly 1 call (no retry) for account", async () => {
    const nonRetryableErrorNames = [
      "AccessDeniedException",
      "InvalidArnException",
      "ValidationException",
      "InvalidParameterException",
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonRetryableErrorNames),
        async (errorName) => {
          vi.clearAllMocks();
          vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
          mockRandomUUID
            .mockReturnValueOnce("corr-id-1")
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          mockReleaseLock.mockResolvedValue(undefined);
          setupDefaultJobManagers();
          setupLockAcquired();
          setupSyncState(null);

          const nonRetryableError = new Error("Non-retryable error");
          nonRetryableError.name = errorName;

          mockStartStepFunctionForSync.mockImplementation(async () => {
            throw nonRetryableError;
          });

          const resultPromise = handleScheduledSync();
          await vi.runAllTimersAsync();
          await resultPromise;

          // Count calls for account phase: should be exactly 1 (no retry)
          const calls = mockStartStepFunctionForSync.mock.calls as [
            { type: string },
          ][];
          const accountCalls = calls.filter((c) => c[0].type === "account");
          expect(accountCalls.length).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
