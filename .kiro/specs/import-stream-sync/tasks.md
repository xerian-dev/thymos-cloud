# Implementation Plan: Import Stream Sync — Field Parity & Sync Removal

## Overview

Expand the stream Lambda's item processing pipeline to full parity with the import item-mapper (status derivation, new optional fields), enhance the upsert-service with GSI2/GSI3 keys, CC SKU passthrough, sequence counter seeding, and graceful account skip logic, then remove the now-redundant sync phase from the import flow entirely.

## Tasks

- [x] 1. Stream item-mapper field parity
  - [x] 1.1 Add status derivation to stream item-mapper
    - Add `ItemStatus` type, `STATUS_PRIORITY` array, `SOLD_VARIANTS` set, and `deriveItemStatus` function to `projects/shop-api/src/stream/item-mapper.ts`
    - Mirror the logic from `src/import/item-mapper.ts`: normalize sold variants, return highest-priority status with non-zero count, default to "active" for null/undefined/empty
    - Export `deriveItemStatus`, `STATUS_PRIORITY`, `SOLD_VARIANTS`, and `ItemStatus`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Add new optional fields to MappedItem and mapItem
    - Add `status: ItemStatus` (required) to `MappedItem` interface
    - Add optional fields: `location`, `details`, `scheduleStart`, `expirationDate`, `lastSold`, `lastViewed`, `labelPrintedAt`, `daysOnShelf`, `deleted`
    - In `mapItem`, derive `status` from `raw.status` using `deriveItemStatus` with type guard (check `raw.status` is non-null object with number values)
    - Extract `location` from `raw.location.name` (type guard: nested object with string `name`)
    - Extract `details` from `raw.details` (string, max 5000 chars)
    - Extract `scheduleStart` from `raw.schedule_start`, `expirationDate` from `raw.expires`, `lastSold` from `raw.last_sold`, `lastViewed` from `raw.last_viewed`, `labelPrintedAt` from `raw.printed` (all strings)
    - Extract `daysOnShelf` from `raw.days_on_shelf` (number)
    - Extract `deleted` from `raw.deleted` (string)
    - _Requirements: 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16_

  - [x] 1.3 Write property tests for status derivation
    - **Property 1: Status derivation returns highest-priority non-zero status**
    - **Property 2: Sold variant normalization**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
    - Use fast-check to generate arbitrary `Record<string, number>` status breakdown objects
    - Assert `deriveItemStatus` returns the earliest STATUS_PRIORITY entry with count > 0
    - Assert all sold variants collapse to "sold"

  - [x] 1.4 Write property tests for mapItem field parity
    - **Property 3: mapItem status integration**
    - **Property 4: Optional field passthrough**
    - **Property 5: Type-safe mapping never throws**
    - **Validates: Requirements 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16**
    - Use fast-check to generate valid raw records with various optional field combinations
    - Assert mapped output includes correct status and all present optional fields
    - Assert mapItem never throws for any `Record<string, unknown>` input

