# Requirements Document

## Introduction

This feature reworks the existing item import to operate as an incremental scheduled sync (matching the account import pattern), updates the item data model with additional fields from ConsignCloud, adds DynamoDB GSIs to support querying items by account and by category (both sorted by creation date), and enables the items phase in the existing sync orchestrator with a dependency on accounts completing first.

The existing item import infrastructure (Step Functions loop, checkpoint management, page-by-page processing, rate limiter) is reused. The changes focus on: removing the timestamp filter for the initial full import, adding incremental behaviour for subsequent runs, expanding the field mapping, updating the DynamoDB schema, and wiring the items phase into the scheduled orchestrator.

## Glossary

- **Item_Importer**: The existing item import handler within the Import Lambda that fetches items page-by-page from ConsignCloud and writes them to the Shop_Table
- **Sync_Orchestrator**: The handler within the Import Lambda that coordinates scheduled sync phases (accounts -> items -> sales)
- **Shop_Table**: The existing DynamoDB table (`thymos-{environment}-shop`) storing production entity data
- **Import_Table**: The existing DynamoDB table (`thymos-{environment}-import`) used for job state, checkpoints, and sync state
- **ConsignCloud_API**: The external REST API at `https://api.consigncloud.com/api/v1` providing item data
- **Step_Functions_State_Machine**: The existing AWS Step Functions state machine that orchestrates long-running import operations via Lambda re-invocation
- **Sync_State**: The record in Import_Table tracking last successful sync timestamps per import type
- **Source_ID**: The `sourceId` attribute storing the ConsignCloud UUID for deduplication
- **Source_SKU**: The ConsignCloud `sku` field (e.g. `"313475"`) — the natural operator-facing identifier printed on labels, equivalent to account number
- **Item_Status**: A derived single string representing the item's lifecycle state, computed from the ConsignCloud status breakdown object

## Requirements

### Requirement 1: Incremental Import Behaviour

**User Story:** As a shop operator, I want the item import to fetch only new items on subsequent runs, so that scheduled syncs complete quickly without re-processing 365k+ existing items.

#### Acceptance Criteria

1. WHEN the Item_Importer is started with no `createdAfter` parameter (first-ever run or Sync_State has null `lastItemSyncAt`), THE Item_Importer SHALL fetch all items from the ConsignCloud_API without a `created:gt` filter
2. WHEN the Item_Importer is started with a `createdAfter` parameter (from Sync_State `lastItemSyncAt`), THE Item_Importer SHALL include the `created:gt` query parameter set to that ISO 8601 timestamp, fetching only items created after the last successful sync
3. WHEN processing fetched items, THE Item_Importer SHALL check each item's ConsignCloud UUID against existing `sourceId` values in the Shop_Table and skip items that already exist (deduplication safety net)
4. WHEN an item already exists in the Shop_Table (matched by `sourceId`), THE Item_Importer SHALL skip it without error and increment the skipped count
5. THE Item_Importer SHALL NOT update existing items — only new items are created during import

### Requirement 2: Scheduled Orchestration Integration

**User Story:** As a shop operator, I want the item import to run automatically after accounts complete in the scheduled sync, so that newly created accounts are available when items referencing them are imported.

#### Acceptance Criteria

1. WHEN the Sync_Orchestrator executes the items phase, THE Sync_Orchestrator SHALL first verify that the accounts phase has completed successfully in the current Sync_Run before starting the items phase
2. IF the accounts phase fails or is skipped due to error, THEN THE Sync_Orchestrator SHALL skip the items phase and log the reason
3. WHEN starting the items phase, THE Sync_Orchestrator SHALL create an item import job and start a Step_Functions_State_Machine execution with the `createdAfter` parameter set to the `lastItemSyncAt` value from Sync_State (or omitted if null)
4. WHEN the Step_Functions_State_Machine StartExecution API returns successfully for the item import, THE Sync_Orchestrator SHALL update the Sync_State `lastItemSyncAt` field with the pre-captured sync timestamp
5. THE Sync_Orchestrator SHALL check for an existing running or paused item import job before starting a new one, and skip the items phase if one already exists
6. THE items phase SHALL be asynchronous — the Sync_Orchestrator does not wait for the Step Functions execution to complete

