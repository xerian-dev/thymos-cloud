# Requirements Document

## Introduction

This feature imports sales from the ConsignCloud API into the shop system's DynamoDB table. It follows the same two-phase pattern established by the item import: Phase 1 (fetch) pages through the ConsignCloud Sales API and stages raw JSON in the Import_Table, while Phase 2 (sync) scans staged sales, transforms/maps fields, resolves references (cashier → Employee, line items → Item), and writes Sale and Sale_Line_Item records to the Shop_Table. Only finalized sales are imported — open and voided sales are filtered out during the fetch phase. The import is CLI-triggered, tracks job state via Step Functions orchestration, and supports checkpoint-based resumability for large datasets.

## Glossary

- **Sale_Importer**: The Lambda function (or chain of invocations via Step Functions) responsible for fetching sales from the ConsignCloud_API, staging them, mapping fields, and writing Sale and Sale_Line_Item records to the Shop_Table
- **Shop_Table**: The existing DynamoDB table (`thymos-{environment}-shop`) storing production entity data (accounts, items, employees, sales)
- **Import_Table**: The existing DynamoDB table (`thymos-{environment}-import`) used to stage raw API data and track import job state and checkpoints
- **ConsignCloud_API**: The external REST API at `https://api.consigncloud.com/api/v1` providing sale data via cursor-based pagination
- **Import_Job**: A record in the Import_Table tracking the state and progress of a sale import operation
- **Checkpoint**: A record in the Import_Table storing the last successfully processed position, enabling resumption after failure or timeout
- **Rate_Limiter**: The existing mechanism that throttles outbound requests to the ConsignCloud_API to stay within the leaky bucket rate limit (100 capacity, 10 requests per second drain)
- **Sale_Mapper**: The component responsible for transforming ConsignCloud sale fields into Shop_Table Sale and Sale_Line_Item fields
- **Import_Report**: A JSON summary produced after sync completion detailing counts of imported, skipped, and failed sales
- **Cursor**: A pagination token returned by the ConsignCloud_API (`next_cursor` field) used to fetch subsequent pages of results
- **Source_ID**: The `sourceId` attribute on Shop_Table Sale records that stores the ConsignCloud sale UUID for deduplication
- **Sale_Line_Item**: A child record stored under the same partition key as the Sale, representing one item sold in the transaction
- **Employee**: An entity in the Shop_Table representing a staff member, resolved from the ConsignCloud `cashier` field via `sourceId` lookup

## Requirements

### Requirement 1: CLI-Triggered Sale Import Execution

**User Story:** As a shop operator, I want to trigger sale imports from the CLI, so that I can run imports on demand without building a UI.

#### Acceptance Criteria

1. WHEN the Sale_Importer receives a start-import request with an optional `createdAfter` date parameter (ISO 8601 format), THE Sale_Importer SHALL create a new Import_Job in `running` state and return the job identifier, job state, and creation timestamp within 5 seconds
2. IF the Sale_Importer receives a start-import request and an Import_Job for sales already exists in `running` state, THEN THE Sale_Importer SHALL reject the request with an error response indicating a job is already running, and return the existing job identifier
3. WHEN the Sale_Importer receives a resume request with a valid job identifier for a job in `failed` or `paused` state, THE Sale_Importer SHALL transition the job to `running` state and resume processing from the last Checkpoint for that job
4. IF the Sale_Importer receives a resume request with a job identifier that does not exist or refers to a job not in `failed` or `paused` state, THEN THE Sale_Importer SHALL reject the request with an error response indicating the reason for rejection
5. WHEN the Sale_Importer receives a status request with a job identifier, THE Sale_Importer SHALL return the current Import_Job state and progress counts including sales processed, sales imported, sales skipped, sales failed, and line items imported
6. THE Sale_Importer SHALL expose import operations (start, sync, status, resume, cancel) via HTTP POST endpoints on the existing import Lambda, callable via the `import-consigncloud.sh sales` CLI commands

### Requirement 2: Two-Phase Import Architecture

**User Story:** As a shop operator, I want the sale import to use the same two-phase approach as the item import, so that I can inspect staged data before syncing to production.

#### Acceptance Criteria

