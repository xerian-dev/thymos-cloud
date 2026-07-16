# Implementation Plan: Account Sync Refactor

## Overview

Extract shared fetch-stage-sync plumbing from existing Item and Sale import modules into generic, parameterized modules, then implement a new Account import using those generics. The implementation progresses from safe generic extraction → backward-compatible migration → new account-specific modules → infrastructure wiring → tests.

All code lives in `projects/shop-api/src/import/`. Infrastructure changes are in `infrastructure/api-gateway.tf`. TypeScript strict mode throughout. Vitest for tests.

## Tasks

- [x] 1. Extract generic modules from existing code
  - [x] 1.1 Create `generic-consigncloud-client.ts`
    - Extract `fetchWithRetry` from `item-consigncloud-client.ts` / `sale-consigncloud-client.ts`
    - Define `ConsignCloudClientConfig` and `FetchPageResult<T>` interfaces
    - Implement 429 exponential backoff (respecting Retry-After), 5xx retry (3 attempts), AbortSignal timeout (default 30s), immediate throw on non-retryable 4xx
    - Export `fetchWithRetry(url: string, config: ConsignCloudClientConfig): Promise<Response>`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 1.2 Create `generic-job-manager.ts`
    - Extract from `job-manager.ts` / `sale-job-manager.ts`
    - Define `GenericJobManagerConfig` with `prefix` parameter
    - Implement `createJobManager(config)` factory returning `createJob`, `getJob`, `getRunningOrPausedJob`, `transitionJob`, `updateJobPhase`
    - Enforce state machine transitions: running → paused/failed/complete, paused → running, failed → running
    - DynamoDB key pattern: `PK: "<PREFIX>#<jobId>"`, `SK: "METADATA"`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 1.3 Create `generic-checkpoint-manager.ts`
    - Extract from `checkpoint-manager.ts` / `sale-checkpoint-manager.ts`
    - Define `GenericCheckpointManagerConfig` with `prefix` parameter
    - Implement `createCheckpointManager(config)` factory returning `saveCheckpoint`, `loadCheckpoint`
    - 3-retry mechanism with 500ms delay on save failure
    - DynamoDB key pattern: `PK: "<PREFIX>#<jobId>"`, `SK: "CHECKPOINT"`
    - Return null for missing checkpoints
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 1.4 Create `generic-fetch-orchestrator.ts`
    - Extract pagination/checkpoint/timeout loop from `item-fetch-orchestrator.ts` / `sale-fetch-orchestrator.ts`
    - Define `GenericFetchOrchestratorConfig<T>` with `fetchPage`, `stageRecords`, `jobManager`, `checkpointManager` callbacks
    - Implement `runGenericFetchLoop<T>(config): Promise<FetchLoopResult>`
    - Loop: load checkpoint → fetchPage → stageRecords → save checkpoint → repeat until cursor exhausted or timeout
    - On cursor exhaustion → transition job to "paused", return "complete"
    - On timeout threshold → return "continue"
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Migrate existing Item and Sale imports to use generic modules
  - [x] 2.1 Migrate `item-consigncloud-client.ts` to wrap `generic-consigncloud-client.ts`
    - Replace internal retry/backoff logic with call to `fetchWithRetry`
    - Preserve existing exported function signatures (backward compatible)
    - Keep item-specific URL building and response parsing
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 2.2 Migrate `sale-consigncloud-client.ts` to wrap `generic-consigncloud-client.ts`
    - Replace internal retry/backoff logic with call to `fetchWithRetry`
    - Preserve existing exported function signatures (backward compatible)
    - Keep sale-specific URL building and response parsing
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 2.3 Migrate `job-manager.ts` to wrap `generic-job-manager.ts`
    - Replace internal logic with `createJobManager({ prefix: "ITEM_IMPORT" })`
    - Preserve all existing exported function signatures
    - _Requirements: 9.1, 9.5_

  - [x] 2.4 Migrate `sale-job-manager.ts` to wrap `generic-job-manager.ts`
    - Replace internal logic with `createJobManager({ prefix: "SALE_IMPORT" })`
    - Preserve all existing exported function signatures
    - _Requirements: 9.1, 9.5_

  - [x] 2.5 Migrate `checkpoint-manager.ts` to wrap `generic-checkpoint-manager.ts`
    - Replace internal logic with `createCheckpointManager({ prefix: "ITEM_IMPORT" })`
    - Preserve existing exported function signatures
    - _Requirements: 9.1, 9.5_

  - [x] 2.6 Migrate `sale-checkpoint-manager.ts` to wrap `generic-checkpoint-manager.ts`
    - Replace internal logic with `createCheckpointManager({ prefix: "SALE_IMPORT" })`
    - Preserve existing exported function signatures
    - _Requirements: 9.1, 9.5_

  - [x] 2.7 Migrate `item-fetch-orchestrator.ts` to wrap `generic-fetch-orchestrator.ts`
    - Replace internal loop logic with `runGenericFetchLoop<Item>(config)`
    - Preserve exported `runFetchLoop` signature
    - _Requirements: 9.1, 9.3_

  - [x] 2.8 Migrate `sale-fetch-orchestrator.ts` to wrap `generic-fetch-orchestrator.ts`
    - Replace internal loop logic with `runGenericFetchLoop<Sale>(config)`
    - Preserve exported `runSaleFetchLoop` signature
    - _Requirements: 9.1, 9.3_

