# Requirements Document

## Introduction

This feature reworks the existing sale import to operate as an incremental scheduled sync (matching the item and account import patterns), updates the sale and sale line item data models with additional fields from ConsignCloud, imports all sales regardless of status (not just finalized), uses ConsignCloud's sale number directly, and enables the sales phase in the existing sync orchestrator with a dependency on items completing first.

The existing sale import infrastructure (Step Functions loop, checkpoint management, page-by-page processing, rate limiter, line item fetching) is reused. The changes focus on: importing all sale statuses, expanding the field mapping, using CC sale numbers directly, updating the CC API query parameters to include all available fields, and wiring the sales phase into the scheduled orchestrator.

> **Tech Debt Note:** The `refundedAmount` (sale) and `refundedQuantity` (line item) fields are stored as informational snapshots from ConsignCloud. A proper Refund entity (with its own timestamp, operator, reason) should be modelled in a future spec. These fields will need migration when that model is built.

## Glossary

- **Sale_Importer**: The existing sale import handler within the Import Lambda that fetches sales page-by-page from ConsignCloud and writes them to the Shop_Table
- **Sync_Orchestrator**: The handler within the Import Lambda that coordinates scheduled sync phases (accounts -> items -> sales)
- **Shop_Table**: The existing DynamoDB table (`thymos-{environment}-shop`) storing production entity data
- **Import_Table**: The existing DynamoDB table (`thymos-{environment}-import`) used for job state, checkpoints, and sync state
- **ConsignCloud_API**: The external REST API at `https://api.consigncloud.com/api/v1` providing sale data
- **Step_Functions_State_Machine**: The existing AWS Step Functions state machine that orchestrates long-running import operations via Lambda re-invocation
- **Sync_State**: The record in Import_Table tracking last successful sync timestamps per import type
- **Source_ID**: The `sourceId` attribute storing the ConsignCloud UUID for deduplication
- **COGS**: Cost of Goods Sold — what the shop owes for the items in a sale (equals consignor_portion for consignment items, will differ for retail items in future)

## Requirements

### Requirement 1: Incremental Import Behaviour

**User Story:** As a shop operator, I want the sale import to fetch only new sales on subsequent runs, so that scheduled syncs complete quickly without re-processing 104k+ existing sales.

#### Acceptance Criteria

1. WHEN the Sale_Importer is started with no `createdAfter` parameter (first-ever run or Sync_State has null `lastSaleSyncAt`), THE Sale_Importer SHALL fetch all sales from the ConsignCloud_API without a `created:gt` filter
2. WHEN the Sale_Importer is started with a `createdAfter` parameter (from Sync_State `lastSaleSyncAt`), THE Sale_Importer SHALL include the `created:gt` query parameter set to that ISO 8601 timestamp, fetching only sales created after the last successful sync
3. WHEN processing fetched sales, THE Sale_Importer SHALL check each sale's ConsignCloud UUID against existing `sourceId` values in the Shop_Table and skip sales that already exist (deduplication safety net)
4. WHEN a sale already exists in the Shop_Table (matched by `sourceId`), THE Sale_Importer SHALL skip it without error and increment the skipped count
5. THE Sale_Importer SHALL NOT update existing sales — only new sales are created during import

### Requirement 2: Scheduled Orchestration Integration

**User Story:** As a shop operator, I want the sale import to run automatically after items complete in the scheduled sync, so that item references are available when sales referencing them are imported.

#### Acceptance Criteria