1. WHEN the fetch phase executes, THE Sale_Importer SHALL page through the ConsignCloud Sales API and write each sale response as a raw JSON record to the Import_Table with PK `IMPORT#CONSIGNCLOUD#SALE#<sale-id>` and SK `METADATA`
2. WHEN the fetch phase completes (no more pages), THE Sale_Importer SHALL transition the Import_Job to `paused` state, signalling readiness for the sync phase
3. WHEN the sync phase is triggered with a job identifier, THE Sale_Importer SHALL scan staged sale records from the Import_Table, transform them using the Sale_Mapper, and write Sale and Sale_Line_Item records to the Shop_Table
4. WHEN the sync phase completes (all staged records processed), THE Sale_Importer SHALL transition the Import_Job to `complete` state

### Requirement 3: Paginated Fetch with Status Filtering

**User Story:** As a shop operator, I want only finalized sales fetched from ConsignCloud, so that the import contains only completed transactions useful for historical data.

#### Acceptance Criteria

1. WHEN fetching sales from the ConsignCloud_API, THE Sale_Importer SHALL request pages of up to 100 sales using the `limit` query parameter
2. WHEN fetching sales, THE Sale_Importer SHALL include the `expand` parameter with value `cashier` to retrieve cashier name and identifier inline
3. WHEN a `createdAfter` filter is specified, THE Sale_Importer SHALL include the `created:gt` query parameter with the value formatted as an ISO 8601 date-time string to limit results to sales created after that date
4. WHEN processing fetched sales, THE Sale_Importer SHALL filter out sales where the `status` field is not `finalized`, incrementing the skipped count for each non-finalized sale
5. WHEN a response contains a non-null `next_cursor` value, THE Sale_Importer SHALL use that cursor to fetch the next page of results while preserving all original query parameters
6. WHEN a response contains a null `next_cursor` value, THE Sale_Importer SHALL consider the fetch phase complete for the Import_Job
7. WHEN fetching sales, THE Sale_Importer SHALL authenticate with the ConsignCloud_API using a Bearer token retrieved from AWS SSM Parameter Store at `/{project}/{environment}/consigncloud-api-key`

### Requirement 4: Rate Limiting and Retry

**User Story:** As a shop operator, I want the sale import to respect ConsignCloud's API rate limits, so that requests are not rejected and the import proceeds reliably.

#### Acceptance Criteria

1. WHEN fetching sales, THE Rate_Limiter SHALL ensure outbound requests do not exceed 10 requests per second sustained and 100 requests burst capacity
2. IF the ConsignCloud_API returns an HTTP 429 response with a `Retry-After` header, THEN THE Sale_Importer SHALL wait for the duration specified in the header before retrying the request
3. IF the ConsignCloud_API returns an HTTP 429 response without a `Retry-After` header, THEN THE Sale_Importer SHALL wait using exponential backoff starting at 1 second and doubling on each consecutive 429 response, up to a maximum wait of 60 seconds per attempt
4. IF the ConsignCloud_API returns 5 consecutive HTTP 429 responses for the same request, THEN THE Sale_Importer SHALL save the current Checkpoint and transition the Import_Job to `paused` state
5. IF the ConsignCloud_API returns an HTTP 5xx response, THEN THE Sale_Importer SHALL retry the request up to 3 times with exponential backoff starting at 1 second and doubling each retry (1s, 2s, 4s) before recording the page as failed
6. IF a page fetch fails after all retries are exhausted, THEN THE Sale_Importer SHALL save the current Checkpoint and transition the Import_Job to `paused` state so the job can be resumed later

### Requirement 5: Checkpoint and Resumability

**User Story:** As a shop operator, I want the sale import to save progress after each page, so that a failure does not require restarting from the beginning.

#### Acceptance Criteria

1. WHEN all sales on a fetch page have been staged to the Import_Table, THE Sale_Importer SHALL update the Checkpoint with the current cursor position and cumulative progress counts (total processed, staged, skipped, failed)
2. WHEN all sales in a sync scan page have been processed, THE Sale_Importer SHALL update the sync Checkpoint with the current DynamoDB exclusive start key and cumulative progress counts
3. WHEN a resume request is received for a fetch-phase job, THE Sale_Importer SHALL read the Checkpoint and continue fetching from the stored cursor position with the original query parameters
4. WHEN a resume request is received for a sync-phase job, THE Sale_Importer SHALL read the sync Checkpoint and continue scanning from the stored exclusive start key
5. THE Checkpoint SHALL store: job identifier, current cursor (fetch phase) or exclusive start key (sync phase), cumulative progress counts, and last updated timestamp (ISO 8601 UTC)

