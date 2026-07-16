# Requirements Document

## Introduction

This feature replaces the current batch-scan sync phases (item-sync-orchestrator, sale-sync-orchestrator, sync-to-shop-table) with a reactive, DynamoDB Streams-based mechanism. When records are inserted or modified in the import table, a Lambda function is triggered to map them from ConsignCloud format to shop table format and upsert them. This eliminates the polling/scanning approach and provides near-real-time sync for accounts, items, and sales.

## Glossary

- **Import_Table**: The DynamoDB table (`thymos-{environment}-import`) where raw ConsignCloud data is staged during fetch operations
- **Shop_Table**: The DynamoDB table (`thymos-{environment}-shop`) that serves as the application's primary data store
- **Stream_Lambda**: The AWS Lambda function triggered by DynamoDB Streams events from the Import_Table
- **Entity_Mapper**: A module responsible for transforming a single import record from ConsignCloud snake_case format to Shop_Table camelCase format for a specific entity type (account, item, or sale)
- **Source_ID**: The ConsignCloud UUID stored on shop records for deduplication and traceability, queryable via the `sourceId-index` GSI
- **Import_Record**: A DynamoDB record in the Import_Table with PK pattern `IMPORT#CONSIGNCLOUD#<TYPE>#<id>` and SK `METADATA`
- **Sync_Timestamp**: An ISO 8601 UTC timestamp (`syncedAt`) written to the import record after successful sync to the Shop_Table

## Requirements

### Requirement 1: DynamoDB Streams Configuration

**User Story:** As a platform operator, I want DynamoDB Streams enabled on the import table, so that record changes trigger reactive processing without polling.

#### Acceptance Criteria

1. THE Import_Table SHALL have DynamoDB Streams enabled with `NEW_IMAGE` stream view type
2. WHEN a stream event occurs, THE Stream_Lambda SHALL be invoked with the new image of the record
3. THE Stream_Lambda SHALL be configured with an event source mapping that filters to records where PK begins with `IMPORT#CONSIGNCLOUD#`

### Requirement 2: Stream Event Filtering

**User Story:** As a platform operator, I want the stream processor to only handle relevant import records, so that unrelated table writes do not trigger unnecessary Lambda invocations.

#### Acceptance Criteria

1. THE Stream_Lambda event source mapping SHALL use a filter pattern to process only INSERT and MODIFY event types
2. THE Stream_Lambda SHALL ignore records where PK does not begin with `IMPORT#CONSIGNCLOUD#`
3. THE Stream_Lambda SHALL ignore records that already have a `syncedAt` attribute present in the new image

### Requirement 3: Entity Type Routing

**User Story:** As a developer, I want the stream handler to route records to the correct mapper based on entity type, so that each record type is processed with its specific transformation logic.

#### Acceptance Criteria

1. WHEN a record has PK matching `IMPORT#CONSIGNCLOUD#ACCOUNT#<id>`, THE Stream_Lambda SHALL route the record to the Account_Entity_Mapper
2. WHEN a record has PK matching `IMPORT#CONSIGNCLOUD#ITEM#<id>`, THE Stream_Lambda SHALL route the record to the Item_Entity_Mapper
3. WHEN a record has PK matching `IMPORT#CONSIGNCLOUD#SALE#<id>`, THE Stream_Lambda SHALL route the record to the Sale_Entity_Mapper
4. WHEN a record has an unrecognised entity type in the PK, THE Stream_Lambda SHALL log a warning and skip the record without error

### Requirement 4: Account Sync

**User Story:** As a platform operator, I want account records reactively synced to the shop table, so that consignor data is available immediately after import.

#### Acceptance Criteria

1. WHEN an account import record is received, THE Account_Entity_Mapper SHALL transform ConsignCloud snake_case fields to Shop_Table camelCase fields following the established field-mapper pattern
2. WHEN a record with the same Source_ID already exists in the Shop_Table, THE Stream_Lambda SHALL update the existing record with changed fields
3. WHEN no record with the same Source_ID exists in the Shop_Table, THE Stream_Lambda SHALL create a new account record with a generated UUID, shopUid from the sequence counter, and appropriate GSI keys
4. THE Account_Entity_Mapper SHALL produce the same output given the same input regardless of how many times the record is processed

### Requirement 5: Item Sync

**User Story:** As a platform operator, I want item records reactively synced to the shop table, so that inventory is available immediately after import.

#### Acceptance Criteria

1. WHEN an item import record is received, THE Item_Entity_Mapper SHALL transform ConsignCloud snake_case fields to Shop_Table camelCase fields following the established item-mapper pattern
2. WHEN a record with the same Source_ID already exists in the Shop_Table, THE Stream_Lambda SHALL update the existing record with changed fields
3. WHEN no record with the same Source_ID exists in the Shop_Table, THE Stream_Lambda SHALL create a new item record with a generated UUID, SKU from the sequence counter, and appropriate GSI keys
4. THE Item_Entity_Mapper SHALL resolve the owning account by ConsignCloud account reference and link items to the corresponding Shop_Table account UUID
5. THE Item_Entity_Mapper SHALL resolve or create Employee and Category records as needed, following the existing create-on-the-fly pattern