- [x] 2. Checkpoint - Ensure stream item-mapper tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Upsert service expansion
  - [x] 3.1 Add account source ID extraction and graceful skip logic
    - In `projects/shop-api/src/stream/upsert-service.ts`, add `extractAccountSourceId(raw)` helper that tries `raw.account.id` (nested object) then falls back to `raw.account_id` (flat string)
    - Modify `upsertItem` creation path: when account source ID is present but `findBySourceId` returns nothing, log a structured warning and return `{ action: "skipped" }`
    - When no account source ID is present, proceed without `accountId` or GSI2 keys
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 3.2 Add CC SKU passthrough and sequence counter seeding
    - In `upsertItem` creation path: parse `raw.sku` as integer; if positive, use directly as SKU instead of calling `getNextSequenceNumber`
    - If `raw.sku` is absent/empty/non-numeric, fall back to `getNextSequenceNumber("ITEM")`
    - After using a CC SKU directly, call `seedSequenceCounter("ITEM", sku)` (to be added in task 3.3)
    - Write `raw.sku` as `sourceSku` on new item records when present
    - Format `GSI1SK` as `ITEM#<sku padded 7>` regardless of SKU source
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.3 Add seedSequenceCounter to sequence-service
    - In `projects/shop-api/src/stream/sequence-service.ts`, add and export `seedSequenceCounter(entityType, value)` function
    - Use conditional UpdateCommand: `SET #val = :newVal` with `ConditionExpression: "attribute_not_exists(#val) OR #val < :newVal"`
    - Catch and swallow `ConditionalCheckFailedException` (counter already higher)
    - _Requirements: 3.3_

  - [x] 3.4 Add GSI2/GSI3 keys and new fields to upsert creation path
    - In `upsertItem` creation path: write `GSI2PK: ACCOUNT#<accountUuid>` and `GSI2SK: ITEM#<createdAt>` when accountId is resolved
    - Write `GSI3PK: CATEGORY#<categoryUuid>` and `GSI3SK: ITEM#<createdAt>` when categoryId is resolved
    - Write `status` field from mapped data
    - Write all new optional fields (`location`, `details`, `scheduleStart`, `expirationDate`, `lastSold`, `lastViewed`, `labelPrintedAt`, `daysOnShelf`, `deleted`) when present
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.5 Expand upsert update path with new fields and GSI keys
    - In `upsertItem` update path: include `status` in UpdateExpression
    - Include all new optional fields in UpdateExpression when present in mapped data
    - Resolve account from raw record; if resolved, update `GSI2PK`/`GSI2SK`
    - Resolve category from raw record; if resolved, update `GSI3PK`/`GSI3SK`
    - _Requirements: 2.3, 2.4, 2.6, 2.7_

  - [x] 3.6 Write property tests for SKU resolution and GSI formatting
    - **Property 6: CC SKU passthrough for numeric strings**
    - **Property 7: GSI1SK formatting correctness**
    - **Validates: Requirements 3.1, 3.4**
    - Use fast-check to generate strings where `parseInt(s, 10)` is a positive integer
    - Assert SKU resolution uses the parsed value without calling sequence service
    - Assert GSI1SK is `ITEM#` + 7-digit zero-padded SKU for any positive integer 1–9,999,999

  - [x] 3.7 Write property test for account source ID extraction
    - **Property 8: Account source ID extraction**
    - **Validates: Requirements 4.1**
    - Use fast-check to generate raw records with nested `account.id` or flat `account_id`
    - Assert extraction function returns the correct source ID

  - [x] 3.8 Write unit tests for upsert-service expansion
    - Test account skip: account source ID present but not found → returns `{ action: "skipped" }`
    - Test CC SKU passthrough: numeric sku used directly, seedSequenceCounter called
    - Test GSI2/GSI3 written on create when account/category resolved
    - Test update path includes status and new optional fields
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4_

- [x] 4. Checkpoint - Ensure upsert-service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Remove sync phase from import flow
  - [x] 5.1 Modify generic-fetch-orchestrator for direct completion
    - In `projects/shop-api/src/import/generic-fetch-orchestrator.ts`, change the fetch-exhausted path: transition job to `"complete"` instead of `"paused"`
    - Write an import report with progress counts upon fetch completion
    - Return `{ status: "complete" }` so the Step Function reaches the Done state
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 5.2 Remove sync handling from item-import-handler
    - In `projects/shop-api/src/import/item-import-handler.ts`:
    - Remove `handleItemImportSync` function entirely
    - Remove `runSyncPhase` function entirely
    - Remove the `else` branch in `handleResumeInternal` (the sync path)
    - Remove `import { runSyncLoop } from "./item-sync-orchestrator"`
    - Remove `import { updateJobPhase } from "./job-manager"` if no longer used
    - Simplify `handleResumeInternal` to only handle fetch phase (remove phase parameter branching)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.3 Delete item-sync-orchestrator
    - Delete `projects/shop-api/src/import/item-sync-orchestrator.ts`
    - Remove any remaining imports or references to this module across the codebase
    - _Requirements: 5.5_

  - [x] 5.4 Remove Terraform API Gateway route for items/sync
    - In `infrastructure/modules/import/main.tf`, remove the `aws_apigatewayv2_route.post_import_items_sync` resource block
    - _Requirements: 5.6_

  - [x] 5.5 Write unit tests for fetch completion flow
    - Test that generic-fetch-orchestrator transitions to "complete" when cursor is null
    - Test that import report is written on fetch completion
    - Test that handleResumeInternal no longer accepts sync phase
    - _Requirements: 6.1, 6.2, 6.3, 5.1, 5.2, 5.3_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing import `item-mapper.ts` has the reference implementation for status derivation — mirror its logic exactly in the stream version
- The `item-sync-orchestrator.ts` deletion is safe because all its functionality is now handled by the stream Lambda
- The Step Function state machine definition remains unchanged — it continues looping the fetch phase until complete

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["3.1", "3.3"] },
    { "id": 4, "tasks": ["3.2", "3.4"] },
    { "id": 5, "tasks": ["3.5"] },
    { "id": 6, "tasks": ["3.6", "3.7", "3.8"] },
    { "id": 7, "tasks": ["5.1", "5.4"] },
    { "id": 8, "tasks": ["5.2"] },
    { "id": 9, "tasks": ["5.3", "5.5"] }
  ]
}
```
