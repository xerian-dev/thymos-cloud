# Implementation Plan: Item Import Rework

## Overview

Rework the existing item import to operate as an incremental scheduled sync with expanded field mapping, direct CC SKU usage, new DynamoDB GSIs for querying items by account and category, and enablement in the sync orchestrator with account-first ordering.

## Tasks

- [x] 1. Infrastructure: Add GSI3 to Shop_Table
  - [x] 1.1 Update `infrastructure/dynamodb.tf` with GSI3 attribute definitions and index
    - Add `attribute` block for `GSI3PK` (type `S`)
    - Add `attribute` block for `GSI3SK` (type `S`)
    - Add `global_secondary_index` block for `GSI3` with `GSI3PK` as hash key, `GSI3SK` as range key, and `ALL` projection
    - _Requirements: 6.7, 6.8, 9.1, 9.2, 9.4_

- [x] 2. Update ConsignCloud item client interface
  - [x] 2.1 Expand `ConsignCloudItem` interface in `item-consigncloud-client.ts`
    - Add new fields: `schedule_start`, `expires`, `status`, `last_sold`, `last_viewed`, `printed`, `days_on_shelf`, `details`
    - Ensure `deleted` field type is `string | null` (already exists but verify)
    - Ensure `sku` field type is `string` (already exists but verify)
    - _Requirements: 3.1, 8.1, 8.2, 8.3_

- [x] 3. Update item mapper with expanded fields and status derivation
  - [x] 3.1 Add `ItemStatus` type and `deriveItemStatus` function to `item-mapper.ts`
    - Define `ItemStatus` as union of 11 string literal values
    - Define `STATUS_PRIORITY` array ordering statuses from highest to lowest priority
    - Define `SOLD_VARIANTS` set containing `sold`, `sold_on_shopify`, `sold_on_square`, `sold_on_third_party`
    - Implement `deriveItemStatus(statusObj)` that normalizes sold variants and returns highest-priority status with non-zero count
    - Default to `"active"` when status object is null/empty
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 3.2 Expand `MappedItemFields` interface and update `mapConsignCloudItem`
    - Add new fields to `MappedItemFields`: `status`, `location`, `details`, `scheduleStart`, `expirationDate`, `lastSold`, `lastViewed`, `labelPrintedAt`, `daysOnShelf`, `deleted`, `createdAt`
    - Update `mapConsignCloudItem` to map: `location` from `item.location?.name`, `details` from `item.details` (max 5000 chars), `scheduleStart` from `item.schedule_start`, `expirationDate` from `item.expires`, `lastSold` from `item.last_sold`, `lastViewed` from `item.last_viewed`, `labelPrintedAt` from `item.printed`, `daysOnShelf` from `item.days_on_shelf`, `deleted` from `item.deleted`, `createdAt` from `item.created`
    - Call `deriveItemStatus(item.status)` and include result as `status`
    - Remove the `quantity` validation that rejects quantity < 1 (allow 0 for sold items)
    - _Requirements: 3.1, 3.4, 4.1_

  - [x] 3.3 Write unit tests for status derivation and expanded mapper
    - Test `deriveItemStatus` with single-status object `{ "active": 1 }` → `"active"`
    - Test with multi-status `{ "sold": 1, "active": 2 }` → `"active"` (higher priority)
    - Test with sold variants `{ "sold_on_shopify": 1 }` → `"sold"`
    - Test with empty object → `"active"`
    - Test with null → `"active"`
    - Test `mapConsignCloudItem` includes all new fields when present
    - Test `mapConsignCloudItem` handles null/undefined new fields gracefully
    - Test quantity 0 is allowed (sold items)
    - Test deleted items are mapped (not rejected)
    - _Requirements: 3.1, 3.4, 4.1, 4.2, 4.3, 4.4_

- [x] 4. Remove deleted-item filter from fetch loop
  - [x] 4.1 Update `item-fetch-orchestrator.ts` to remove `isDeletedItem` filtering
    - Remove the `isDeletedItem` import and filter logic from the `stageRecords` callback
    - Stage all items regardless of `deleted` status
    - The skipped count for the fetch phase should now only reflect truly skipped items (none for deleted)
    - _Requirements: 3.4_