### Requirement 6: Sale Mapping and Transformation

**User Story:** As a shop operator, I want ConsignCloud sales mapped to the shop data model correctly, so that sale records are accurate and queryable.

#### Acceptance Criteria

1. WHEN processing a staged sale, THE Sale_Mapper SHALL map ConsignCloud fields to Shop_Table Sale fields: `uuid` from a newly generated v4 UUID, `number` from the ConsignCloud `number` field, `status` as `finalized`, `subtotal` from `subtotal` (stored as-is in cents), `total` from `total` (stored as-is in cents), `storePortion` from `store_portion` (stored as-is in cents), `consignorPortion` from `consignor_portion` (stored as-is in cents), `change` from `change` (stored as-is in cents), `memo` from `memo` (null if not present), `finalizedAt` from the `finalized` timestamp (ISO 8601 UTC), `voidedAt` as null, `sourceId` from the ConsignCloud sale `id`, and `createdAt` from the ConsignCloud `created` timestamp
2. WHEN creating a Sale record in the Shop_Table, THE Sale_Importer SHALL write it with PK `SALE#<uuid>`, SK `METADATA`, GSI1PK `SALES`, and GSI1SK `SALE#<number>`
3. WHEN processing a staged sale, THE Sale_Mapper SHALL resolve the ConsignCloud `cashier.id` to an internal Employee UUID by querying the Shop_Table for an Employee with a matching `sourceId` attribute
4. IF the cashier Employee does not exist in the Shop_Table, THEN THE Sale_Importer SHALL create a new Employee record with a generated UUID, the cashier name from `cashier.name`, and the ConsignCloud cashier ID as `sourceId`
5. WHEN creating a Sale record, THE Sale_Importer SHALL store the resolved Employee UUID as the `cashierId` field on the Sale

### Requirement 7: Sale Line Item Processing

**User Story:** As a shop operator, I want line items from each sale imported alongside the sale, so that I can see which items were sold in each transaction.

#### Acceptance Criteria

1. WHEN processing a staged sale that contains line item data, THE Sale_Importer SHALL create a Sale_Line_Item record for each line item under the same partition key as the parent Sale (PK `SALE#<uuid>`, SK `LINE_ITEM#<index>` where index is zero-padded to 4 digits starting at 0000)
2. WHEN creating a Sale_Line_Item, THE Sale_Mapper SHALL map: `itemId` resolved from the line item's item reference by looking up the Item in Shop_Table by `sourceId`, `salePrice` from the line item price (stored as-is in cents), `discount` from the line item discount (stored as-is in cents), `consignorPortion` from the line item consignor portion (stored as-is in cents), and `storePortion` from the line item store portion (stored as-is in cents)
3. IF a line item references an Item that does not exist in the Shop_Table (no matching `sourceId`), THEN THE Sale_Importer SHALL set `itemId` to null for that Sale_Line_Item and log a warning containing the sale UUID and the unresolved ConsignCloud item identifier
4. THE Sale_Importer SHALL write the Sale record and all its Sale_Line_Item records in the same DynamoDB transaction to ensure atomicity

### Requirement 8: Deduplication

**User Story:** As a shop operator, I want re-running the sync to be safe, so that duplicate sales are not created when processing the same staged data.

#### Acceptance Criteria

1. WHEN processing a staged sale, THE Sale_Importer SHALL check whether a Sale with the same `sourceId` (ConsignCloud sale UUID) already exists in the Shop_Table before creating a new record
2. WHEN a staged sale's ConsignCloud UUID already exists as a `sourceId` in the Shop_Table, THE Sale_Importer SHALL skip the sale as a duplicate and increment the skipped count
3. WHEN creating a new Sale record, THE Sale_Importer SHALL use a DynamoDB conditional expression (`attribute_not_exists(PK)`) so that concurrent processing cannot create duplicate Sale records
4. IF the conditional write fails due to the record already existing, THEN THE Sale_Importer SHALL treat the sale as a duplicate (skip), increment the skipped count, and continue processing the next sale

### Requirement 9: Self-Re-Invocation via Step Functions

**User Story:** As a shop operator, I want the sale import to continue automatically across Lambda timeout boundaries, so that large imports complete without manual intervention.

#### Acceptance Criteria