### Requirement 6: Sale Sync

**User Story:** As a platform operator, I want sale records reactively synced to the shop table, so that transaction history is available immediately after import.

#### Acceptance Criteria

1. WHEN a sale import record is received, THE Sale_Entity_Mapper SHALL transform ConsignCloud snake_case fields to Shop_Table camelCase fields following the established sale-mapper pattern
2. WHEN a record with the same Source_ID already exists in the Shop_Table, THE Stream_Lambda SHALL skip the record as sales are immutable once written
3. WHEN no record with the same Source_ID exists in the Shop_Table, THE Stream_Lambda SHALL create a new sale record with a generated UUID, sale number from the sequence counter, and appropriate GSI keys
4. THE Sale_Entity_Mapper SHALL only process finalized sales and skip open or voided sales
5. THE Sale_Entity_Mapper SHALL write sale line items as part of the same transactional write as the sale record
6. THE Sale_Entity_Mapper SHALL resolve cashier references to Employee UUIDs and item references in line items to Item UUIDs

### Requirement 7: Sync Timestamp Marking

**User Story:** As a platform operator, I want synced import records marked with a timestamp, so that I can audit which records have been processed and when.

#### Acceptance Criteria

1. WHEN a record is successfully synced to the Shop_Table, THE Stream_Lambda SHALL update the Import_Record with a `syncedAt` attribute containing the current ISO 8601 UTC timestamp
2. THE Stream_Lambda SHALL NOT delete import records after sync, preserving them as an audit trail
3. WHEN the `syncedAt` attribute update fails, THE Stream_Lambda SHALL log the failure but not retry the entire sync operation for that record

### Requirement 8: Idempotency

**User Story:** As a platform operator, I want the sync process to be idempotent, so that reprocessing the same stream event produces the same result without duplicating data.

#### Acceptance Criteria

1. THE Stream_Lambda SHALL use the Source_ID and `sourceId-index` GSI to detect whether a record has already been synced before creating new records
2. WHEN creating new records in the Shop_Table, THE Stream_Lambda SHALL use conditional writes (`attribute_not_exists(PK)`) to prevent duplicate creation from concurrent processing
3. WHEN a conditional write fails due to an existing record, THE Stream_Lambda SHALL treat it as a successful no-op and proceed to mark the import record with `syncedAt`

### Requirement 9: Error Handling

**User Story:** As a platform operator, I want stream processing failures to be isolated per record, so that one bad record does not block the processing of other records in the same batch.

#### Acceptance Criteria

1. WHEN a single record fails to sync, THE Stream_Lambda SHALL log the error with the record PK and error details, then continue processing the remaining records in the batch
2. IF a record fails field mapping validation, THEN THE Stream_Lambda SHALL log the validation error and skip the record without retrying
3. IF a transient error occurs during a DynamoDB write operation, THEN THE Stream_Lambda SHALL allow the DynamoDB Streams retry mechanism to reprocess the batch
4. THE Stream_Lambda SHALL configure a dead-letter queue for records that fail after all retry attempts are exhausted

### Requirement 10: Lambda Configuration

**User Story:** As a platform operator, I want the stream Lambda configured with appropriate concurrency and batch settings, so that sync throughput is balanced against downstream resource pressure.

#### Acceptance Criteria

1. THE Stream_Lambda event source mapping SHALL be configured with a batch size appropriate for the expected record volume
2. THE Stream_Lambda event source mapping SHALL use `bisectBatchOnFunctionError` set to true, so that failing batches are split to isolate problematic records
3. THE Stream_Lambda event source mapping SHALL configure a maximum retry attempts limit to prevent infinite retry loops
4. THE Stream_Lambda SHALL have a reserved concurrency setting to prevent overwhelming the Shop_Table with concurrent writes

### Requirement 11: Infrastructure Provisioning

**User Story:** As a developer, I want the stream infrastructure defined in Terraform, so that the DynamoDB Streams trigger, Lambda, and associated resources are provisioned consistently.

#### Acceptance Criteria

1. THE Terraform configuration SHALL define the DynamoDB Streams enablement on the Import_Table within the existing import module
2. THE Terraform configuration SHALL define the Stream_Lambda function, its IAM execution role, and event source mapping
3. THE Terraform configuration SHALL grant the Stream_Lambda read access to the Import_Table stream and read/write access to both the Import_Table and Shop_Table
4. THE Terraform configuration SHALL define a dead-letter queue (SQS) for failed stream records
5. THE Terraform configuration SHALL output the Stream_Lambda function name and ARN for observability purposes
