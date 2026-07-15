# Implementation Plan: Scheduled ConsignCloud Sync

## Overview

Add a 15-minute EventBridge-triggered sync that orchestrates accounts → items → sales imports using the existing Import Lambda. Implementation involves Terraform resources, DynamoDB-based distributed locking, incremental state tracking, a sync orchestrator handler, internal refactoring of account imports, and Step Function starter extension.

## Tasks

- [x] 1. Infrastructure: EventBridge rule, target, Lambda permission, and DynamoDB TTL
  - [x] 1.1 Add EventBridge scheduled sync resources to Terraform
    - Add `aws_cloudwatch_event_rule` with `rate(15 minutes)` and state `ENABLED`
    - Add `aws_cloudwatch_event_target` pointing to existing Import Lambda with `{ "action": "scheduled-sync" }` input and `maximum_retry_attempts = 0`
    - Add `aws_lambda_permission` granting `events.amazonaws.com` invoke permission scoped to the rule ARN
    - Add `ttl` block to the existing `aws_dynamodb_table.import` resource with `attribute_name = "ttl"`
    - Follow existing naming convention: `${var.project_name}-${var.environment}-` prefix with `Environment` and `Project` tags
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 7.3, 7.4, 7.5, 8.5_

- [x] 2. Implement sync lock manager
  - [x] 2.1 Create `sync-lock-manager.ts` with lock acquisition, force-acquire, and release
    - Create file at `projects/shop-api/src/import/sync-lock-manager.ts`
    - Implement `acquireLock(correlationId)` using DynamoDB conditional PutItem (`attribute_not_exists(PK)`)
    - Lock record: PK `SYNC_LOCK`, SK `METADATA`, with `lockedAt` (ISO 8601), `correlationId`, `ttl` (epoch + 60 min)
    - Implement `forceAcquireStaleLock(correlationId, expectedLockedAt)` with conditional write verifying `lockedAt` unchanged
    - Implement `releaseLock()` to delete the lock record
    - Stale threshold: `lockedAt` older than 60 minutes from current time
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 2.2 Write property tests for sync lock manager
    - **Property 1: Lock acquisition prevents concurrent execution**
    - **Property 2: Stale lock detection uses correct threshold**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5**

  - [x] 2.3 Write unit tests for sync lock manager
    - Test lock-free acquisition succeeds
    - Test fresh lock held returns `acquired: false, stale: false`
    - Test stale lock held returns `acquired: false, stale: true`
    - Test force-acquire succeeds when `lockedAt` unchanged
    - Test force-acquire fails (race condition) when `lockedAt` changed
    - Test release deletes lock record
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Implement sync state manager
  - [x] 3.1 Create `sync-state-manager.ts` with state read and field update
    - Create file at `projects/shop-api/src/import/sync-state-manager.ts`
    - Implement `getSyncState()` to read SYNC_STATE record (PK `SYNC_STATE`, SK `METADATA`)
    - Return `null` if no record exists (first-ever sync)
    - Implement `updateSyncStateField(field, value)` with retry logic (2 retries, 500ms delay)
    - On 3 consecutive failures: log ERROR and continue without updating
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 3.2 Write property test for sync state manager
    - **Property 10: First sync omits createdAfter parameter**
    - **Validates: Requirements 2.5**

  - [x] 3.3 Write unit tests for sync state manager
    - Test reading state when no record exists returns null
    - Test reading state with partial nulls
    - Test successful field update
    - Test retry on DynamoDB failure (1 failure then success)
    - Test 3 failures logs ERROR and continues
    - _Requirements: 4.1, 4.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Refactor account import for internal use and extend Step Function starter
  - [x] 5.1 Add `fetchAccountsInternal()` to `fetch-from-consigncloud.ts`
    - Extract core logic from `fetchFromConsignCloud` into a shared internal function
    - New export returns `{ success: boolean; report?: { added, skipped, stored }; error?: string }` instead of API Gateway response
    - Existing `fetchFromConsignCloud` HTTP handler continues to work unchanged (calls the shared logic)
    - _Requirements: 5.1, 5.3_

  - [x] 5.2 Add `syncAccountsInternal()` to `sync-to-shop-table.ts`
    - Extract core logic from `syncToShopTable` into a shared internal function
    - New export returns `{ success: boolean; report?: { added, updated, skipped, errored }; error?: string }` instead of API Gateway response
    - Existing `syncToShopTable` HTTP handler continues to work unchanged (calls the shared logic)
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [x] 5.3 Extend `step-function-starter.ts` with `createdAfter` support
    - Add `startStepFunctionForSync(options: StartStepFunctionOptions)` export
    - Interface: `{ jobId, phase, type, createdAfter? }`
    - Returns execution ARN string (existing `startStepFunction` returns void)
    - Include `createdAfter` in the Step Function input payload when provided
    - Omit `createdAfter` when value is `null`/`undefined` (full import)
    - _Requirements: 2.3, 2.4, 2.5, 6.1, 6.2_

  - [x] 5.4 Write unit tests for internal account functions and extended starter
    - Test `fetchAccountsInternal` success and auth failure paths
    - Test `syncAccountsInternal` success and catastrophic failure paths
    - Test `startStepFunctionForSync` includes `createdAfter` in payload
    - Test `startStepFunctionForSync` omits `createdAfter` when null
    - Test existing `fetchFromConsignCloud` and `syncToShopTable` still return correct HTTP responses
    - _Requirements: 2.3, 2.4, 2.5, 5.1, 5.2, 5.3_

