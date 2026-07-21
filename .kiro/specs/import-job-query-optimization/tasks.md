# Implementation Plan: Import Job Query Optimization

## Overview

Replace full DynamoDB table scans with efficient Query operations by introducing fat pointer records under a `JOBS` partition key. Modify `generic-job-manager.ts` to write/update pointer records transactionally, rewrite query functions in `import-status-handler.ts` and `import-history-handler.ts` to use Query operations, update cancel handlers to transition to `cancelled` state instead of deleting records, and provide a migration script for existing jobs.

## Tasks

- [x] 1. Extend types and add pointer utility functions
  - [x] 1.1 Add `cancelled` to `JobState` type and update `VALID_TRANSITIONS` in `generic-job-manager.ts`
    - Add `"cancelled"` to the `JobState` union type
    - Add `cancelled: []` entry to `VALID_TRANSITIONS` (terminal state, no outbound transitions)
    - _Requirements: 9.1, 9.2_

  - [x] 1.2 Add `buildPointerSK` and `mapPointerToImportJob` helper functions in `generic-job-manager.ts`
    - Implement `buildPointerSK(prefix, lastUpdatedAt, jobId)` returning `${prefix}#${lastUpdatedAt}#${jobId}`
    - Implement `mapPointerToImportJob(item)` mapping a pointer record to the `ImportJob` interface
    - Export the `PointerRecord` interface with fields: jobId, state, phase, progress, startedAt, lastUpdatedAt, error, prefix
    - _Requirements: 1.2, 4.3, 5.2_

- [x] 2. Modify job creation to write pointer records transactionally
  - [x] 2.1 Replace `PutCommand` with `TransactWriteCommand` in `createJob` within `generic-job-manager.ts`
    - Import `TransactWriteCommand` from `@aws-sdk/lib-dynamodb`
    - Write both the metadata record and the pointer record (PK: `JOBS`, SK: pointer SK) in a single transaction
    - Pointer record fields: jobId, state, phase, progress, startedAt, lastUpdatedAt, prefix
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 2.2 Write unit tests for transactional job creation
    - Verify pointer record is created with correct PK/SK pattern
    - Verify pointer fields match metadata record fields
    - Verify transaction includes both metadata and pointer items
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Modify state transitions to maintain pointer records
  - [x] 3.1 Update `transitionJob` in `generic-job-manager.ts` to use `TransactWriteCommand` with pointer delete/write
    - Read current job to get `lastUpdatedAt` for old pointer SK
    - Build old and new pointer SKs
    - Transaction: update metadata + delete old pointer + put new pointer
    - New pointer contains updated state, progress, lastUpdatedAt, and error fields
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Update `updateJobPhase` in `generic-job-manager.ts` to use `TransactWriteCommand` with pointer delete/write
    - Read current job to get `lastUpdatedAt` for old pointer SK
    - Build old and new pointer SKs
    - Transaction: update metadata phase + delete old pointer + put new pointer with updated phase and lastUpdatedAt
    - _Requirements: 3.1, 3.2_

  - [x] 3.3 Write unit tests for state transition pointer maintenance
    - Verify old pointer is deleted and new pointer is created on state transition
    - Verify new pointer SK contains updated lastUpdatedAt
    - Verify pointer fields reflect transition parameters (state, progress, error)
    - Verify error is thrown and no pointer is modified when metadata record doesn't exist
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Replace scan-based queries with Query operations
  - [x] 5.1 Rewrite `getRunningOrPausedJob` in `generic-job-manager.ts` to use `QueryCommand`
    - Query PK `JOBS` with `begins_with(SK, <prefix>#)` condition
    - Add `FilterExpression` for state = `running` OR state = `paused` (excludes `cancelled`)
    - Return the first matching pointer record mapped to `ImportJob`
    - Remove the old scan-based implementation
    - _Requirements: 4.1, 4.2, 4.3, 9.3_

  - [x] 5.2 Rewrite `getMostRecentJob` in `import-status-handler.ts` to use `QueryCommand`
    - Query PK `JOBS` with `begins_with(SK, <prefix>#)`, `ScanIndexForward: false`, `Limit: 1`
    - Return job data directly from pointer record fields
    - Remove the old full-table scan and in-memory sort
    - _Requirements: 5.1, 5.2_

  - [x] 5.3 Rewrite `getHistoryJobs` in `import-history-handler.ts` to use `QueryCommand` with cursor-based pagination
    - Query PK `JOBS` with `begins_with(SK, <prefix>#)`, `ScanIndexForward: false`, `Limit: pageSize`
    - Use `LastEvaluatedKey` as the pagination cursor (base64-encoded as nextToken)
    - Accept `ExclusiveStartKey` decoded from nextToken for subsequent pages
    - Return job data directly from pointer record fields
    - Remove the old scan-all-then-sort-in-memory implementation
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 5.4 Write unit tests for query-based lookups
    - Test `getRunningOrPausedJob` returns only running/paused jobs, excludes cancelled/complete/failed
    - Test `getMostRecentJob` returns the job with the latest lastUpdatedAt
    - Test `getHistoryJobs` returns correct page size and valid nextToken for pagination
    - _Requirements: 4.1, 4.2, 5.1, 6.1, 6.2, 6.3_

