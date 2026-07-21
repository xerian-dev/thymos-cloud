# Requirements Document

## Introduction

This feature aligns the stream Lambda's item processing pipeline with the import item-mapper's full field set and status derivation logic, expands the upsert-service to write GSI2/GSI3 keys and all new item fields, implements CC SKU passthrough with sequence counter seeding, adds graceful account resolution (skip on missing), and removes the now-redundant sync phase from the item import Step Function flow.

## Glossary

- **Stream_Lambda**: The Lambda function triggered by DynamoDB Streams on the import table, responsible for processing new/modified import records and upserting them into the shop table.
- **Stream_Item_Mapper**: The module (`src/stream/item-mapper.ts`) that transforms raw unmarshalled DynamoDB attributes (`Record<string, unknown>`) into a structured `MappedItem` object for the stream Lambda.
- **Upsert_Service**: The module (`src/stream/upsert-service.ts`) containing `upsertItem()` that writes or updates item records in the shop DynamoDB table.
- **Sequence_Service**: The module (`src/stream/sequence-service.ts`) that atomically increments and returns the next sequence number for a given entity type using DynamoDB ADD operations.
- **Item_Import_Handler**: The Lambda handler module (`src/import/item-import-handler.ts`) that orchestrates item import start, sync, resume, and status operations.
- **Item_Sync_Orchestrator**: The module (`src/import/item-sync-orchestrator.ts`) that scans the import table and syncs items to the shop table in batch during the sync phase.
- **Step_Function**: The AWS Step Functions state machine that loops the import Lambda for paginated fetch processing.
- **Shop_Table**: The main DynamoDB table (`thymos-{env}-shop`) holding all shop entities (accounts, items, sales, employees, categories).
- **Import_Table**: The DynamoDB table (`thymos-{env}-import`) where raw ConsignCloud records are staged before processing.
- **Source_ID_Lookup**: The module (`src/stream/source-id-lookup.ts`) providing `findBySourceId()` to query the `sourceId-index` GSI on the shop table.
- **ItemStatus**: A derived status value computed from the ConsignCloud status breakdown object, one of: active, parked, inactive, expired, to_be_returned, sold, returned_to_owner, donated, lost, stolen, damaged.
- **CC_SKU**: The raw SKU string from ConsignCloud, which may be numeric (used directly) or non-numeric (fallback to sequence counter).
- **GSI2**: Global Secondary Index for querying items by owning account (`GSI2PK: ACCOUNT#<uuid>`, `GSI2SK: ITEM#<createdAt>`).
- **GSI3**: Global Secondary Index for querying items by category (`GSI3PK: CATEGORY#<uuid>`, `GSI3SK: ITEM#<createdAt>`).

## Requirements

### Requirement 1: Stream Item Mapper Field Parity

**User Story:** As a developer, I want the stream item mapper to produce the same fields and derivations as the import item-mapper, so that items processed via the stream path have full data fidelity.

#### Acceptance Criteria

1. THE Stream_Item_Mapper SHALL include an `ItemStatus` type with the values: active, parked, inactive, expired, to_be_returned, sold, returned_to_owner, donated, lost, stolen, damaged.
2. THE Stream_Item_Mapper SHALL export a `deriveItemStatus` function that accepts a `Record<string, number>` status breakdown object and returns the highest-priority `ItemStatus` with a non-zero count.
3. THE Stream_Item_Mapper SHALL export a `STATUS_PRIORITY` array defining priority order from active (highest) to damaged (lowest).
4. THE Stream_Item_Mapper SHALL export a `SOLD_VARIANTS` set containing "sold", "sold_on_shopify", "sold_on_square", "sold_on_third_party" and collapse all variants into "sold" during status derivation.
5. WHEN `deriveItemStatus` receives a null, undefined, or empty status object, THE Stream_Item_Mapper SHALL return "active" as the default status.
6. THE Stream_Item_Mapper SHALL include a `status` field of type `ItemStatus` in the `MappedItem` interface, derived from `raw.status` via `deriveItemStatus`.
7. THE Stream_Item_Mapper SHALL include a `location` field (string, optional) in `MappedItem`, extracted from `raw.location.name` when present.
8. THE Stream_Item_Mapper SHALL include a `details` field (string, optional, max 5000 chars) in `MappedItem`, extracted from `raw.details`.
9. THE Stream_Item_Mapper SHALL include a `scheduleStart` field (string, optional) in `MappedItem`, extracted from `raw.schedule_start`.
10. THE Stream_Item_Mapper SHALL include an `expirationDate` field (string, optional) in `MappedItem`, extracted from `raw.expires`.
11. THE Stream_Item_Mapper SHALL include a `lastSold` field (string, optional) in `MappedItem`, extracted from `raw.last_sold`.
12. THE Stream_Item_Mapper SHALL include a `lastViewed` field (string, optional) in `MappedItem`, extracted from `raw.last_viewed`.
13. THE Stream_Item_Mapper SHALL include a `labelPrintedAt` field (string, optional) in `MappedItem`, extracted from `raw.printed`.
14. THE Stream_Item_Mapper SHALL include a `daysOnShelf` field (number, optional) in `MappedItem`, extracted from `raw.days_on_shelf`.
15. THE Stream_Item_Mapper SHALL include a `deleted` field (string, optional) in `MappedItem`, extracted from `raw.deleted`.
16. THE Stream_Item_Mapper SHALL operate on `Record<string, unknown>` input (raw unmarshalled DynamoDB attributes), applying type guards for each field extraction.

