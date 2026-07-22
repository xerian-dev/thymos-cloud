# Implementation Plan: Sale Import Rework

## Overview

Rework the existing sale import to operate as an incremental scheduled sync with expanded field mapping, CC sale number direct usage, all-status import, COGS replacing consignorPortion at sale level, and enablement in the sync orchestrator.

## Tasks

- [x] 1. Update ConsignCloud sale client interface and API parameters
  - [x] 1.1 Expand `ConsignCloudSale` interface in `sale-consigncloud-client.ts`
    - Add new fields: `cogs`, `refunded_amount`, `cash_rounding_adjustment`, `line_item_count`, `parked`, `notes`, `gift_cards`, `customer`, `register`, `register_report`, `pending_swipe`
    - Update `status` field documentation to include all values
    - _Requirements: 4.1, 8.1, 8.2_

  - [x] 1.2 Update `fetchSalePage` to include all `include` and `expand` parameters
    - Add `INCLUDE_VALUES` array with all working include values (excluding `total_tendered` and `amounts_tendered`)
    - Add `EXPAND_VALUES` array with all expand values
    - Update URL construction to append all include/expand params
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 1.3 Expand `ConsignCloudLineItem` interface
    - Ensure all fields from the API response are typed: `id`, `split`, `taxed_price`, `tax_exempt`, `refunded_quantity`, `created`, `applied_taxes` with snapshot
    - Update `item` field type to include `sku` and `title`
    - _Requirements: 5.1_

- [x] 2. Update sale mapper with expanded fields and all-status support
  - [x] 2.1 Update `MappedSaleFields` interface
    - Replace `consignorPortion` with `cogs`
    - Add: `refundedAmount`, `cashRoundingAdjustment`, `lineItemCount`, `parkedAt`
    - Change `status` type from `"finalized"` to `"open" | "finalized" | "voided"`
    - Change `number` from `sourceNumber: string` to `number: number` (parsed integer)
    - Remove `sourceNumber` field (CC number IS the number now)
    - Remove `voidedAt: null` constraint (can be non-null for voided sales)
    - _Requirements: 3.1, 3.3, 4.1, 4.3_

  - [x] 2.2 Update `MappedLineItemFields` interface
    - Add: `sourceId`, `itemSku`, `itemTitle`, `split`, `taxedPrice`, `taxExempt`, `refundedQuantity`, `totalTax`, `createdAt`
    - Rename existing `salePrice` from `unit_price` mapping (unchanged semantically)
    - _Requirements: 5.1_

  - [x] 2.3 Update `mapConsignCloudSale` function
    - Remove `isFinalizedSale` check (map all statuses)
    - Map `cogs` from `sale.cogs` (fallback to `sale.consignor_portion` if `cogs` is missing)
    - Map `refundedAmount` from `sale.refunded_amount` (default 0)
    - Map `cashRoundingAdjustment` from `sale.cash_rounding_adjustment` (default 0)
    - Map `lineItemCount` from `sale.line_item_count` (default 0)
    - Map `parkedAt` from `sale.parked`
    - Parse `number` to integer
    - Map `status` directly from CC value
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1_

  - [x] 2.4 Update line item mapping within `mapConsignCloudSale`
    - Add `sourceId` from `item.id` (CC line item UUID)
    - Add `itemSku` from `item.item?.sku ?? null`
    - Add `itemTitle` from `item.item?.title ?? null`
    - Add `split` from `item.split`
    - Add `taxedPrice` from `item.taxed_price`
    - Add `taxExempt` from `item.tax_exempt`
    - Add `refundedQuantity` from `item.refunded_quantity`
    - Add `totalTax` as sum of `item.applied_taxes.map(t => t.amount).reduce(sum, 0)`
    - Add `createdAt` from `item.created`
    - _Requirements: 5.1, 5.2_

  - [x] 2.5 Remove `isFinalizedSale` export or deprecate it
    - The function is no longer used in the fetch/sync flow
    - Either remove entirely or mark as deprecated
    - _Requirements: 3.1, 3.2_

  - [x] 2.6 Write unit tests for updated mapper
    - Test mapping of open sale (status preserved)
    - Test mapping of voided sale (voidedAt populated)
    - Test mapping of finalized sale (finalizedAt populated)
    - Test `cogs` mapped correctly
    - Test `refundedAmount` mapped correctly
    - Test `cashRoundingAdjustment` mapped correctly
    - Test line item `totalTax` derived from applied_taxes sum
    - Test line item `discount` derived from applied_discounts sum
    - Test line item `itemSku` and `itemTitle` populated
    - Test line item `sourceId` populated
    - Test sale number parsed to integer
    - Test fallback when `cogs` is missing (use `consignor_portion`)
    - _Requirements: 3.1, 4.1, 5.1_

- [x] 3. Remove finalized-only filter from fetch loop
  - [x] 3.1 Update `sale-fetch-orchestrator.ts` to remove status filtering
    - Remove any `isFinalizedSale` filtering from the `stageRecords` callback
    - Stage all sales regardless of status
    - _Requirements: 3.1, 3.2_