### Requirement 3: Expanded Field Mapping

**User Story:** As a shop operator, I want all relevant item data from ConsignCloud synced to the shop, so that item records are complete and usable for operations, reporting, and filtering.

#### Acceptance Criteria

1. THE Item_Mapper SHALL map the following ConsignCloud fields to Shop_Table fields:
   - `id` -> `sourceId` (ConsignCloud UUID, deduplication key)
   - `title` -> `title` (max 200 chars, truncated)
   - `tag_price` -> `tagPrice` (cents to CHF, divide by 100)
   - `quantity` -> `quantity` (allow 0 for sold items)
   - `split` -> `split` (decimal 0.0-1.0 to percentage 0-100)
   - `inventory_type` -> `inventoryType` (enum mapping)
   - `terms` -> `terms` (enum mapping)
   - `tax_exempt` -> `taxExempt` (boolean)
   - `description` -> `description` (max 2000 chars)
   - `brand` -> `brand`
   - `color` -> `color`
   - `size` -> `size`
   - `tags` -> `tags` (string array, max 20)
   - `images` -> `imageKeys` (URL array)
   - `shelf.name` -> `shelf`
   - `location.name` -> `location`
   - `details` -> `details` (max 5000 chars)
   - `sku` -> `sku` (parsed to number, CC's natural identifier)
   - `schedule_start` -> `scheduleStart` (ISO 8601 date)
   - `expires` -> `expirationDate` (ISO 8601 or null)
   - `status` -> `status` (derived single string, see Requirement 4)
   - `last_sold` -> `lastSold` (ISO 8601 or null)
   - `last_viewed` -> `lastViewed` (ISO 8601 or null)
   - `printed` -> `labelPrintedAt` (ISO 8601 or null)
   - `days_on_shelf` -> `daysOnShelf` (number or null)
   - `deleted` -> `deleted` (ISO 8601 if soft-deleted, null otherwise)
   - `created` -> `createdAt` (ISO 8601 UTC)
   - `account.id` -> `accountId` (resolved to shop Account UUID via sourceId lookup)
   - `category.id` -> `categoryId` (resolved to shop Category UUID via sourceId lookup)
   - `category.name` -> `category` (string, kept for display convenience)
   - `created_by.id` -> `createdBy` (resolved to shop Employee UUID via sourceId lookup)

2. THE Item_Mapper SHALL NOT map or store: weight, weight_unit, custom_fields, custom_fields_map, batches, surcharges, historic_consignor_portions, historic_sale_prices, historic_store_portions, list_on_shopify, list_on_square, shopify_product_id, square_item_id, square_variation_id, cost_per, split_price

3. WHEN the ConsignCloud `sku` field is present, THE Item_Importer SHALL use it directly as the item's `sku` number (parsed to integer) rather than generating a new sequential SKU from the counter

4. WHEN a ConsignCloud item has a `deleted` timestamp (non-null), THE Item_Importer SHALL still import the item with the `deleted` field populated (soft-deleted items are imported, not skipped)

5. WHEN the account referenced by a ConsignCloud item cannot be resolved (no matching `sourceId` in Shop_Table), THE Item_Importer SHALL record the item as failed with an error message and continue processing

6. WHEN the category referenced by a ConsignCloud item cannot be resolved (no matching `sourceId` in Shop_Table), THE Item_Importer SHALL still import the item with `categoryId` set to null and `category` set to the category name string

7. WHEN the employee (created_by) referenced by a ConsignCloud item cannot be resolved, THE Item_Importer SHALL still import the item with `createdBy` set to null

### Requirement 4: Item Status Derivation

**User Story:** As a shop operator, I want each item to have a single status value derived from ConsignCloud's status breakdown, so that I can filter and report on item lifecycle state.

#### Acceptance Criteria

1. THE Item_Mapper SHALL derive a single `status` string from the ConsignCloud `status` object (which maps status names to unit counts) using the following priority (highest priority wins when multiple statuses have non-zero counts):
   - Priority 1: `active`
   - Priority 2: `parked`
   - Priority 3: `inactive`
   - Priority 4: `expired`
   - Priority 5: `to_be_returned`
   - Priority 6: `sold` (includes `sold_on_shopify`, `sold_on_square`, `sold_on_third_party`)
   - Priority 7: `returned_to_owner`
   - Priority 8: `donated`
   - Priority 9: `lost`
   - Priority 10: `stolen`
   - Priority 11: `damaged`

2. WHEN the ConsignCloud status object contains `sold_on_shopify`, `sold_on_square`, or `sold_on_third_party` keys, THE Item_Mapper SHALL treat them as equivalent to `sold` for priority determination

3. IF the ConsignCloud status object is empty or null, THE Item_Mapper SHALL default to `active`

4. THE `status` field SHALL be stored as one of the following string values: `active`, `parked`, `inactive`, `expired`, `to_be_returned`, `sold`, `returned_to_owner`, `donated`, `lost`, `stolen`, `damaged`

### Requirement 5: SKU Handling

**User Story:** As a shop operator, I want the ConsignCloud SKU to be used directly as the item identifier in the shop, so that labels already printed remain valid and operators can look up items by their existing number.

#### Acceptance Criteria

1. WHEN importing an item from ConsignCloud, THE Item_Importer SHALL use the ConsignCloud `sku` field (parsed to integer) as the item's `sku` in the Shop_Table
2. THE Item_Importer SHALL NOT generate a new sequential SKU from the item sequence counter for imported items
3. AFTER the first full import completes, THE Item_Importer SHALL update the item sequence counter (`SEQUENCE#ITEM` / `COUNTER`) to the maximum SKU value encountered during the import, so that future locally-created items receive SKUs that do not collide with imported ones
4. IF a ConsignCloud item has no `sku` field (null or missing), THE Item_Importer SHALL generate a sequential SKU from the counter as a fallback
5. THE ConsignCloud `sku` value SHALL be queryable via the existing GSI1 index pattern (`GSI1PK: ITEMS`, `GSI1SK: ITEM#<sku>`)

### Requirement 6: DynamoDB Access Patterns

**User Story:** As a shop operator, I want to query items by account and by category, sorted by creation date (newest first), so that the UI can display relevant item lists efficiently.

#### Acceptance Criteria

1. THE Shop_Table SHALL support querying all items for a given account, sorted by creation date in descending order (newest first), using a Global Secondary Index
2. THE Shop_Table SHALL support querying all items for a given category, sorted by creation date in descending order (newest first), using a Global Secondary Index
3. WHEN creating an item record in the Shop_Table, THE Item_Importer SHALL populate GSI key attributes for account-based queries: `GSI2PK` set to `ACCOUNT#<accountId>` and `GSI2SK` set to `ITEM#<createdAt>` (ISO 8601 UTC)
4. WHEN creating an item record in the Shop_Table, THE Item_Importer SHALL populate GSI key attributes for category-based queries: `GSI3PK` set to `CATEGORY#<categoryId>` and `GSI3SK` set to `ITEM#<createdAt>` (ISO 8601 UTC)
5. IF an item has no resolved `categoryId` (category lookup failed), THEN the `GSI3PK` and `GSI3SK` attributes SHALL NOT be set for that item (item will not appear in category queries)
6. THE existing GSI1 index (`GSI1PK: ITEMS`, `GSI1SK: ITEM#<sku>`) SHALL continue to support lookup by SKU
7. THE new GSI2 index SHALL use `GSI2PK` as hash key and `GSI2SK` as range key with `ALL` projection
8. A new GSI3 index SHALL be added with `GSI3PK` as hash key and `GSI3SK` as range key with `ALL` projection

### Requirement 7: Data Model Updates

**User Story:** As a developer, I want the item data model documented and updated to reflect all synced fields, so that the system is consistent and maintainable.

#### Acceptance Criteria

1. THE Item entity in the data model SHALL include the following new fields: `location` (string, optional), `sourceSku` (string, optional — CC's raw sku string preserved alongside parsed numeric sku), `scheduleStart` (string, optional, ISO 8601 date), `status` (string, required, one of the 11 enum values), `lastSold` (string, optional, ISO 8601), `lastViewed` (string, optional, ISO 8601), `labelPrintedAt` (string, optional, ISO 8601), `daysOnShelf` (number, optional), `deleted` (string, optional, ISO 8601)
2. THE DynamoDB single-table mapping SHALL be updated to include GSI2 (`GSI2PK: ACCOUNT#<accountId>`, `GSI2SK: ITEM#<createdAt>`) and GSI3 (`GSI3PK: CATEGORY#<categoryId>`, `GSI3SK: ITEM#<createdAt>`) for item records
3. THE Item Status enumeration SHALL be documented with all 11 values and their business meanings
4. THE data model document SHALL note that `sku` for imported items comes directly from ConsignCloud (not generated) and that the sequence counter is seeded to max(imported SKU) after first import

### Requirement 8: ConsignCloud API Query Parameters

**User Story:** As a developer, I want the import to request all relevant fields from ConsignCloud, so that no data is lost in transit.

#### Acceptance Criteria

1. WHEN fetching items from the ConsignCloud_API, THE Item_Importer SHALL include the `include` parameter with values: batches, created_by, days_on_shelf, historic_consignor_portions, historic_sale_prices, historic_store_portions, last_sold, last_viewed, list_on_shopify, list_on_square, location, printed, split_price, surcharges, tags, tax_exempt, images, quantity, weight, weight_unit
2. WHEN fetching items from the ConsignCloud_API, THE Item_Importer SHALL include the `expand` parameter with values: account, category, created_by, surcharges, shelf, batches, images, location
3. THE `include` and `expand` parameters SHALL request all available fields from ConsignCloud even if some are not mapped to the Shop_Table, to ensure the API returns complete data for the fields that are mapped (some fields require explicit inclusion to be present in the response)

### Requirement 9: Infrastructure Changes

**User Story:** As a developer, I want the DynamoDB table updated with the new GSI so that the access patterns are supported.

#### Acceptance Criteria

1. THE Shop_Table Terraform definition SHALL be updated to add `GSI3PK` and `GSI3SK` attribute definitions
2. THE Shop_Table Terraform definition SHALL be updated to add a `GSI3` global secondary index with `GSI3PK` as hash key, `GSI3SK` as range key, and `ALL` projection type
3. THE existing `GSI2` global secondary index (already defined with `GSI2PK`/`GSI2SK`) SHALL be repurposed for the account-based item query pattern if not already in use for another purpose, OR a new GSI shall be added if GSI2 is occupied
4. ALL infrastructure changes SHALL be backwards-compatible — existing data and access patterns must continue to work

### Requirement 10: Error Handling

**User Story:** As a shop operator, I want import errors to be handled gracefully, so that one bad item does not stop the entire import.

#### Acceptance Criteria

1. IF an individual item fails to map (validation error), THE Item_Importer SHALL log a WARN, increment the failed count, and continue processing remaining items
2. IF an individual item fails to write to DynamoDB, THE Item_Importer SHALL log a WARN, increment the failed count, and continue processing remaining items
3. IF account resolution fails for an item, THE Item_Importer SHALL record the failure with the CC item UUID and unresolved CC account ID, and continue
4. THE Import_Report SHALL include failed items with their CC UUID and error reason (max 100 failures, truncated flag if more)
5. THE existing checkpoint, rate limiting, and self-re-invocation error handling SHALL continue to apply unchanged