- [x] 3. Checkpoint — Verify backward compatibility
  - Ensure all existing tests pass after migration (run `vitest --run`)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement account-specific modules
  - [x] 4.1 Create `account-consigncloud-client.ts`
    - Define `ConsignCloudAccount` interface with all fields from the design
    - Define `FetchAccountPageResult` and `AccountClientConfig` interfaces
    - Implement `fetchAccountPage(cursor, limit, config): Promise<FetchAccountPageResult>`
    - Build URL with full `include` and `expand` params per design
    - Apply `updated:gt` filter when `updatedAfter` is provided
    - Use `fetchWithRetry` from generic client
    - Parse response JSON, extract `next_cursor` for pagination
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 4.2 Create `account-fetch-orchestrator.ts`
    - Define `AccountFetchOrchestratorConfig` interface
    - Implement `runAccountFetchLoop(config): Promise<FetchLoopResult>`
    - Wire generic fetch orchestrator with account page-fetch function
    - Implement staging logic: DynamoDB BatchWriteItem in groups of 25
    - Key pattern: `PK: "IMPORT#CONSIGNCLOUD#ACCOUNT#<account_id>"`, `SK: "METADATA"`
    - Store full raw payload + `importedAt` timestamp
    - Use `createJobManager({ prefix: "ACCOUNT_IMPORT" })` and `createCheckpointManager({ prefix: "ACCOUNT_IMPORT" })`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 4.3 Create `account-import-handler.ts`
    - Implement `handleAccountImportStart` — reject if running/paused account job exists (409), create job, start Step Function
    - Implement `handleAccountImportStatus` — return job state/progress
    - Implement `handleAccountImportResume` — transition paused/failed → running, start Step Function
    - Implement `handleAccountImportCancel` — delete job + checkpoint records for paused/failed jobs
    - Implement `handleAccountResumeInternal` — only run fetch phase (no sync phase)
    - Follow the same handler pattern as `sale-import-handler.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 10.1, 10.2, 10.3_

  - [x] 4.4 Update `step-function-starter.ts` to support account type
    - Extend `ImportJobType` union to include `"account"`
    - No other changes needed
    - _Requirements: 7.4, 8.3_

  - [x] 4.5 Update `sync-orchestrator.ts` to include account in scheduled sync
    - In `handleScheduledSync`, add account import trigger alongside item/sale
    - Read `lastAccountSyncAt` from sync state → pass as `createdAfter`
    - Skip if account import already running/paused
    - On fetch completion, update `lastAccountSyncAt` via `updateSyncStateField`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 4.6 Wire account routes into `import-handler.ts`
    - Add imports for account handler functions
    - Add route dispatching for `POST /api/import/accounts/start`, `/status`, `/resume`, `/cancel`
    - Add `"account"` type handling in `resume-internal` dispatch
    - _Requirements: 7.4_

- [x] 5. Infrastructure — Terraform route additions
  - [x] 5.1 Add API Gateway routes for account import in `api-gateway.tf`
    - Add `aws_apigatewayv2_route` resources for:
      - `POST /api/import/accounts/start`
      - `POST /api/import/accounts/status`
      - `POST /api/import/accounts/resume`
      - `POST /api/import/accounts/cancel`
    - Use same integration (monolambda) and authorizer as sale routes
    - _Requirements: 7.4_

- [x] 6. Checkpoint — Verify account import builds and routes compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Tests
  - [x] 7.1 Write unit tests for `generic-consigncloud-client.ts`
    - Test 429 exponential backoff and Retry-After header respect
    - Test 5 consecutive 429s → throws rate-limit error
    - Test 5xx retry (3 attempts) with exponential backoff
    - Test timeout (AbortSignal)
    - Test non-retryable 4xx → immediate throw with status/body
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 7.2 Write unit tests for `generic-job-manager.ts`
    - Test job creation with UUID and initial state
    - Test valid state transitions (running→paused, running→failed, running→complete, paused→running, failed→running)
    - Test invalid transitions throw errors
    - Test `getRunningOrPausedJob` returns active job or null
    - Test DynamoDB key pattern uses correct prefix
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 7.3 Write unit tests for `generic-checkpoint-manager.ts`
    - Test save persists cursor + progress + timestamp
    - Test load returns null when no checkpoint exists
    - Test 3-retry with 500ms delay on save failure
    - Test throws after retry exhaustion
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 7.4 Write unit tests for `generic-fetch-orchestrator.ts`
    - Test pagination loop processes all pages
    - Test checkpoint save after each page
    - Test resume from existing checkpoint
    - Test timeout detection → returns "continue"
    - Test cursor exhaustion → transitions to "paused", returns "complete"
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [x] 7.5 Write unit tests for `account-consigncloud-client.ts`
    - Test correct `include` and `expand` query parameters
    - Test `updated:gt` filter applied when `updatedAfter` provided
    - Test cursor forwarding in pagination
    - Test response parsing extracts accounts and nextCursor
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [x] 7.6 Write unit tests for `account-import-handler.ts`
    - Test start → 409 when active job exists
    - Test start → creates job + starts Step Function
    - Test start → 500 on Step Function failure (job transitions to failed)
    - Test status returns job state/progress
    - Test resume → validates paused/failed state
    - Test cancel → validates paused/failed state, deletes records
    - Test `handleAccountResumeInternal` only runs fetch phase
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 10.1, 10.3_

  - [x] 7.7 Write integration test for backward compatibility
    - Run existing item import test suite after migration (no changes expected)
    - Run existing sale import test suite after migration (no changes expected)
    - Verify same DynamoDB key patterns are used
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Run full test suite: `vitest --run`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The generic modules do NOT break existing code when created (they are additive)
- Migration tasks (2.x) change internal implementations but preserve public APIs
- Account modules (4.x) are new files with no risk to existing functionality
- Infrastructure (5.x) adds routes without modifying existing ones
- The design explicitly states property-based testing does not apply to this feature

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6"] },
    { "id": 3, "tasks": ["2.7", "2.8"] },
    { "id": 4, "tasks": ["4.1", "4.4"] },
    { "id": 5, "tasks": ["4.2", "4.5"] },
    { "id": 6, "tasks": ["4.3"] },
    { "id": 7, "tasks": ["4.6", "5.1"] },
    { "id": 8, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 9, "tasks": ["7.4", "7.5"] },
    { "id": 10, "tasks": ["7.6", "7.7"] }
  ]
}
```