- [x] 6. Update cancel handlers to transition to `cancelled` state
  - [x] 6.1 Refactor `handleItemImportCancel` in `item-import-handler.ts` to use state transition instead of delete
    - Replace record deletion with a `TransactWriteCommand` that updates metadata state to `cancelled` + deletes old pointer + writes new pointer with `cancelled` state
    - Keep validation: only allow cancel from `running`, `paused`, or `failed` states
    - Remove the Delete commands for METADATA and CHECKPOINT sort keys
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 6.2 Refactor `handleAccountImportCancel` in `account-import-handler.ts` to use state transition instead of delete
    - Same pattern as 6.1: transition to `cancelled` state via transaction with pointer update
    - Update validation to allow cancel from `running`, `paused`, or `failed` states (currently only `paused`/`failed`)
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 6.3 Add cancel handler for sale imports (if missing) or update existing sale cancel handler
    - Implement same cancel-via-state-transition pattern for `SALE_IMPORT` prefix
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 6.4 Write unit tests for cancel handlers
    - Verify cancel transitions job state to `cancelled` instead of deleting metadata
    - Verify pointer record is updated with `cancelled` state and new lastUpdatedAt
    - Verify cancelled jobs appear in history queries
    - Verify cancel is rejected for jobs in `complete` or `cancelled` state
    - _Requirements: 7.1, 7.2, 7.3, 9.2, 9.3_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Create migration script for existing jobs
  - [x] 8.1 Create `projects/shop-api/src/import/scripts/migrate-job-pointers.ts`
    - Scan all existing `METADATA` records for each prefix (`ITEM_IMPORT`, `SALE_IMPORT`, `ACCOUNT_IMPORT`)
    - For each record, create a pointer record using conditional PutItem (`attribute_not_exists(PK)`) for idempotence
    - Log progress: total found, created, and skipped counts
    - Handle `ConditionalCheckFailedException` gracefully (increment skip counter)
    - Require `IMPORT_TABLE_NAME` environment variable
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 8.2 Write unit tests for migration script logic
    - Test idempotence: running twice produces same pointer set
    - Test all three prefixes are processed
    - Test existing pointers are skipped without error
    - Test progress logging outputs correct counts
    - _Requirements: 8.3, 8.5_

- [x] 9. Wire updated exports and clean up unused imports
  - [x] 9.1 Update exports from `generic-job-manager.ts` and verify consumers compile
    - Export `PointerRecord` interface and helper functions
    - Ensure `job-manager.ts`, `sale-job-manager.ts`, and `account-fetch-orchestrator.ts` wrappers still compile
    - Remove unused `ScanCommand` imports from `import-status-handler.ts` and `import-history-handler.ts`
    - Add `QueryCommand` imports where needed
    - _Requirements: 4.1, 5.1, 6.1_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The design uses `TransactWriteCommand` for atomicity — if any part of the transaction fails, all changes roll back
- The migration script (task 8) can be run independently after deployment with no impact on running jobs
- Cancel handlers now transition to `cancelled` state instead of deleting records, which is a behaviour change that preserves history visibility

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.1", "6.2", "6.3"] },
    { "id": 5, "tasks": ["5.4", "6.4", "8.1"] },
    { "id": 6, "tasks": ["8.2", "9.1"] }
  ]
}
```