1. WHEN the Sync_Orchestrator executes the sales phase, THE Sync_Orchestrator SHALL first verify that the items phase has been started successfully in the current Sync_Run before starting the sales phase
2. IF the items phase fails to start (Step Function start error), THEN THE Sync_Orchestrator SHALL still attempt the sales phase (sales don't strictly depend on item import completing, only on items being present from previous syncs)
3. WHEN starting the sales phase, THE Sync_Orchestrator SHALL create a sale import job and start a Step_Functions_State_Machine execution with the `createdAfter` parameter set to the `lastSaleSyncAt` value from Sync_State (or omitted if null)
4. WHEN the Step_Functions_State_Machine StartExecution API returns successfully for the sale import, THE Sync_Orchestrator SHALL update the Sync_State `lastSaleSyncAt` field with the pre-captured sync timestamp
5. THE Sync_Orchestrator SHALL check for an existing running or paused sale import job before starting a new one, and skip the sales phase if one already exists
6. THE sales phase SHALL be asynchronous — the Sync_Orchestrator does not wait for the Step Functions execution to complete

### Requirement 3: Import All Sale Statuses

**User Story:** As a shop operator, I want all sales imported regardless of status, so that the shop has a complete view of sale lifecycle including voided and open sales.

#### Acceptance Criteria

1. THE Sale_Importer SHALL import sales with any status: `open`, `finalized`, `voided`
2. THE Sale_Importer SHALL NOT filter out non-finalized sales during the fetch or sync phases
3. THE Sale_Importer SHALL store the CC status value directly as the sale's `status` field
4. WHEN a sale has a `parked` timestamp (non-null), THE Sale_Importer SHALL store it as the `parkedAt` field on the sale record

### Requirement 4: Expanded Sale Field Mapping

**User Story:** As a shop operator, I want all relevant sale data from ConsignCloud synced to the shop, so that sale records are complete for reporting and operations.

#### Acceptance Criteria

1. THE Sale_Mapper SHALL map the following ConsignCloud sale fields to Shop_Table fields:
   - `id` -> `sourceId` (ConsignCloud UUID, deduplication key)
   - `number` -> `number` (parsed to integer, CC's sale number used directly)
   - `status` -> `status` (string: open, finalized, voided)
   - `subtotal` -> `subtotal` (cents, stored as-is)
   - `total` -> `total` (cents, stored as-is)
   - `store_portion` -> `storePortion` (cents)
   - `cogs` -> `cogs` (cents — cost of goods sold, what the shop owes)
   - `change` -> `change` (cents)
   - `memo` -> `memo` (string or null)
   - `cashier.id` -> `cashierId` (resolved to shop Employee UUID)
   - `refunded_amount` -> `refundedAmount` (cents)
   - `cash_rounding_adjustment` -> `cashRoundingAdjustment` (cents)
   - `line_item_count` -> `lineItemCount` (number)
   - `created` -> `createdAt` (ISO 8601 UTC)
   - `finalized` -> `finalizedAt` (ISO 8601 or null)
   - `voided` -> `voidedAt` (ISO 8601 or null)
   - `parked` -> `parkedAt` (ISO 8601 or null)

2. THE Sale_Mapper SHALL NOT map or store: customer, notes, gift_cards, register, register_report, pending_swipe, discounts (ID array), surcharges (ID array), taxes (ID array), total_tendered, amounts_tendered, consignor_portion (replaced by cogs)

3. WHEN the ConsignCloud `cogs` field equals the `consignor_portion` field (as expected for consignment items), THE Sale_Importer SHALL store the value as `cogs` only — `consignorPortion` is removed from the sale-level schema

### Requirement 5: Expanded Line Item Field Mapping

**User Story:** As a shop operator, I want line item data to include tax information, split details, and item snapshots, so that sale receipts and auditing are fully supported.

#### Acceptance Criteria

1. THE Sale_Mapper SHALL map the following ConsignCloud line item fields to Shop_Table Sale_Line_Item fields:
   - `id` -> `sourceId` (CC line item UUID)
   - `item.id` -> `itemId` (resolved to shop Item UUID via sourceId lookup)
   - `item.sku` -> `itemSku` (string, CC's item SKU — vital for receipt/lookup)
   - `item.title` -> `itemTitle` (string, snapshot of item title at time of sale)
   - `unit_price` -> `salePrice` (cents)
   - `consignor_portion` -> `consignorPortion` (cents, per-line consignor amount)
   - `store_portion` -> `storePortion` (cents)
   - `split` -> `split` (decimal 0-1, consignor split at time of sale)
   - `quantity` -> `quantity`
   - `days_on_shelf` -> `daysOnShelf`
   - `taxed_price` -> `taxedPrice` (cents, price inclusive of tax)
   - `tax_exempt` -> `taxExempt` (boolean)
   - `refunded_quantity` -> `refundedQuantity` (number, units refunded)
   - `applied_taxes` -> `totalTax` (number, sum of all `applied_taxes[].amount`)
   - `applied_discounts` -> `discount` (number, sum of all `applied_discounts[].amount`)
   - `created` -> `createdAt` (ISO 8601 UTC)

2. THE Sale_Mapper SHALL NOT map or store on line items: cost, split_price (derived), sale (redundant), discounts/surcharges/taxes ID arrays, full applied_discounts/applied_surcharges/applied_taxes objects (only totals stored)

3. WHEN the item referenced by a line item cannot be resolved (no matching `sourceId` in Shop_Table), THE Sale_Importer SHALL still import the line item with `itemId` set to null but `itemSku` and `itemTitle` populated from the CC response

### Requirement 6: Sale Number Handling

**User Story:** As a shop operator, I want the ConsignCloud sale number used directly as the sale identifier in the shop, so that printed receipts remain valid and operators can look up sales by their existing number.

#### Acceptance Criteria

1. WHEN importing a sale from ConsignCloud, THE Sale_Importer SHALL use the ConsignCloud `number` field (parsed to integer) as the sale's `number` in the Shop_Table
2. THE Sale_Importer SHALL NOT generate a new sequential sale number from the sale sequence counter for imported sales
3. AFTER the first full import completes, THE Sale_Importer SHALL update the sale sequence counter (`SEQUENCE#SALE` / `COUNTER`) to the maximum sale number encountered during the import, so that future locally-created sales receive numbers that do not collide with imported ones
4. IF a ConsignCloud sale has no `number` field (null or missing), THE Sale_Importer SHALL generate a sequential number from the counter as a fallback
5. THE ConsignCloud `number` value SHALL be queryable via the existing GSI1 index pattern (`GSI1PK: SALES`, `GSI1SK: SALE#<number>`)

### Requirement 7: Employee (Cashier) Resolution

**User Story:** As a shop operator, I want cashiers resolved or created during sale import, so that all sales link to employee records.

#### Acceptance Criteria

1. WHEN a sale has a `cashier` object with `id` and `name`, THE Sale_Importer SHALL resolve it to a shop Employee UUID by querying the `sourceId-index` GSI
2. IF the cashier does not exist in the Shop_Table, THE Sale_Importer SHALL create a new Employee record with: UUID (generated), `name` from CC, `sourceId` from CC cashier id, `GSI2PK: EMPLOYEES`, `GSI2SK: EMPLOYEE#<uuid>`, timestamps
3. THE Employee creation SHALL use a conditional write (`attribute_not_exists(PK)`) to prevent duplicates from concurrent imports
4. IF the conditional write fails (employee already exists from concurrent creation), THE Sale_Importer SHALL re-query to get the existing UUID
5. WHEN a sale has no cashier (null), THE Sale_Importer SHALL set `cashierId` to null on the sale record

### Requirement 8: ConsignCloud API Query Parameters

**User Story:** As a developer, I want the import to request all relevant fields from ConsignCloud, so that no data is lost in transit.

#### Acceptance Criteria

1. WHEN fetching sales from the ConsignCloud_API, THE Sale_Importer SHALL include the `include` parameter with values: cashier, memo, status, consignor_portion, store_portion, refunded_amount, line_item_count, notes, cogs, register, gift_cards, customer, customer.email_notifications_enabled, customer.tax_exempt, customer.address_line_1, customer.address_line_2, customer.city, customer.state, customer.postal_code, customer.tags, register_report, pending_swipe
2. WHEN fetching sales from the ConsignCloud_API, THE Sale_Importer SHALL include the `expand` parameter with values: cashier, customer, register, pending_swipe
3. THE Sale_Importer SHALL NOT include `total_tendered` or `amounts_tendered` in the `include` parameter as these cause ConsignCloud API internal server errors
4. THE `include` and `expand` parameters SHALL request all available fields from ConsignCloud even if some are not mapped to the Shop_Table, to ensure the API returns complete data for fields that are mapped

### Requirement 9: Error Handling

**User Story:** As a shop operator, I want import errors to be handled gracefully, so that one bad sale does not stop the entire import.

#### Acceptance Criteria

1. IF an individual sale fails to map (validation error), THE Sale_Importer SHALL log a WARN, increment the failed count, and continue processing remaining sales
2. IF an individual sale fails to write to DynamoDB, THE Sale_Importer SHALL log a WARN, increment the failed count, and continue processing remaining sales
3. IF line item fetching fails for a sale during the fetch phase, THE Sale_Importer SHALL log a WARN, store the sale with an empty line_items array, and continue (line items will be missing but the sale header is preserved)
4. IF item resolution fails for a line item, THE Sale_Importer SHALL store the line item with `itemId` null but preserve `itemSku` and `itemTitle`
5. THE Import_Report SHALL include failed sales with their CC UUID and error reason (max 100 failures, truncated flag if more)
6. THE existing checkpoint, rate limiting, and Step Functions loop error handling SHALL continue to apply unchanged

### Requirement 10: Data Model Updates

**User Story:** As a developer, I want the sale and line item data models documented and updated to reflect all synced fields.

#### Acceptance Criteria

1. THE Sale entity in the data model SHALL include the following changes:
   - Remove: `consignorPortion` (replaced by `cogs` at sale level)
   - Add: `cogs` (number, cents — cost of goods sold)
   - Add: `refundedAmount` (number, cents — total refunded, tech debt for future Refund entity)
   - Add: `cashRoundingAdjustment` (number, cents)
   - Add: `lineItemCount` (number)
   - Add: `parkedAt` (string, optional, ISO 8601)
   - Change: `status` from "open | finalized | voided" to include all CC values
   - Change: `number` note to indicate it comes from CC directly (not generated)
   - Add: `sourceId` (already exists but document it)

2. THE Sale_Line_Item entity in the data model SHALL include the following additions:
   - Add: `sourceId` (string, CC line item UUID)
   - Add: `itemSku` (string, CC item SKU at time of sale)
   - Add: `itemTitle` (string, item title snapshot at time of sale)
   - Add: `split` (number, decimal 0-1, consignor split at time of sale)
   - Add: `taxedPrice` (number, cents, price inclusive of tax)
   - Add: `taxExempt` (boolean)
   - Add: `refundedQuantity` (number, tech debt for future Refund entity)
   - Add: `totalTax` (number, cents, sum of applied taxes)
   - Add: `createdAt` (string, ISO 8601)

3. THE data model document SHALL note that `refundedAmount` and `refundedQuantity` are informational snapshots from ConsignCloud, and that a proper Refund entity with its own lifecycle should be modelled in a future spec
