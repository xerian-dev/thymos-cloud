import { randomUUID } from "crypto";
import {
  acquireLock,
  forceAcquireStaleLock,
  releaseLock,
} from "./sync-lock-manager";
import { getSyncState, updateSyncStateField } from "./sync-state-manager";
import { fetchAccountsInternal } from "./fetch-from-consigncloud";
import { syncAccountsInternal } from "./sync-to-shop-table";
import { startStepFunctionForSync } from "./step-function-starter";
import type { ImportPhase } from "./self-invoker";
import type { ImportJobType } from "./step-function-starter";

export type PhaseOutcome =
  | { status: "success"; detail?: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

export interface SyncRunResult {
  correlationId: string;
  elapsedMs: number;
  phases: {
    accounts: PhaseOutcome;
    items: PhaseOutcome;
    sales: PhaseOutcome;
  };
  itemExecutionArn?: string;
  saleExecutionArn?: string;
}

export async function handleScheduledSync(): Promise<SyncRunResult> {
  const correlationId = randomUUID();
  const startTime = Date.now();

  const phases: SyncRunResult["phases"] = {
    accounts: { status: "skipped", reason: "not started" },
    items: { status: "skipped", reason: "not started" },
    sales: { status: "skipped", reason: "not started" },
  };

  let lockAcquired = false;

  try {
    const lockResult = await acquireLock(correlationId);

    if (!lockResult.acquired) {
      if (lockResult.stale) {
        const staleLockAgeMs =
          Date.now() - new Date(lockResult.existingLock.lockedAt).getTime();

        console.warn(
          JSON.stringify({
            level: "WARN",
            message: "Force-acquiring stale lock",
            correlationId,
            staleLockTimestamp: lockResult.existingLock.lockedAt,
            staleLockAgeMinutes: Math.floor(staleLockAgeMs / 60000),
          }),
        );

        const forceAcquired = await forceAcquireStaleLock(
          correlationId,
          lockResult.existingLock.lockedAt,
        );

        if (!forceAcquired) {
          console.info(
            JSON.stringify({
              level: "INFO",
              message: "Force-acquire race lost, another sync took over",
              correlationId,
            }),
          );
          return { correlationId, elapsedMs: Date.now() - startTime, phases };
        }

        lockAcquired = true;
      } else {
        const lockAgeMs =
          Date.now() - new Date(lockResult.existingLock.lockedAt).getTime();

        console.info(
          JSON.stringify({
            level: "INFO",
            message: "Sync already in progress, skipping",
            correlationId,
            lockTimestamp: lockResult.existingLock.lockedAt,
            lockAgeMinutes: Math.floor(lockAgeMs / 60000),
          }),
        );
        return { correlationId, elapsedMs: Date.now() - startTime, phases };
      }
    } else {
      lockAcquired = true;
    }

    // Capture sync timestamp immediately after lock acquisition, before any phase
    const syncTimestamp = new Date().toISOString();

    // Read current sync state
    const syncState = await getSyncState();

    // Log structured sync start with correlation ID, state timestamps, and phase mode
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Scheduled sync starting",
        correlationId,
        syncTimestamp,
        state: {
          lastAccountSyncAt: syncState?.lastAccountSyncAt ?? null,
          lastItemSyncAt: syncState?.lastItemSyncAt ?? null,
          lastSaleSyncAt: syncState?.lastSaleSyncAt ?? null,
        },
        mode: {
          accounts: "full",
          items: syncState?.lastItemSyncAt ? "incremental" : "full",
          sales: syncState?.lastSaleSyncAt ? "incremental" : "full",
        },
      }),
    );

    let itemExecutionArn: string | undefined;
    let saleExecutionArn: string | undefined;

    // ===== Phase 1: Accounts (synchronous) =====
    try {
      const fetchResult = await fetchAccountsInternal();
      if (!fetchResult.success) {
        throw new Error(fetchResult.error ?? "Account fetch failed");
      }

      const syncResult = await syncAccountsInternal();
      if (!syncResult.success) {
        throw new Error(syncResult.error ?? "Account sync failed");
      }

      phases.accounts = {
        status: "success",
        detail: `added=${syncResult.report?.added}, updated=${syncResult.report?.updated}, skipped=${syncResult.report?.skipped}, errored=${syncResult.report?.errored}`,
      };
      await updateSyncStateField("lastAccountSyncAt", syncTimestamp);

      console.info(
        JSON.stringify({
          level: "INFO",
          message: "Account import phase completed",
          correlationId,
          report: syncResult.report,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      phases.accounts = { status: "error", reason: message };
      phases.items = { status: "skipped", reason: "Account phase failed" };
      phases.sales = { status: "skipped", reason: "Account phase failed" };

      console.error(
        JSON.stringify({
          level: "ERROR",
          message: "Account import phase failed, skipping items and sales",
          correlationId,
          error: message,
        }),
      );
    }

    // ===== Phase 2: Items (async via Step Functions with retry) =====
    if (phases.accounts.status === "success") {
      const itemJobId = randomUUID();
      try {
        const itemArn = await startStepFunctionWithRetry(
          {
            jobId: itemJobId,
            phase: "fetch",
            type: "item",
            createdAfter: syncState?.lastItemSyncAt ?? undefined,
          },
          correlationId,
        );
        itemExecutionArn = itemArn;
        phases.items = { status: "success" };
        await updateSyncStateField("lastItemSyncAt", syncTimestamp);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        phases.items = { status: "error", reason: message };
        console.error(
          JSON.stringify({
            level: "ERROR",
            message: "Item import Step Function start failed",
            correlationId,
            error: message,
          }),
        );
      }
    }

    // ===== Phase 3: Sales (async via Step Functions with retry) =====
    if (phases.accounts.status === "success") {
      const saleJobId = randomUUID();
      try {
        const saleArn = await startStepFunctionWithRetry(
          {
            jobId: saleJobId,
            phase: "fetch",
            type: "sale",
            createdAfter: syncState?.lastSaleSyncAt ?? undefined,
          },
          correlationId,
        );
        saleExecutionArn = saleArn;
        phases.sales = { status: "success" };
        await updateSyncStateField("lastSaleSyncAt", syncTimestamp);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        phases.sales = { status: "error", reason: message };
        console.error(
          JSON.stringify({
            level: "ERROR",
            message: "Sale import Step Function start failed",
            correlationId,
            error: message,
          }),
        );
      }
    }

    // Log sync completion
    console.info(
      JSON.stringify({
        level: "INFO",
        message: "Scheduled sync completed",
        correlationId,
        elapsedMs: Date.now() - startTime,
        phases,
        itemExecutionArn: itemExecutionArn ?? null,
        saleExecutionArn: saleExecutionArn ?? null,
      }),
    );

    return {
      correlationId,
      elapsedMs: Date.now() - startTime,
      phases,
      itemExecutionArn,
      saleExecutionArn,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Unhandled error during scheduled sync",
        correlationId,
        error: message,
      }),
    );

    return {
      correlationId,
      elapsedMs: Date.now() - startTime,
      phases,
    };
  } finally {
    if (lockAcquired) {
      try {
        await releaseLock();
      } catch (releaseError: unknown) {
        console.warn(
          JSON.stringify({
            level: "WARN",
            message: "Failed to release sync lock",
            correlationId,
            error:
              releaseError instanceof Error
                ? releaseError.message
                : "Unknown error",
          }),
        );
      }
    }
  }
}

async function startStepFunctionWithRetry(
  options: {
    jobId: string;
    phase: ImportPhase;
    type: ImportJobType;
    createdAfter?: string;
  },
  correlationId: string,
): Promise<string> {
  try {
    return await startStepFunctionForSync(options);
  } catch (error: unknown) {
    if (isRetryableStepFunctionError(error)) {
      console.warn(
        JSON.stringify({
          level: "WARN",
          message:
            "Step Function start failed with retryable error, retrying in 2s",
          correlationId,
          type: options.type,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return await startStepFunctionForSync(options);
    }
    throw error;
  }
}

function isRetryableStepFunctionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = (error as { name?: string }).name ?? "";
  return (
    name === "ServiceUnavailableException" ||
    name === "ThrottlingException" ||
    name === "TooManyRequestsException" ||
    name.includes("ServiceUnavailable") ||
    name.includes("Throttling") ||
    name.includes("TooManyRequests")
  );
}