- [x] 4. Update sale sync orchestrator with new fields and number handling
  - [x] 4.1 Update sale number handling to use CC number directly
    - When `sale.number` is present and numeric, parse to integer and use directly
    - When `sale.number` is missing or non-numeric, fall back to `getNextSaleNumber()`
    - Track max sale number encountered during sync loop
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 4.2 Add sequence counter seeding after first import completion
    - After sync completes, if max number > current counter, update counter to max number
    - Use unconditional PutItem (overwrite)
    - Log the counter seed value at INFO level
    - _Requirements: 6.3_

  - [x] 4.3 Update sale record construction with new fields
    - Add `cogs`, `refundedAmount`, `cashRoundingAdjustment`, `lineItemCount`, `parkedAt`
    - Remove `consignorPortion` from sale record
    - Remove `sourceNumber` (CC number is now the `number`)
    - Use `mapped.createdAt` for the `createdAt` field
    - _Requirements: 4.1, 4.3_

  - [x] 4.4 Update line item record construction with new fields
    - Add `sourceId`, `itemSku`, `itemTitle`, `split`, `taxedPrice`, `taxExempt`, `refundedQuantity`, `totalTax`, `createdAt`
    - Ensure `itemSku` and `itemTitle` are always stored even when `itemId` is null
    - _Requirements: 5.1, 5.3_

  - [x] 4.5 Update item resolution to pass `itemSku` and `itemTitle` through
    - The current `resolveItemBySourceId` returns just the UUID
    - Line item mapping now carries `itemSku` and `itemTitle` directly from CC data
    - These fields are stored regardless of whether item resolution succeeds
    - _Requirements: 5.3, 9.4_

  - [x] 4.6 Write unit tests for updated sync orchestrator
    - Test CC sale number used directly when numeric
    - Test fallback to sequence counter when number missing
    - Test fallback to sequence counter when number non-numeric
    - Test all new sale fields written correctly
    - Test all new line item fields written correctly
    - Test `itemSku` and `itemTitle` stored even when `itemId` is null
    - Test sequence counter seeded to max number on completion
    - Test open/voided sales written (not filtered)
    - _Requirements: 3.1, 4.1, 5.1, 5.3, 6.1, 6.3_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run all existing and new tests to verify no regressions
  - Ask user if questions arise

- [x] 6. Enable sales phase in sync orchestrator
  - [x] 6.1 Replace disabled sales phase with active import logic in `sync-orchestrator.ts`
    - Import the sale job manager
    - Check for existing running/paused sale import job (skip if found)
    - Create new sale import job with `createdAfter` from `syncState?.lastSaleSyncAt`
    - Start Step Functions execution via `startStepFunctionWithRetry` with type `sale`
    - Update `lastSaleSyncAt` on successful Step Function start
    - Log at INFO level with correlationId
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6_

  - [x] 6.2 Ensure correct phase ordering
    - Sales phase code runs after items phase block (regardless of items outcome)
    - If items phase errored, sales phase still attempts (requirement 2.2)
    - _Requirements: 2.1, 2.2_

  - [x] 6.3 Write unit tests for sales phase in sync orchestrator
    - Test sales phase starts when no existing job
    - Test sales phase skipped when existing sale job running
    - Test `lastSaleSyncAt` updated on Step Function start success
    - Test `lastSaleSyncAt` NOT updated on Step Function start failure
    - Test `createdAfter` passed from `lastSaleSyncAt` (incremental)
    - Test `createdAfter` omitted when `lastSaleSyncAt` is null (full import)
    - Test sales phase still attempted when items phase errors
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 7. Update data model documentation
  - [x] 7.1 Update `docs/data-model.md` with sale and line item field changes
    - Update SALE entity: remove `consignorPortion`, add `cogs`, `refundedAmount`, `cashRoundingAdjustment`, `lineItemCount`, `parkedAt`
    - Update SALE_LINE_ITEM entity: add `sourceId`, `itemSku`, `itemTitle`, `split`, `taxedPrice`, `taxExempt`, `refundedQuantity`, `totalTax`, `createdAt`
    - Update Sale Status enumeration if needed
    - Add tech debt note about refund fields
    - Update sale number description (from CC, not generated)
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 8. Final checkpoint - Ensure all tests pass and build succeeds
  - Run full test suite
  - Run TypeScript compilation check
  - Ask user if questions arise

## Notes

- The existing Step Functions state machine, checkpoint manager, rate limiter, and generic fetch orchestrator are reused unchanged
- No new Lambda functions or infrastructure changes required
- The sale fetch orchestrator changes are minimal (just removing the finalized filter)
- The bulk of the work is in the mapper and sync orchestrator
- Employee (cashier) resolution pattern is unchanged — resolve or create on-the-fly
- Line items continue to be fetched separately per sale during the fetch phase
- Tests follow existing patterns in `projects/shop-api/src/import/__tests__/`
- The `consignor_portion` include parameter is still sent to CC API (needed to populate `cogs` fallback)
- `total_tendered` and `amounts_tendered` are explicitly excluded from CC API calls (cause 500 errors)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "3.1"] },
    { "id": 2, "tasks": ["2.6", "4.1", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 3, "tasks": ["4.6"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3"] },
    { "id": 6, "tasks": ["7.1"] }
  ]
}
```