### Requirement 2: Upsert Service GSI and Field Expansion

**User Story:** As a developer, I want the stream upsert-service to write GSI2/GSI3 keys and all new item fields, so that items are queryable by account and category and contain complete data.

#### Acceptance Criteria

1. WHEN an account is resolved during item creation, THE Upsert_Service SHALL write `GSI2PK` as `ACCOUNT#<accountUuid>` and `GSI2SK` as `ITEM#<createdAt>` on the item record.
2. WHEN a category is resolved during item creation, THE Upsert_Service SHALL write `GSI3PK` as `CATEGORY#<categoryUuid>` and `GSI3SK` as `ITEM#<createdAt>` on the item record.
3. THE Upsert_Service SHALL write the `status` field (derived ItemStatus) on both new and updated item records.
4. THE Upsert_Service SHALL write all new optional fields (location, details, scheduleStart, expirationDate, lastSold, lastViewed, labelPrintedAt, daysOnShelf, deleted) on both new and updated item records when present in the mapped data.
5. THE Upsert_Service SHALL write `sourceSku` (the raw CC SKU string) on new item records when `raw.sku` is present.
6. WHEN updating an existing item and an account is resolved, THE Upsert_Service SHALL update `GSI2PK` and `GSI2SK` on the item record.
7. WHEN updating an existing item and a category is resolved, THE Upsert_Service SHALL update `GSI3PK` and `GSI3SK` on the item record.

### Requirement 3: CC SKU Passthrough and Sequence Counter Seeding

**User Story:** As a developer, I want the stream upsert-service to use the ConsignCloud SKU directly when numeric, so that imported items retain their original SKU numbering and the sequence counter stays synchronized.

#### Acceptance Criteria

1. WHEN `raw.sku` parses to a positive integer, THE Upsert_Service SHALL use that integer as the item's `sku` value instead of calling the Sequence_Service.
2. WHEN `raw.sku` is absent, empty, or non-numeric, THE Upsert_Service SHALL call `getNextSequenceNumber("ITEM")` from the Sequence_Service to generate a new SKU.
3. WHEN a CC SKU is used directly and exceeds the current ITEM sequence counter value, THE Upsert_Service SHALL seed the sequence counter to that SKU value using a conditional update (`attribute_not_exists(#val) OR #val < :newVal`).
4. THE Upsert_Service SHALL format the `GSI1SK` value as `ITEM#<sku padded to 7 digits>` regardless of whether the SKU came from CC or from the sequence counter.

### Requirement 4: Account Resolution with Graceful Skip

**User Story:** As a developer, I want the stream upsert-service to skip items when their owning account has not yet been synced, so that transient ordering issues do not cause permanent failures.

#### Acceptance Criteria

1. THE Upsert_Service SHALL resolve the owning account by extracting the source ID from `raw.account.id` or `raw.account_id` (whichever is present) and querying the Source_ID_Lookup.
2. WHEN the account source ID is present but no matching account record exists in the Shop_Table, THE Upsert_Service SHALL log a warning with the item source ID and account source ID.
3. WHEN the account source ID is present but no matching account record exists in the Shop_Table, THE Upsert_Service SHALL skip the item without adding it to `batchItemFailures` (allowing the stream record to be retried on a subsequent trigger or via the retrigger script).
4. WHEN no account source ID is present in the raw record, THE Upsert_Service SHALL proceed with item creation without an `accountId` or GSI2 keys.

### Requirement 5: Remove Item Sync Phase from Import Flow

**User Story:** As a developer, I want to remove the sync phase from the item import flow, so that all item syncing happens exclusively through the DynamoDB stream pipeline.

#### Acceptance Criteria

1. THE Item_Import_Handler SHALL remove the `handleItemImportSync` function and its associated route handling logic.
2. THE Item_Import_Handler SHALL remove the `runSyncPhase` function.
3. THE Item_Import_Handler SHALL remove the sync branch from `handleResumeInternal` (the `else` branch for `phase === "sync"`).
4. THE Item_Import_Handler SHALL remove the import of `runSyncLoop` from `item-sync-orchestrator`.
5. THE `item-sync-orchestrator.ts` file SHALL be deleted from the codebase.
6. THE Terraform configuration SHALL remove the API Gateway route for `POST /api/import/items/sync`.
7. THE Step_Function state machine definition SHALL remain unchanged (it continues to handle the fetch loop).

### Requirement 6: Direct Completion After Fetch Phase

**User Story:** As a developer, I want the import job to transition directly to "complete" when fetch finishes, so that there is no dependency on a separate sync phase.

#### Acceptance Criteria

1. WHEN the fetch loop exhausts all pages and no more records remain to fetch, THE Item_Import_Handler SHALL transition the job state to "complete".
2. WHEN the fetch phase completes successfully, THE Step_Function SHALL receive a "complete" status (not "continue") causing it to reach the Done (Succeed) state.
3. THE Item_Import_Handler SHALL write an import report upon fetch completion, recording the progress counts (processed, imported, skipped, failed).
