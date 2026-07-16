import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockAcquireLock = vi.hoisted(() => vi.fn());
const mockForceAcquireStaleLock = vi.hoisted(() => vi.fn());
const mockReleaseLock = vi.hoisted(() => vi.fn());
const mockGetSyncState = vi.hoisted(() => vi.fn());
const mockUpdateSyncStateField = vi.hoisted(() => vi.fn());
const mockGetRunningOrPausedJob = vi.hoisted(() => vi.fn());
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

vi.mock("../generic-job-manager", () => ({
  createJobManager: () => ({
    getRunningOrPausedJob: mockGetRunningOrPausedJob,
  }),
}));

vi.mock("../step-function-starter", () => ({
  startStepFunctionForSync: mockStartStepFunctionForSync,
}));

vi.mock("crypto", () => ({
  randomUUID: mockRandomUUID,
}));

import { handleScheduledSync } from "../sync-orchestrator";

describe("sync-orchestrator", () => {
  const CORRELATION_ID = "test-correlation-id-1234";
  const ACCOUNT_JOB_ID = "account-job-uuid";

  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));

    // Only 2 UUIDs needed now: correlationId and accountJobId
    let uuidCallCount = 0;
    const uuidSequence = [CORRELATION_ID, ACCOUNT_JOB_ID];
    mockRandomUUID.mockImplementation(() => {
      const value =
        uuidSequence[uuidCallCount] ?? `fallback-uuid-${uuidCallCount}`;
      uuidCallCount++;
      return value;
    });

    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  function setupHappyPath(): void {
    mockAcquireLock.mockResolvedValue({ acquired: true });
    mockGetSyncState.mockResolvedValue({
      lastAccountSyncAt: "2025-01-15T11:45:00.000Z",
      lastItemSyncAt: "2025-01-15T11:45:00.000Z",
      lastSaleSyncAt: "2025-01-15T11:45:00.000Z",
      updatedAt: "2025-01-15T11:45:00.000Z",
    });
    mockGetRunningOrPausedJob.mockResolvedValue(null);
    mockStartStepFunctionForSync.mockResolvedValueOnce(
      "arn:aws:states:us-east-1:123:execution:accounts-exec",
    );
    mockUpdateSyncStateField.mockResolvedValue(undefined);
    mockReleaseLock.mockResolvedValue(undefined);
  }

  describe("happy path: all phases succeed", () => {
    it("returns success for accounts and skipped/disabled for items and sales", async () => {
      setupHappyPath();

      const result = await handleScheduledSync();

      expect(result.correlationId).toBe(CORRELATION_ID);
      expect(result.phases.accounts).toEqual({ status: "success" });
      expect(result.phases.items).toEqual({
        status: "skipped",
        reason: "disabled",
      });
      expect(result.phases.sales).toEqual({
        status: "skipped",
        reason: "disabled",
      });
      expect(result.accountExecutionArn).toBe(
        "arn:aws:states:us-east-1:123:execution:accounts-exec",
      );
      expect(result.itemExecutionArn).toBeUndefined();
      expect(result.saleExecutionArn).toBeUndefined();
    });

    it("updates only lastAccountSyncAt timestamp field", async () => {
      setupHappyPath();

      await handleScheduledSync();

      expect(mockUpdateSyncStateField).toHaveBeenCalledWith(
        "lastAccountSyncAt",
        "2025-01-15T12:00:00.000Z",
      );
      expect(mockUpdateSyncStateField).toHaveBeenCalledTimes(1);
    });

    it("releases the lock after all phases complete", async () => {
      setupHappyPath();

      await handleScheduledSync();

      expect(mockReleaseLock).toHaveBeenCalledTimes(1);
    });

    it("passes createdAfter from sync state to the account step function call", async () => {
      setupHappyPath();

      await handleScheduledSync();

      // Only accounts call step function
      expect(mockStartStepFunctionForSync).toHaveBeenCalledTimes(1);
      expect(mockStartStepFunctionForSync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "account",
          phase: "fetch",
          createdAfter: "2025-01-15T11:45:00.000Z",
        }),
      );
    });
  });

  describe("skip due to fresh lock", () => {
    it("logs INFO and returns early without running imports", async () => {
      mockAcquireLock.mockResolvedValue({
        acquired: false,
        stale: false,
        existingLock: {
          lockedAt: "2025-01-15T11:50:00.000Z",
          correlationId: "other-run-id",
          ttl: 1736942400,
        },
      });

      const result = await handleScheduledSync();

      expect(result.correlationId).toBe(CORRELATION_ID);
      expect(result.phases.accounts).toEqual({
        status: "skipped",
        reason: "not started",
      });
      expect(result.phases.items).toEqual({
        status: "skipped",
        reason: "not started",
      });
      expect(result.phases.sales).toEqual({
        status: "skipped",
        reason: "not started",
      });

      // Should NOT proceed with any import phases
      expect(mockGetSyncState).not.toHaveBeenCalled();
      expect(mockGetRunningOrPausedJob).not.toHaveBeenCalled();
      expect(mockStartStepFunctionForSync).not.toHaveBeenCalled();
      expect(mockUpdateSyncStateField).not.toHaveBeenCalled();

      // Should NOT call releaseLock since lock was never acquired
      expect(mockReleaseLock).not.toHaveBeenCalled();

      // Should log INFO about sync already in progress
      const infoMessages = consoleInfoSpy.mock.calls.map((call: unknown[]) =>
        JSON.parse(call[0] as string),
      );
      const skipMessage = infoMessages.find(
        (msg: Record<string, unknown>) =>
          msg.message === "Sync already in progress, skipping",
      );
      expect(skipMessage).toBeDefined();
      expect(skipMessage.correlationId).toBe(CORRELATION_ID);
    });
  });

  describe("stale lock force-acquire success", () => {
    it("logs WARN and proceeds with sync when force-acquire succeeds", async () => {
      mockAcquireLock.mockResolvedValue({
        acquired: false,
        stale: true,
        existingLock: {
          lockedAt: "2025-01-15T10:50:00.000Z", // 70 min ago
          correlationId: "stale-run-id",
          ttl: 1736935800,
        },
      });
      mockForceAcquireStaleLock.mockResolvedValue(true);
      mockGetSyncState.mockResolvedValue({
        lastAccountSyncAt: "2025-01-15T10:45:00.000Z",
        lastItemSyncAt: "2025-01-15T10:45:00.000Z",
        lastSaleSyncAt: "2025-01-15T10:45:00.000Z",
        updatedAt: "2025-01-15T10:45:00.000Z",
      });
      mockGetRunningOrPausedJob.mockResolvedValue(null);
      mockStartStepFunctionForSync.mockResolvedValueOnce("arn:accounts");
      mockUpdateSyncStateField.mockResolvedValue(undefined);
      mockReleaseLock.mockResolvedValue(undefined);

      const result = await handleScheduledSync();

      // Sync should have proceeded
      expect(result.phases.accounts.status).toBe("success");
      expect(result.phases.items).toEqual({
        status: "skipped",
        reason: "disabled",
      });
      expect(result.phases.sales).toEqual({
        status: "skipped",
        reason: "disabled",
      });
      expect(mockStartStepFunctionForSync).toHaveBeenCalledWith(
        expect.objectContaining({ type: "account" }),
      );
      expect(mockReleaseLock).toHaveBeenCalled();

      // Should log WARN about force-acquiring stale lock
      const warnMessages = consoleWarnSpy.mock.calls.map((call: unknown[]) =>
        JSON.parse(call[0] as string),
      );
      const forceAcquireWarn = warnMessages.find(
        (msg: Record<string, unknown>) =>
          msg.message === "Force-acquiring stale lock",
      );
      expect(forceAcquireWarn).toBeDefined();
      expect(forceAcquireWarn.correlationId).toBe(CORRELATION_ID);
    });
  });

  describe("stale lock force-acquire race lost", () => {
    it("logs INFO and returns early when force-acquire fails", async () => {
      mockAcquireLock.mockResolvedValue({
        acquired: false,
        stale: true,
        existingLock: {
          lockedAt: "2025-01-15T10:50:00.000Z",
          correlationId: "stale-run-id",
          ttl: 1736935800,
        },
      });
      mockForceAcquireStaleLock.mockResolvedValue(false);

      const result = await handleScheduledSync();

      expect(result.correlationId).toBe(CORRELATION_ID);
      expect(result.phases.accounts).toEqual({
        status: "skipped",
        reason: "not started",
      });
      expect(result.phases.items).toEqual({
        status: "skipped",
        reason: "not started",
      });
      expect(result.phases.sales).toEqual({
        status: "skipped",
        reason: "not started",
      });

      // Should NOT proceed
      expect(mockGetSyncState).not.toHaveBeenCalled();
      expect(mockGetRunningOrPausedJob).not.toHaveBeenCalled();

      // Should NOT call releaseLock since force-acquire failed
      expect(mockReleaseLock).not.toHaveBeenCalled();

      // Should log INFO about race lost
      const infoMessages = consoleInfoSpy.mock.calls.map((call: unknown[]) =>
        JSON.parse(call[0] as string),
      );
      const raceLostMessage = infoMessages.find(
        (msg: Record<string, unknown>) =>
          msg.message === "Force-acquire race lost, another sync took over",
      );
      expect(raceLostMessage).toBeDefined();
      expect(raceLostMessage.correlationId).toBe(CORRELATION_ID);
    });
  });

  describe("account Step Function failure — items and sales still disabled", () => {
    it("items and sales are always skipped/disabled regardless of account outcome", async () => {
      mockAcquireLock.mockResolvedValue({ acquired: true });
      mockGetSyncState.mockResolvedValue({
        lastAccountSyncAt: "2025-01-15T11:45:00.000Z",
        lastItemSyncAt: "2025-01-15T11:45:00.000Z",
        lastSaleSyncAt: "2025-01-15T11:45:00.000Z",
        updatedAt: "2025-01-15T11:45:00.000Z",
      });
      mockGetRunningOrPausedJob.mockResolvedValue(null);

      const accountError = new Error("Account SF failed");
      mockStartStepFunctionForSync.mockRejectedValueOnce(accountError);

      mockUpdateSyncStateField.mockResolvedValue(undefined);
      mockReleaseLock.mockResolvedValue(undefined);

      const result = await handleScheduledSync();

      expect(result.phases.accounts).toEqual({
        status: "error",
        reason: "Account SF failed",
      });
      expect(result.phases.items).toEqual({
        status: "skipped",
        reason: "disabled",
      });
      expect(result.phases.sales).toEqual({
        status: "skipped",
        reason: "disabled",
      });

      // lastAccountSyncAt should NOT be updated (account failed)
      expect(mockUpdateSyncStateField).not.toHaveBeenCalled();

      // Only 1 step function call (account)
      expect(mockStartStepFunctionForSync).toHaveBeenCalledTimes(1);

      // Lock released
      expect(mockReleaseLock).toHaveBeenCalledTimes(1);
    });
  });

  describe("account import already running/paused skips account phase", () => {
    it("skips account phase, items and sales are disabled", async () => {
      mockAcquireLock.mockResolvedValue({ acquired: true });
      mockGetSyncState.mockResolvedValue({
        lastAccountSyncAt: "2025-01-15T11:45:00.000Z",
        lastItemSyncAt: "2025-01-15T11:45:00.000Z",
        lastSaleSyncAt: "2025-01-15T11:45:00.000Z",
        updatedAt: "2025-01-15T11:45:00.000Z",
      });
      mockGetRunningOrPausedJob.mockResolvedValue({
        jobId: "existing-account-job",
        state: "running",
        phase: "fetch",
        startedAt: "2025-01-15T11:50:00.000Z",
        lastUpdatedAt: "2025-01-15T11:50:00.000Z",
        filterParams: {},
        progress: { processed: 10, imported: 10, skipped: 0, failed: 0 },
      });
      mockUpdateSyncStateField.mockResolvedValue(undefined);
      mockReleaseLock.mockResolvedValue(undefined);

      const result = await handleScheduledSync();

      expect(result.phases.accounts).toEqual({
        status: "skipped",
        reason: "Account import already running/paused",
      });
      expect(result.phases.items).toEqual({
        status: "skipped",
        reason: "disabled",
      });
      expect(result.phases.sales).toEqual({
        status: "skipped",
        reason: "disabled",
      });
      expect(result.accountExecutionArn).toBeUndefined();

      // No step function calls at all (account skipped, items/sales disabled)
      expect(mockStartStepFunctionForSync).not.toHaveBeenCalled();

      // No timestamp updates (account skipped, items/sales disabled)
      expect(mockUpdateSyncStateField).not.toHaveBeenCalled();
    });
  });

  describe("account Step Function start retryable error", () => {
    it("retries once after 2s, then logs ERROR", async () => {
      mockAcquireLock.mockResolvedValue({ acquired: true });
      mockGetSyncState.mockResolvedValue({
        lastAccountSyncAt: null,
        lastItemSyncAt: null,
        lastSaleSyncAt: null,
        updatedAt: "2025-01-15T11:45:00.000Z",
      });
      mockGetRunningOrPausedJob.mockResolvedValue(null);

      const throttleError = new Error("Rate exceeded");
      throttleError.name = "ThrottlingException";

      // Account fails twice with retryable error (original + retry)
      mockStartStepFunctionForSync
        .mockRejectedValueOnce(throttleError) // accounts: first attempt
        .mockRejectedValueOnce(throttleError); // accounts: retry

      mockUpdateSyncStateField.mockResolvedValue(undefined);
      mockReleaseLock.mockResolvedValue(undefined);

      const resultPromise = handleScheduledSync();

      // Advance timer past the 2s retry delay
      await vi.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      // Account phase should be error
      expect(result.phases.accounts).toEqual({
        status: "error",
        reason: "Rate exceeded",
      });

      // Items and sales are always disabled
      expect(result.phases.items).toEqual({
        status: "skipped",
        reason: "disabled",
      });
      expect(result.phases.sales).toEqual({
        status: "skipped",
        reason: "disabled",
      });

      // 2 calls total: account first attempt + account retry
      expect(mockStartStepFunctionForSync).toHaveBeenCalledTimes(2);

      // lastAccountSyncAt should NOT be updated (account failed)
      expect(mockUpdateSyncStateField).not.toHaveBeenCalled();

      // Error should be logged
      const errorMessages = consoleErrorSpy.mock.calls.map((call: unknown[]) =>
        JSON.parse(call[0] as string),
      );
      const accountError = errorMessages.find(
        (msg: Record<string, unknown>) =>
          msg.message === "Account import Step Function start failed",
      );
      expect(accountError).toBeDefined();
    });
  });

  describe("account Step Function start non-retryable error", () => {
    it("logs ERROR immediately without retry", async () => {
      mockAcquireLock.mockResolvedValue({ acquired: true });
      mockGetSyncState.mockResolvedValue({
        lastAccountSyncAt: null,
        lastItemSyncAt: null,
        lastSaleSyncAt: null,
        updatedAt: "2025-01-15T11:45:00.000Z",
      });
      mockGetRunningOrPausedJob.mockResolvedValue(null);

      const accessError = new Error("Access denied");
      accessError.name = "AccessDeniedException";

      // Account fails with non-retryable error (no retry)
      mockStartStepFunctionForSync.mockRejectedValueOnce(accessError);

      mockUpdateSyncStateField.mockResolvedValue(undefined);
      mockReleaseLock.mockResolvedValue(undefined);

      const result = await handleScheduledSync();

      expect(result.phases.accounts).toEqual({
        status: "error",
        reason: "Access denied",
      });
      expect(result.phases.items).toEqual({
        status: "skipped",
        reason: "disabled",
      });
      expect(result.phases.sales).toEqual({
        status: "skipped",
        reason: "disabled",
      });

      // Only 1 call: account (no retry for non-retryable)
      expect(mockStartStepFunctionForSync).toHaveBeenCalledTimes(1);

      // No timestamp updates (account failed, items/sales disabled)
      expect(mockUpdateSyncStateField).not.toHaveBeenCalled();

      // Error should be logged
      const errorMessages = consoleErrorSpy.mock.calls.map((call: unknown[]) =>
        JSON.parse(call[0] as string),
      );
      const accountError = errorMessages.find(
        (msg: Record<string, unknown>) =>
          msg.message === "Account import Step Function start failed",
      );
      expect(accountError).toBeDefined();
    });
  });

  describe("unhandled exception", () => {
    it("releases lock in finally, logs error, and returns result", async () => {
      mockAcquireLock.mockResolvedValue({ acquired: true });
      mockGetSyncState.mockRejectedValue(new Error("DynamoDB unavailable"));
      mockReleaseLock.mockResolvedValue(undefined);

      const result = await handleScheduledSync();

      expect(result.correlationId).toBe(CORRELATION_ID);
      // Phases remain as "not started" (initial skipped state)
      expect(result.phases.accounts).toEqual({
        status: "skipped",
        reason: "not started",
      });
      expect(result.phases.items).toEqual({
        status: "skipped",
        reason: "not started",
      });
      expect(result.phases.sales).toEqual({
        status: "skipped",
        reason: "not started",
      });

      // Lock should still be released
      expect(mockReleaseLock).toHaveBeenCalledTimes(1);

      // Error should be logged
      const errorMessages = consoleErrorSpy.mock.calls.map((call: unknown[]) =>
        JSON.parse(call[0] as string),
      );
      const unhandledError = errorMessages.find(
        (msg: Record<string, unknown>) =>
          msg.message === "Unhandled error during scheduled sync",
      );
      expect(unhandledError).toBeDefined();
      expect(unhandledError.error).toBe("DynamoDB unavailable");
    });

    it("does not throw even if releaseLock fails", async () => {
      mockAcquireLock.mockResolvedValue({ acquired: true });
      mockGetSyncState.mockRejectedValue(new Error("DynamoDB unavailable"));
      mockReleaseLock.mockRejectedValue(new Error("Lock release failed"));

      const result = await handleScheduledSync();

      // Should not throw — returns result
      expect(result.correlationId).toBe(CORRELATION_ID);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);

      // WARN should be logged about failed lock release
      const warnMessages = consoleWarnSpy.mock.calls.map((call: unknown[]) =>
        JSON.parse(call[0] as string),
      );
      const lockReleaseWarn = warnMessages.find(
        (msg: Record<string, unknown>) =>
          msg.message === "Failed to release sync lock",
      );
      expect(lockReleaseWarn).toBeDefined();
    });

    it("does not attempt to release lock when lock was never acquired", async () => {
      // acquireLock throws (different from returning acquired:false)
      mockAcquireLock.mockRejectedValue(new Error("DynamoDB unreachable"));

      const result = await handleScheduledSync();

      expect(result.correlationId).toBe(CORRELATION_ID);
      // releaseLock should NOT be called since lockAcquired is still false
      expect(mockReleaseLock).not.toHaveBeenCalled();
    });
  });

  describe("correlation ID in all log entries", () => {
    it("includes correlationId in every log entry during a happy path sync", async () => {
      setupHappyPath();

      await handleScheduledSync();

      // Check all console.info calls
      for (const call of consoleInfoSpy.mock.calls) {
        const parsed = JSON.parse(call[0] as string);
        expect(parsed.correlationId).toBe(CORRELATION_ID);
      }

      // Check all console.warn calls (if any)
      for (const call of consoleWarnSpy.mock.calls) {
        const parsed = JSON.parse(call[0] as string);
        expect(parsed.correlationId).toBe(CORRELATION_ID);
      }

      // Check all console.error calls (if any)
      for (const call of consoleErrorSpy.mock.calls) {
        const parsed = JSON.parse(call[0] as string);
        expect(parsed.correlationId).toBe(CORRELATION_ID);
      }
    });

    it("includes correlationId in skip message when lock is fresh", async () => {
      mockAcquireLock.mockResolvedValue({
        acquired: false,
        stale: false,
        existingLock: {
          lockedAt: "2025-01-15T11:55:00.000Z",
          correlationId: "other-run",
          ttl: 1736942700,
        },
      });

      await handleScheduledSync();

      const allLogCalls = [
        ...consoleInfoSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
      ];

      for (const call of allLogCalls) {
        const parsed = JSON.parse(call[0] as string);
        expect(parsed.correlationId).toBe(CORRELATION_ID);
      }
    });

    it("includes correlationId in error log on unhandled exception", async () => {
      mockAcquireLock.mockResolvedValue({ acquired: true });
      mockGetSyncState.mockRejectedValue(new Error("Boom"));
      mockReleaseLock.mockResolvedValue(undefined);

      await handleScheduledSync();

      const errorMessages = consoleErrorSpy.mock.calls.map((call: unknown[]) =>
        JSON.parse(call[0] as string),
      );
      for (const msg of errorMessages) {
        expect(msg.correlationId).toBe(CORRELATION_ID);
      }
    });
  });

  describe("sync state DynamoDB update", () => {
    it("calls updateSyncStateField only for lastAccountSyncAt", async () => {
      setupHappyPath();

      await handleScheduledSync();

      // Only account timestamp should be updated (items/sales disabled)
      expect(mockUpdateSyncStateField).toHaveBeenCalledWith(
        "lastAccountSyncAt",
        "2025-01-15T12:00:00.000Z",
      );
      expect(mockUpdateSyncStateField).toHaveBeenCalledTimes(1);
    });

    it("account succeeds even if updateSyncStateField throws", async () => {
      mockAcquireLock.mockResolvedValue({ acquired: true });
      mockGetSyncState.mockResolvedValue({
        lastAccountSyncAt: null,
        lastItemSyncAt: null,
        lastSaleSyncAt: null,
        updatedAt: "2025-01-15T11:45:00.000Z",
      });
      mockGetRunningOrPausedJob.mockResolvedValue(null);
      mockUpdateSyncStateField.mockResolvedValue(undefined);
      mockStartStepFunctionForSync.mockResolvedValueOnce("arn:accounts");
      mockReleaseLock.mockResolvedValue(undefined);

      const result = await handleScheduledSync();

      expect(result.phases.accounts.status).toBe("success");
      expect(result.phases.items).toEqual({
        status: "skipped",
        reason: "disabled",
      });
      expect(result.phases.sales).toEqual({
        status: "skipped",
        reason: "disabled",
      });
    });
  });

  describe("first sync (no sync state)", () => {
    it("omits createdAfter when sync state is null", async () => {
      mockAcquireLock.mockResolvedValue({ acquired: true });
      mockGetSyncState.mockResolvedValue(null);
      mockGetRunningOrPausedJob.mockResolvedValue(null);
      mockStartStepFunctionForSync.mockResolvedValueOnce("arn:accounts-full");
      mockUpdateSyncStateField.mockResolvedValue(undefined);
      mockReleaseLock.mockResolvedValue(undefined);

      await handleScheduledSync();

      // Only accounts call with undefined createdAfter
      expect(mockStartStepFunctionForSync).toHaveBeenCalledTimes(1);
      expect(mockStartStepFunctionForSync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "account",
          createdAfter: undefined,
        }),
      );
    });
  });
});