- [x] 6. Implement sync orchestrator
  - [x] 6.1 Create `sync-orchestrator.ts` with main `handleScheduledSync` function
    - Create file at `projects/shop-api/src/import/sync-orchestrator.ts`
    - Generate correlation ID (v4 UUID) as first action
    - Attempt lock acquisition; if fresh lock exists, log INFO and return early
    - If stale lock, attempt force-acquire; if race lost, log INFO and return early
    - Capture `syncTimestamp` immediately after lock acquisition (before any phase)
    - Log structured sync start with correlation ID, state timestamps, and phase mode (full/incremental)
    - _Requirements: 2.1, 3.1, 3.3, 3.4, 3.5, 9.1, 9.2, 9.4, 9.5_

  - [x] 6.2 Implement sequential phase execution in sync orchestrator
    - Phase 1 (Accounts): Call `fetchAccountsInternal()` then `syncAccountsInternal()` synchronously
    - On account success: update `lastAccountSyncAt` with pre-captured `syncTimestamp`
    - On account failure (non-recoverable): skip items + sales, log ERROR, release lock
    - Phase 2 (Items): Call `startStepFunctionForSync` with `createdAfter` from state's `lastItemSyncAt`
    - On item start success: update `lastItemSyncAt` with pre-captured `syncTimestamp`
    - On item start failure: retry once after 2s for retryable errors, log ERROR, continue to sales
    - Phase 3 (Sales): Call `startStepFunctionForSync` with `createdAfter` from state's `lastSaleSyncAt`
    - On sale start success: update `lastSaleSyncAt` with pre-captured `syncTimestamp`
    - On sale start failure: retry once after 2s for retryable errors, log ERROR
    - Release lock in `finally` block (handle case where lock was never acquired)
    - Log structured sync complete with correlation ID, elapsed time, phase outcomes, and execution ARNs
    - Return `SyncRunResult` object
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 8.1, 8.2, 8.3, 8.4, 9.1, 9.3, 9.5_

  - [x] 6.3 Write property tests for sync orchestrator
    - **Property 3: Sync state timestamps are only updated on phase success**
    - **Property 4: Sync timestamp is captured before phase execution**
    - **Property 5: Sequential phase ordering is maintained**
    - **Property 6: Account failure skips subsequent phases**
    - **Property 7: Lock is always released in finally block**
    - **Property 8: Correlation ID is present in all log entries**
    - **Property 9: Step Function retry follows defined policy**
    - **Validates: Requirements 2.1, 2.6, 2.7, 2.8, 3.6, 3.7, 4.2, 4.3, 4.4, 6.4, 8.1, 8.4, 9.5**

  - [x] 6.4 Write unit tests for sync orchestrator
    - Test happy path: all phases succeed, all timestamps updated, lock released
    - Test skip due to fresh lock: logs INFO, returns early without imports
    - Test stale lock force-acquire success: logs WARN, proceeds with sync
    - Test stale lock force-acquire race lost: logs INFO, returns early
    - Test account failure: items and sales skipped, no timestamps updated, lock released
    - Test item Step Function start retryable error: retries once after 2s, then logs ERROR and continues to sales
    - Test sale Step Function start non-retryable error: logs ERROR immediately, no retry
    - Test unhandled exception: lock released in finally, error logged, response returned
    - Test correlation ID present in all log entries
    - Test sync state DynamoDB update failure retries 2x then continues
    - _Requirements: 2.1, 2.7, 2.8, 3.1, 3.4, 3.5, 3.6, 3.7, 3.8, 6.4, 6.5, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Wire handler routing and integration
  - [x] 8.1 Update `import-handler.ts` to detect `scheduled-sync` action
    - Add detection of `rawEvent.action === "scheduled-sync"` after the existing `resume-internal` check
    - Import and call `handleScheduledSync()` from sync orchestrator
    - Return the result as a JSON response with statusCode 200
    - _Requirements: 1.2, 1.6_

  - [x] 8.2 Write unit tests for handler routing
    - Test `{ action: "scheduled-sync" }` event routes to sync orchestrator
    - Test existing `resume-internal` routing still works unchanged
    - Test API Gateway path-based routing still works unchanged
    - _Requirements: 1.2_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementation follows existing project patterns
- All new files go in `projects/shop-api/src/import/` following kebab-case naming
- Test files go in `projects/shop-api/src/import/__tests__/` following `*.test.ts` and `*.property.test.ts` conventions
- Terraform changes are in `infrastructure/modules/import/main.tf`
- The Step Functions state machine definition does NOT need modification — `createdAfter` is passed through the Lambda payload

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "3.2", "3.3", "5.1", "5.2", "5.3"] },
    { "id": 2, "tasks": ["5.4", "6.1"] },
    { "id": 3, "tasks": ["6.2"] },
    { "id": 4, "tasks": ["6.3", "6.4"] },
    { "id": 5, "tasks": ["8.1"] },
    { "id": 6, "tasks": ["8.2"] }
  ]
}
```
