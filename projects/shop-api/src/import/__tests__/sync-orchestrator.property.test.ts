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
const mockFetchAccountsInternal = vi.hoisted(() => vi.fn());
const mockSyncAccountsInternal = vi.hoisted(() => vi.fn());
const mockStartStepFunctionForSync = vi.hoisted(() => vi.fn());
const mockRandomUUID = vi.hoisted(() => vi.fn());

vi.mock("../sync-lock-manager", () => ({
  acquireLock: mockAcquireLock,
  forceAcquireStaleLock: mockForceAcquireStaleLock,
  releaseLock: mockReleaseLock,
}));
vi.mock("../sync-state-manager", () => ({
  getSyncState: mockGetSyncState,
  updateSyncStateField: mockUpdateSyncStateField,
}));
vi.mock("../fetch-from-consigncloud", () => ({
  fetchAccountsInternal: mockFetchAccountsInternal,
}));
vi.mock("../sync-to-shop-table", () => ({
  syncAccountsInternal: mockSyncAccountsInternal,
}));
vi.mock("../step-function-starter", () => ({
  startStepFunctionForSync: mockStartStepFunctionForSync,
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

// Helper: configure account phase outcome
function setupAccountPhase(success: boolean): void {
  if (success) {
    mockFetchAccountsInternal.mockResolvedValue({
      success: true,
      report: { added: 1, updated: 0, skipped: 0, errored: 0 },
    });
    mockSyncAccountsInternal.mockResolvedValue({
      success: true,
      report: { added: 1, updated: 0, skipped: 0, errored: 0 },
    });
  } else {
    mockFetchAccountsInternal.mockResolvedValue({
      success: false,
      error: "Account fetch failed",
    });
  }
}

// Helper: configure step function outcomes
function setupStepFunction(
  itemSuccess: boolean,
  saleSuccess: boolean,
  itemRetryable = false,
  saleRetryable = false,
): void {
  if (itemSuccess) {
    mockStartStepFunctionForSync.mockResolvedValueOnce(
      "arn:aws:states:us-east-1:123:execution:item-exec",
    );
  } else if (itemRetryable) {
    const err = new Error("Service unavailable");
    err.name = "ServiceUnavailableException";
    mockStartStepFunctionForSync.mockRejectedValueOnce(err);
    mockStartStepFunctionForSync.mockRejectedValueOnce(err);
  } else {
    const err = new Error("Access denied");
    err.name = "AccessDeniedException";
    mockStartStepFunctionForSync.mockRejectedValueOnce(err);
  }

  if (saleSuccess) {
    mockStartStepFunctionForSync.mockResolvedValueOnce(
      "arn:aws:states:us-east-1:123:execution:sale-exec",
    );
  } else if (saleRetryable) {
    const err = new Error("Service unavailable");
    err.name = "ServiceUnavailableException";
    mockStartStepFunctionForSync.mockRejectedValueOnce(err);
    mockStartStepFunctionForSync.mockRejectedValueOnce(err);
  } else {
    const err = new Error("Access denied");
    err.name = "AccessDeniedException";
    mockStartStepFunctionForSync.mockRejectedValueOnce(err);
  }
}

describe("Property 3: Sync state timestamps are only updated on phase success", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValueOnce("corr-id-1").mockReturnValue("job-uuid");
    mockUpdateSyncStateField.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("failed phases never trigger their corresponding timestamp update", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          accountSuccess: fc.boolean(),
          itemSuccess: fc.boolean(),
          saleSuccess: fc.boolean(),
        }),
        async ({ accountSuccess, itemSuccess, saleSuccess }) => {
          vi.clearAllMocks();
          mockRandomUUID
            .mockReturnValueOnce("corr-id-1")
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          setupLockAcquired();
          setupSyncState(null);
          setupAccountPhase(accountSuccess);

          if (accountSuccess) {
            setupStepFunction(itemSuccess, saleSuccess);
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
            expect(updatedFields).not.toContain("lastAccountSyncAt");
            expect(updatedFields).not.toContain("lastItemSyncAt");
            expect(updatedFields).not.toContain("lastSaleSyncAt");
          } else {
            expect(updatedFields).toContain("lastAccountSyncAt");
            if (itemSuccess) {
              expect(updatedFields).toContain("lastItemSyncAt");
            } else {
              expect(updatedFields).not.toContain("lastItemSyncAt");
            }
            if (saleSuccess) {
              expect(updatedFields).toContain("lastSaleSyncAt");
            } else {
              expect(updatedFields).not.toContain("lastSaleSyncAt");
            }
          }
        },
      ),
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("all timestamp updates use the same value captured before phases run", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Advance time during phases by random amounts
        fc.integer({ min: 1000, max: 60000 }),
        fc.integer({ min: 1000, max: 60000 }),
        async (accountDelayMs, itemDelayMs) => {
          vi.clearAllMocks();
          vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
          mockRandomUUID
            .mockReturnValueOnce("corr-id-1")
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          setupLockAcquired();
          setupSyncState(null);

          // Account phase advances time
          mockFetchAccountsInternal.mockImplementation(async () => {
            vi.advanceTimersByTime(accountDelayMs);
            return {
              success: true,
              report: { added: 1, updated: 0, skipped: 0, errored: 0 },
            };
          });
          mockSyncAccountsInternal.mockImplementation(async () => {
            vi.advanceTimersByTime(itemDelayMs);
            return {
              success: true,
              report: { added: 1, updated: 0, skipped: 0, errored: 0 },
            };
          });
          mockStartStepFunctionForSync.mockResolvedValue("arn:exec:item");

          const resultPromise = handleScheduledSync();
          await vi.runAllTimersAsync();
          await resultPromise;

          const updateCalls = mockUpdateSyncStateField.mock.calls as [
            string,
            string,
          ][];

          // All calls should use the SAME timestamp
          const timestamps = updateCalls.map((call) => call[1]);
          const uniqueTimestamps = [...new Set(timestamps)];
          expect(uniqueTimestamps.length).toBe(1);

          // The timestamp should be the one captured at lock acquisition time
          // (before any phases advanced the clock)
          expect(uniqueTimestamps[0]).toBe("2025-01-15T12:00:00.000Z");
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 5: Sequential phase ordering is maintained", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValueOnce("corr-id-1").mockReturnValue("job-uuid");
    mockUpdateSyncStateField.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accounts phase completes before items, items before sales", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // whether items succeed
        fc.boolean(), // whether sales succeed
        async (itemSuccess, saleSuccess) => {
          vi.clearAllMocks();
          mockRandomUUID
            .mockReturnValueOnce("corr-id-1")
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          setupLockAcquired();
          setupSyncState(null);

          const callOrder: string[] = [];

          mockFetchAccountsInternal.mockImplementation(async () => {
            callOrder.push("fetchAccounts");
            return {
              success: true,
              report: { added: 1, updated: 0, skipped: 0, errored: 0 },
            };
          });
          mockSyncAccountsInternal.mockImplementation(async () => {
            callOrder.push("syncAccounts");
            return {
              success: true,
              report: { added: 1, updated: 0, skipped: 0, errored: 0 },
            };
          });

          // Track step function calls by type
          mockStartStepFunctionForSync.mockImplementation(
            async (options: { type: string }) => {
              callOrder.push(`stepFunction:${options.type}`);
              if (options.type === "item" && !itemSuccess) {
                const err = new Error("fail");
                err.name = "AccessDeniedException";
                throw err;
              }
              if (options.type === "sale" && !saleSuccess) {
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

          // Verify ordering invariants
          const fetchIdx = callOrder.indexOf("fetchAccounts");
          const syncIdx = callOrder.indexOf("syncAccounts");
          const itemIdx = callOrder.indexOf("stepFunction:item");
          const saleIdx = callOrder.indexOf("stepFunction:sale");

          // Accounts must be first
          expect(fetchIdx).toBeGreaterThanOrEqual(0);
          expect(syncIdx).toBeGreaterThan(fetchIdx);

          // Items before sales (both attempted since accounts succeeded)
          if (itemIdx >= 0 && saleIdx >= 0) {
            expect(itemIdx).toBeGreaterThan(syncIdx);
            expect(saleIdx).toBeGreaterThan(itemIdx);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 6: Account failure skips subsequent phases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValueOnce("corr-id-1").mockReturnValue("job-uuid");
    mockUpdateSyncStateField.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("when accounts fail, step functions are never called", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }), // random error message
        fc.boolean(), // fail at fetch vs sync stage
        async (errorMessage, failAtFetch) => {
          vi.clearAllMocks();
          mockRandomUUID
            .mockReturnValueOnce("corr-id-1")
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          setupLockAcquired();
          setupSyncState(null);

          if (failAtFetch) {
            mockFetchAccountsInternal.mockResolvedValue({
              success: false,
              error: errorMessage,
            });
          } else {
            mockFetchAccountsInternal.mockResolvedValue({
              success: true,
              report: { added: 1, updated: 0, skipped: 0, errored: 0 },
            });
            mockSyncAccountsInternal.mockResolvedValue({
              success: false,
              error: errorMessage,
            });
          }

          const resultPromise = handleScheduledSync();
          await vi.runAllTimersAsync();
          await resultPromise;

          // Step Functions should NEVER be called when accounts fail
          expect(mockStartStepFunctionForSync).not.toHaveBeenCalled();

          // No sync state timestamps should be updated
          expect(mockUpdateSyncStateField).not.toHaveBeenCalled();
        },
      ),
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lock is released regardless of phase outcomes or errors", async () => {
    // Generate error injection scenarios
    const errorPointArb = fc.constantFrom(
      "none",
      "account-fetch",
      "account-sync",
      "item-step-function",
      "sale-step-function",
      "unhandled-in-account",
    );

    await fc.assert(
      fc.asyncProperty(errorPointArb, async (errorPoint) => {
        vi.clearAllMocks();
        mockRandomUUID
          .mockReturnValueOnce("corr-id-1")
          .mockReturnValue("job-uuid");
        mockUpdateSyncStateField.mockResolvedValue(undefined);
        setupLockAcquired();
        setupSyncState(null);
        mockReleaseLock.mockResolvedValue(undefined);

        switch (errorPoint) {
          case "none":
            setupAccountPhase(true);
            mockStartStepFunctionForSync.mockResolvedValue("arn:exec");
            break;
          case "account-fetch":
            mockFetchAccountsInternal.mockResolvedValue({
              success: false,
              error: "API down",
            });
            break;
          case "account-sync":
            mockFetchAccountsInternal.mockResolvedValue({
              success: true,
              report: { added: 1, updated: 0, skipped: 0, errored: 0 },
            });
            mockSyncAccountsInternal.mockResolvedValue({
              success: false,
              error: "Sync failed",
            });
            break;
          case "item-step-function":
            setupAccountPhase(true);
            mockStartStepFunctionForSync
              .mockRejectedValueOnce(new Error("Item start failed"))
              .mockResolvedValueOnce("arn:exec:sale");
            break;
          case "sale-step-function":
            setupAccountPhase(true);
            mockStartStepFunctionForSync
              .mockResolvedValueOnce("arn:exec:item")
              .mockRejectedValueOnce(new Error("Sale start failed"));
            break;
          case "unhandled-in-account":
            mockFetchAccountsInternal.mockRejectedValue(
              new Error("Unhandled crash"),
            );
            break;
        }

        const resultPromise = handleScheduledSync();
        await vi.runAllTimersAsync();
        await resultPromise;

        // Lock must ALWAYS be released
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
          // Reset mocks but keep console overrides intact
          mockRandomUUID.mockReset();
          mockAcquireLock.mockReset();
          mockReleaseLock.mockReset();
          mockGetSyncState.mockReset();
          mockUpdateSyncStateField.mockReset();
          mockFetchAccountsInternal.mockReset();
          mockSyncAccountsInternal.mockReset();
          mockStartStepFunctionForSync.mockReset();
          logEntries = [];

          mockRandomUUID
            .mockReturnValueOnce(correlationId)
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          mockReleaseLock.mockResolvedValue(undefined);

          switch (scenario) {
            case "success":
              setupLockAcquired();
              setupSyncState(null);
              setupAccountPhase(true);
              mockStartStepFunctionForSync.mockResolvedValue("arn:exec");
              break;
            case "account-fail":
              setupLockAcquired();
              setupSyncState(null);
              mockFetchAccountsInternal.mockResolvedValue({
                success: false,
                error: "API error",
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retryable errors cause exactly 2 calls (original + 1 retry)", async () => {
    const retryableErrorNames = [
      "ServiceUnavailableException",
      "ThrottlingException",
      "TooManyRequestsException",
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...retryableErrorNames),
        fc.constantFrom("item", "sale") as fc.Arbitrary<"item" | "sale">,
        async (errorName, failingPhase) => {
          vi.clearAllMocks();
          vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
          mockRandomUUID
            .mockReturnValueOnce("corr-id-1")
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          mockReleaseLock.mockResolvedValue(undefined);
          setupLockAcquired();
          setupSyncState(null);
          setupAccountPhase(true);

          const retryableError = new Error("Service error");
          retryableError.name = errorName;

          if (failingPhase === "item") {
            // Item fails with retryable error (both attempts)
            mockStartStepFunctionForSync
              .mockRejectedValueOnce(retryableError)
              .mockRejectedValueOnce(retryableError)
              // Sale succeeds
              .mockResolvedValueOnce("arn:exec:sale");
          } else {
            // Item succeeds
            mockStartStepFunctionForSync
              .mockResolvedValueOnce("arn:exec:item")
              // Sale fails with retryable error (both attempts)
              .mockRejectedValueOnce(retryableError)
              .mockRejectedValueOnce(retryableError);
          }

          const resultPromise = handleScheduledSync();
          await vi.runAllTimersAsync();
          await resultPromise;

          // Count calls for the failing phase: should be exactly 2
          const calls = mockStartStepFunctionForSync.mock.calls as [
            { type: string },
          ][];
          const failingPhaseCalls = calls.filter(
            (c) => c[0].type === failingPhase,
          );
          expect(failingPhaseCalls.length).toBe(2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("non-retryable errors cause exactly 1 call (no retry)", async () => {
    const nonRetryableErrorNames = [
      "AccessDeniedException",
      "InvalidArnException",
      "ValidationException",
      "InvalidParameterException",
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonRetryableErrorNames),
        fc.constantFrom("item", "sale") as fc.Arbitrary<"item" | "sale">,
        async (errorName, failingPhase) => {
          vi.clearAllMocks();
          vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
          mockRandomUUID
            .mockReturnValueOnce("corr-id-1")
            .mockReturnValue("job-uuid");
          mockUpdateSyncStateField.mockResolvedValue(undefined);
          mockReleaseLock.mockResolvedValue(undefined);
          setupLockAcquired();
          setupSyncState(null);
          setupAccountPhase(true);

          const nonRetryableError = new Error("Non-retryable error");
          nonRetryableError.name = errorName;

          if (failingPhase === "item") {
            // Item fails with non-retryable error
            mockStartStepFunctionForSync
              .mockRejectedValueOnce(nonRetryableError)
              // Sale succeeds
              .mockResolvedValueOnce("arn:exec:sale");
          } else {
            // Item succeeds
            mockStartStepFunctionForSync
              .mockResolvedValueOnce("arn:exec:item")
              // Sale fails with non-retryable error
              .mockRejectedValueOnce(nonRetryableError);
          }

          const resultPromise = handleScheduledSync();
          await vi.runAllTimersAsync();
          await resultPromise;

          // Count calls for the failing phase: should be exactly 1 (no retry)
          const calls = mockStartStepFunctionForSync.mock.calls as [
            { type: string },
          ][];
          const failingPhaseCalls = calls.filter(
            (c) => c[0].type === failingPhase,
          );
          expect(failingPhaseCalls.length).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