1. WHEN the Sale_Importer has been running for 270 seconds (30 seconds before the 300-second Lambda timeout) and has completed processing the current page, THE Sale_Importer SHALL save the current Checkpoint and return a `continue` status to the Step Functions orchestrator
2. WHEN the Step Functions orchestrator receives a `continue` status, THE Step Functions orchestrator SHALL re-invoke the Sale_Importer Lambda with the job identifier so processing resumes from the saved Checkpoint
3. WHEN the Step Functions orchestrator receives a `complete` status, THE Step Functions orchestrator SHALL terminate the execution successfully
4. THE Sale_Importer Lambda SHALL have IAM permissions to be invoked by the Step Functions state machine

### Requirement 10: Import Job State Management

**User Story:** As a shop operator, I want to track the state of sale import jobs, so that I can monitor progress and know when the import completes or needs attention.

#### Acceptance Criteria

1. THE Import_Job for sales SHALL have one of the following states: `running`, `paused`, `failed`, `complete`
2. WHEN a new sale import is started, THE Sale_Importer SHALL create an Import_Job record in the Import_Table with PK `SALE_IMPORT#<jobId>` and SK `METADATA`, where jobId is a v4 UUID, state `running`, the start timestamp, the last updated timestamp, and the filter parameters used
3. WHEN the fetch phase completes and no cursor remains, THE Sale_Importer SHALL transition the Import_Job to `paused` state (awaiting sync trigger)
4. WHEN the sync phase completes and all staged sales have been processed, THE Sale_Importer SHALL transition the Import_Job to `complete` state
5. WHEN a non-recoverable error occurs (such as authentication failure or invalid configuration), THE Sale_Importer SHALL transition the Import_Job to `failed` state with an error description of up to 500 characters
6. THE Import_Job record SHALL store: job identifier (v4 UUID), state, phase (`fetch` or `sync`), start timestamp (ISO 8601 UTC), last updated timestamp (ISO 8601 UTC), filter parameters, error description (when in `failed` state), and cumulative progress counts

### Requirement 11: Import Report Generation

**User Story:** As a shop operator, I want a summary report after the sync completes, so that I can verify what was imported and investigate failures.

#### Acceptance Criteria

1. WHEN the Import_Job reaches `complete` state after the sync phase, THE Sale_Importer SHALL produce an Import_Report containing: total sales processed, sales imported, sales skipped (duplicate), sales failed, total line items imported, and elapsed time expressed as whole seconds
2. WHEN sales fail during sync, THE Import_Report SHALL include a list of failed sale entries, each containing the ConsignCloud sale UUID and an error description (maximum 200 characters per description), limited to the first 100 failures in processing order
3. THE Sale_Importer SHALL write the Import_Report to the Import_Table with PK `SALE_IMPORT#REPORT` and SK set to the job identifier
4. WHEN a status request is made for a completed job, THE Sale_Importer SHALL return the Import_Report as the JSON response payload
5. IF more than 100 sales fail during the sync, THEN THE Import_Report SHALL include a `truncated` flag set to true and a `totalFailures` count reflecting the actual number of failed sales

### Requirement 12: Observability

**User Story:** As a system administrator, I want visibility into sale import operations, so that I can monitor progress and troubleshoot issues.

#### Acceptance Criteria

1. WHEN the Sale_Importer begins processing (fetch or sync phase), THE Sale_Importer SHALL log a structured JSON entry at INFO level containing the job identifier, phase name, filter parameters, and whether this is a new job or a resumption
2. WHEN each page is processed (fetch page or sync scan page), THE Sale_Importer SHALL log a structured JSON entry at INFO level containing the job identifier, phase name, page number or scan segment, count of records on the page, and cumulative progress counts
3. WHEN the Sale_Importer completes a phase or pauses, THE Sale_Importer SHALL log a structured JSON entry at INFO level containing the job identifier, final state, phase name, and elapsed time in seconds
4. IF a non-retryable error occurs, THEN THE Sale_Importer SHALL log a structured JSON entry at ERROR level containing the job identifier, the ConsignCloud API response status code, and the response body truncated to a maximum of 10,000 characters
5. WHEN an individual sale fails to sync, THE Sale_Importer SHALL log a structured JSON entry at WARN level containing the job identifier, the ConsignCloud sale UUID, and the error reason
6. THE Sale_Importer SHALL include the job identifier in every log entry emitted during import processing, enabling filtering and correlation of logs across re-invocations