- [x] 5. Update item sync orchestrator with new fields, SKU handling, and GSI keys
  - [x] 5.1 Change account resolution from account number to sourceId
    - Replace `resolveAccountByNumber` with `resolveAccountBySourceId`
    - Use `item.account?.id` (CC account UUID) for lookup via `sourceId-index` GSI
    - Update the account cache to key by CC account ID instead of account number
    - _Requirements: 3.1, 3.5, 10.3_

  - [x] 5.2 Update SKU handling to use CC SKU directly
    - When `item.sku` is present and numeric, parse it to integer and use as the item's `sku`
    - When `item.sku` is missing or non-numeric, fall back to `getNextSku()` from sequence counter
    - Store raw CC `sku` string as `sourceSku` on the item record
    - Track max SKU encountered during the sync loop
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 5.3 Add sequence counter seeding after first import completion
    - After sync completes, if the max SKU encountered is greater than the current counter value, update the counter to max SKU
    - Use unconditional PutItem (overwrite) since this only happens on first full import
    - Log the counter seed value at INFO level
    - _Requirements: 5.3_

  - [x] 5.4 Update `writeItem` to include new fields and GSI keys
    - Add `GSI2PK: ACCOUNT#<accountId>` and `GSI2SK: ITEM#<createdAt>` when accountUuid is present
    - Add `GSI3PK: CATEGORY#<categoryId>` and `GSI3SK: ITEM#<createdAt>` when categoryId is present
    - Use `mapped.createdAt` (CC's created timestamp) for `createdAt` and GSI sort keys
    - Add all new optional fields: `status`, `location`, `details`, `scheduleStart`, `expirationDate`, `lastSold`, `lastViewed`, `labelPrintedAt`, `daysOnShelf`, `deleted`, `sourceSku`
    - Add `sku` as a numeric attribute on the record (in addition to GSI1SK)
    - _Requirements: 3.1, 5.1, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 5.5 Write unit tests for updated sync orchestrator
    - Test account resolution by sourceId (found and not-found cases)
    - Test CC SKU used directly when numeric
    - Test fallback to sequence counter when SKU missing
    - Test fallback to sequence counter when SKU non-numeric
    - Test GSI2PK/GSI2SK populated when account resolved
    - Test GSI2PK/GSI2SK not set when account not resolved
    - Test GSI3PK/GSI3SK populated when category resolved
    - Test GSI3PK/GSI3SK not set when category not resolved
    - Test all new fields written to item record
    - Test sequence counter seeded to max SKU on completion
    - Test createdAt uses CC's created timestamp (not import time)
    - _Requirements: 3.1, 3.5, 3.6, 3.7, 5.1, 5.2, 5.3, 6.3, 6.4, 6.5_

- [x] 6. Checkpoint - Ensure all tests pass
  - Run all existing and new tests to verify no regressions
  - Ask user if questions arise

- [x] 7. Enable items phase in sync orchestrator
  - [x] 7.1 Replace disabled items phase with active import logic in `sync-orchestrator.ts`
    - Import the item job manager (from existing `job-manager.ts` or create item-specific one)
    - Check for existing running/paused item import job (skip if found)
    - Create new item import job with `createdAfter` from `syncState?.lastItemSyncAt`
    - Start Step Functions execution via `startStepFunctionWithRetry`
    - Update `lastItemSyncAt` on successful Step Function start
    - Log at INFO level with correlationId
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 7.2 Ensure accounts complete before items start
    - Verify the current account phase runs synchronously (inline) in the orchestrator
    - The items phase code should only execute after the accounts phase block completes
    - If accounts phase has `status: "error"`, skip items phase with reason
    - _Requirements: 2.1, 2.2_

  - [x] 7.3 Write unit tests for items phase in sync orchestrator
    - Test items phase starts when accounts succeed and no existing job
    - Test items phase skipped when accounts fail
    - Test items phase skipped when existing item job running
    - Test `lastItemSyncAt` updated on Step Function start success
    - Test `lastItemSyncAt` NOT updated on Step Function start failure
    - Test `createdAfter` passed from `lastItemSyncAt` (incremental)
    - Test `createdAfter` omitted when `lastItemSyncAt` is null (full import)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 8. Update data model documentation
  - [x] 8.1 Update `docs/data-model.md` with new item fields, GSI mappings, and status enumeration
    - Add new fields to ITEM entity in ER diagram: `location`, `sourceSku`, `scheduleStart`, `status`, `lastSold`, `lastViewed`, `labelPrintedAt`, `daysOnShelf`, `deleted`
    - Update DynamoDB single-table mapping table with GSI2 and GSI3 columns for Item
    - Add GSI2/GSI3 key design notes explaining the access patterns
    - Add Item Status enumeration section with all 11 values and descriptions
    - Update SKU notes to explain CC SKU is used directly on import
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 9. Final checkpoint - Ensure all tests pass and build succeeds
  - Run full test suite
  - Run TypeScript compilation check
  - Verify Terraform validates (`terraform validate`)
  - Ask user if questions arise

## Notes

- The existing Step Functions state machine, checkpoint manager, rate limiter, and generic fetch orchestrator are reused unchanged
- No new Lambda functions or infrastructure beyond the GSI3 addition
- The item fetch orchestrator changes are minimal (just removing the deleted filter)
- The bulk of the work is in the mapper and sync orchestrator
- Account resolution changing from number-based to sourceId-based is a correctness improvement
- GSI2 is overloaded: employees use `EMPLOYEES` partition, items use `ACCOUNT#<uuid>` partition — no collision
- The `include` and `expand` query parameters on the CC API call remain unchanged (already requesting all fields we need)
- Tests follow existing patterns: unit tests in `__tests__/` directories, property tests where appropriate

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["3.2", "3.3", "4.1"] },
    { "id": 2, "tasks": ["5.1", "5.2", "5.3", "5.4"] },
    { "id": 3, "tasks": ["5.5"] },
    { "id": 4, "tasks": ["7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3"] },
    { "id": 6, "tasks": ["8.1"] }
  ]
}
```
