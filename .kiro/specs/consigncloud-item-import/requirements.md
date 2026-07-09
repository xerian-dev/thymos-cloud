# Requirements Document

## Introduction

This feature imports items from the ConsignCloud API into the shop system's DynamoDB table. Unlike the existing account import (which loads all data into memory), the item import must handle 100,000+ records by processing page-by-page with checkpoint-based resumability. The import is CLI-triggered, tracks job state, and can recover from mid-import failures without reprocessing already-imported items. A date filter limits the initial import to 2026-created items, with full historical import available later.

## Glossary

- **Item_Importer**: The Lambda function (or chain of invocations) responsible for fetching items from the ConsignCloud_API page-by-page, mapping them, and writing them to the Shop_Table
- **Shop_Table**: The existing DynamoDB table (`thymos-{environment}-shop`) storing production item and account data
- **Import_Table**: The existing DynamoDB table (`thymos-{environment}-import`) used to track import job state and checkpoints
- **ConsignCloud_API**: The external REST API at `https://api.consigncloud.com/api/v1` providing item data via cursor-based pagination
- **Import_Job**: A record in the Import_Table tracking the state and progress of an item import operation
- **Checkpoint**: A record in the Import_Table storing the last successfully processed cursor position, enabling resumption after failure
- **Rate_Limiter**: A mechanism that throttles outbound requests to the ConsignCloud_API to stay within the leaky bucket rate limit (100 capacity, 10 requests per second drain)
- **Item_Mapper**: The component responsible for transforming ConsignCloud item fields into Shop_Table item fields
- **Import_Report**: A JSON summary produced after import completion detailing counts of imported, skipped, failed, and duplicate items
- **Cursor**: A pagination token returned by the ConsignCloud_API (`next_cursor` field) used to fetch subsequent pages of results
- **Source_ID**: The `sourceId` attribute on Shop_Table records that stores the external system identifier (ConsignCloud UUID) for deduplication

## Requirements

### Requirement 1: CLI-Triggered Import Execution

**User Story:** As a shop operator, I want to trigger item imports from the CLI, so that I can run imports on demand without building a UI.

#### Acceptance Criteria

1. WHEN the Item_Importer receives a start-import request with an optional `createdAfter` date parameter (ISO 8601 format), THE Item_Importer SHALL create a new Import_Job in `running` state and return the job identifier, job state, and creation timestamp within 5 seconds
2. IF the Item_Importer receives a start-import request and an Import_Job already exists in `running` state, THEN THE Item_Importer SHALL reject the request with an error response indicating a job is already running, and return the existing job identifier
3. WHEN the Item_Importer receives a resume-import request with a valid job identifier for a job in `failed` or `paused` state, THE Item_Importer SHALL transition the job to `running` state and resume processing from the last Checkpoint for that job
4. IF the Item_Importer receives a resume-import request with a job identifier that does not exist or refers to a job not in `failed` or `paused` state, THEN THE Item_Importer SHALL reject the request with an error response indicating the reason for rejection
5. WHEN the Item_Importer receives a status request with a job identifier, THE Item_Importer SHALL return the current Import_Job state and progress counts including items processed, items failed, items skipped, and total items expected
6. THE Item_Importer SHALL expose import operations (start-import, resume-import, status) via HTTP POST endpoints on the existing import Lambda, callable via `curl` or similar CLI tools

### Requirement 2: Paginated Fetch with Cursor-Based Pagination

**User Story:** As a shop operator, I want items fetched page-by-page from ConsignCloud, so that the import does not exceed available memory regardless of total item count.

#### Acceptance Criteria

1. WHEN fetching items from the ConsignCloud_API, THE Item_Importer SHALL request pages of up to 100 items using the `limit` query parameter
2. WHEN fetching items, THE Item_Importer SHALL include the `include` parameter with values: batches, created_by, days_on_shelf, historic_consignor_portions, historic_sale_prices, historic_store_portions, last_sold, last_viewed, list_on_shopify, list_on_square, location, printed, split_price, surcharges, tags, tax_exempt, images, quantity, weight, weight_unit
3. WHEN fetching items, THE Item_Importer SHALL include the `expand` parameter with values: account, category, created_by, surcharges, shelf, batches, images, location
4. WHEN a `createdAfter` filter is specified, THE Item_Importer SHALL include the `created_after` query parameter with the value formatted as an ISO 8601 date string to limit results to items created after that date
5. WHEN a response contains a non-null `next_cursor` value, THE Item_Importer SHALL use that cursor to fetch the next page of results while preserving all original query parameters
6. WHEN a response contains a null `next_cursor` value, THE Item_Importer SHALL consider the fetch phase complete for the Import_Job and stop issuing further page requests for that job
7. WHEN fetching items, THE Item_Importer SHALL authenticate with the ConsignCloud_API using a Bearer token retrieved from AWS SSM Parameter Store
8. WHEN fetching a page from the ConsignCloud_API, THE Item_Importer SHALL enforce a per-request timeout of 30 seconds, after which the request is considered failed and subject to the retry policy defined in the Rate Limiting and Retry requirement

### Requirement 3: Rate Limiting and Retry

**User Story:** As a shop operator, I want the import to respect ConsignCloud's API rate limits, so that requests are not rejected and the import proceeds reliably.

#### Acceptance Criteria

1. WHEN fetching items, THE Rate_Limiter SHALL ensure outbound requests do not exceed 10 requests per second sustained and 100 requests burst capacity
2. IF the ConsignCloud_API returns an HTTP 429 response with a `Retry-After` header, THEN THE Item_Importer SHALL wait for the duration specified in the header before retrying the request
3. IF the ConsignCloud_API returns an HTTP 429 response without a `Retry-After` header, THEN THE Item_Importer SHALL wait using exponential backoff starting at 1 second and doubling on each consecutive 429 response, up to a maximum wait of 60 seconds per attempt
4. IF the ConsignCloud_API returns 5 consecutive HTTP 429 responses for the same request, THEN THE Item_Importer SHALL save the current Checkpoint and transition the Import_Job to `paused` state
5. IF the ConsignCloud_API returns an HTTP 5xx response, THEN THE Item_Importer SHALL retry the request up to 3 times with exponential backoff starting at 1 second and doubling each retry (1s, 2s, 4s) before recording the page as failed
6. IF a page fetch fails after all retries are exhausted, THEN THE Item_Importer SHALL save the current Checkpoint and transition the Import_Job to `paused` state so the job can be resumed later

### Requirement 4: Checkpoint and Resumability

**User Story:** As a shop operator, I want the import to save progress after each page, so that a failure does not require restarting from the beginning.

#### Acceptance Criteria

1. WHEN all items on a page have been processed (whether imported, skipped, or failed) and written to the Shop_Table, THE Item_Importer SHALL update the Checkpoint in the Import_Table with the current cursor position and cumulative progress counts (total items processed, items imported, items skipped, items failed)
2. WHEN a resume-import request is received, THE Item_Importer SHALL read the Checkpoint for the specified job and continue fetching from the stored cursor position with the original query parameters stored in the Import_Job record
3. THE Checkpoint SHALL store: job identifier, current cursor, total items processed, items imported, items skipped, items failed, and last updated timestamp (ISO 8601 UTC)
4. WHEN the Item_Importer has been running for 270 seconds (30 seconds before the 300-second Lambda timeout), THE Item_Importer SHALL save the current Checkpoint and invoke itself asynchronously with the job identifier to continue processing
5. IF the self-re-invocation fails, THEN THE Item_Importer SHALL transition the Import_Job to `paused` state so the operator can manually resume
6. IF a resume-import request is received with a job identifier that does not exist in the Import_Table or has no Checkpoint record, THEN THE Item_Importer SHALL reject the request and return an error response indicating the job or checkpoint was not found
7. IF the Checkpoint write to the Import_Table fails, THEN THE Item_Importer SHALL retry the write up to 3 times before transitioning the Import_Job to `paused` state, preserving the in-memory progress counts so the page can be re-checkpointed on resume

### Requirement 5: Item Mapping and Deduplication

**User Story:** As a shop operator, I want ConsignCloud items mapped to the shop data model with deduplication, so that re-running the import does not create duplicate items.

#### Acceptance Criteria

1. WHEN processing an item from ConsignCloud, THE Item_Mapper SHALL map ConsignCloud fields to Shop_Table fields: `title` from item name (max 200 characters, truncated if longer), `tagPrice` from price (valid range 0.00 to 999,999.99), `quantity` from quantity (valid range 1 to 9999), `split` from consignor split percentage (valid range 0 to 100), `category` from category name, `tags` from item tags (max 20 items), `description` from description (max 2,000 characters, truncated if longer), `brand` from brand, `color` from color, `size` from size, `shelf` from shelf/location name, `taxExempt` from tax exempt flag, and `imageKeys` from image URLs stored as-is for later processing
2. WHEN processing an item, THE Item_Mapper SHALL resolve the ConsignCloud account ID to an internal account UUID by querying the Shop_Table for an account with a matching `sourceId` attribute
3. IF the account lookup for a ConsignCloud item fails (no matching account found), THEN THE Item_Importer SHALL record the item as failed with an error message indicating the ConsignCloud item UUID and the unresolved account ID, and continue processing the next item
4. IF a ConsignCloud item has a null or missing required field (title, tagPrice, quantity, or split), THEN THE Item_Importer SHALL record the item as failed with an error message indicating the ConsignCloud item UUID and the missing field name, and continue processing the next item
5. IF a ConsignCloud item has a `tagPrice` outside the range 0.00 to 999,999.99, a `quantity` outside the range 1 to 9999, or a `split` outside the range 0 to 100, THEN THE Item_Importer SHALL record the item as failed with an error message indicating the ConsignCloud item UUID and the invalid field, and continue processing the next item
6. WHEN processing an item that has a non-null deleted indicator, THE Item_Importer SHALL skip the item and increment the skipped count
7. WHEN processing an item whose ConsignCloud UUID already exists as a `sourceId` in the Shop_Table, THE Item_Importer SHALL skip the item as a duplicate and increment the skipped count
8. WHEN creating a new item in the Shop_Table, THE Item_Importer SHALL generate the next sequential SKU from the item sequence counter
9. WHEN creating a new item in the Shop_Table, THE Item_Importer SHALL store the ConsignCloud item UUID as the `sourceId` attribute for future deduplication
10. WHEN creating a new item, THE Item_Importer SHALL set `inventoryType` to `Consignment` and `terms` to `Return To Consignor` as defaults

### Requirement 6: Import Job State Management

**User Story:** As a shop operator, I want to track the state of import jobs, so that I can monitor progress and know when the import completes or needs attention.

#### Acceptance Criteria

1. THE Import_Job SHALL have one of the following states: `running`, `paused`, `failed`, `complete`
2. WHEN a new import is started, THE Item_Importer SHALL create an Import_Job record in the Import_Table with PK `ITEM_IMPORT#<jobId>` and SK `METADATA`, where jobId is a v4 UUID, state `running`, the start timestamp, the last updated timestamp, and the filter parameters used
3. WHEN all pages have been processed and no cursor remains, THE Item_Importer SHALL transition the Import_Job to `complete` state and update the last updated timestamp
4. WHEN a non-recoverable error occurs (such as authentication failure or invalid configuration), THE Item_Importer SHALL transition the Import_Job to `failed` state with an error description of up to 500 characters and update the last updated timestamp
5. WHEN the Item_Importer pauses due to timeout or retriable failure, THE Item_Importer SHALL transition the Import_Job to `paused` state and update the last updated timestamp
6. THE Import_Job record SHALL store: job identifier (v4 UUID), state, start timestamp (ISO 8601 UTC), last updated timestamp (ISO 8601 UTC), filter parameters, error description (when in `failed` state), and cumulative progress counts (processed, imported, skipped, failed)
7. IF the Item_Importer receives a start-import request and an Import_Job already exists in `running` or `paused` state, THEN THE Item_Importer SHALL reject the request and return the existing job identifier

### Requirement 7: Import Report Generation

**User Story:** As a shop operator, I want a summary report after the import completes, so that I can verify what was imported and investigate failures.

#### Acceptance Criteria

1. WHEN the Import_Job reaches `complete` state, THE Item_Importer SHALL produce an Import_Report containing: total items processed, items imported, items skipped (deleted or duplicate), items failed, and elapsed time expressed as whole seconds from job start timestamp to completion timestamp
2. WHEN items fail during import, THE Import_Report SHALL include a list of failed item entries, each containing the ConsignCloud item UUID and an error description (maximum 200 characters per description), limited to the first 100 failures encountered in processing order
3. THE Item_Importer SHALL write the Import_Report to the Import_Table with PK `ITEM_IMPORT#REPORT` and SK set to the job identifier upon transitioning the Import_Job to `complete` state
4. WHEN a status request is made for a completed job, THE Item_Importer SHALL return the Import_Report as the JSON response payload
5. IF more than 100 items fail during the import, THEN THE Import_Report SHALL include a `truncated` flag set to true and a `totalFailures` count reflecting the actual number of failed items

### Requirement 8: Idempotent Page Processing

**User Story:** As a shop operator, I want page processing to be safe to retry, so that a failure mid-page does not result in duplicate items when the page is reprocessed.

#### Acceptance Criteria

1. WHEN processing items from a page, THE Item_Importer SHALL check each item for an existing `sourceId` match in the Shop_Table before generating a SKU or creating a new record, so that sequence numbers are not consumed for duplicate items
2. WHEN an item from the current page already exists in the Shop_Table (matched by `sourceId`), THE Item_Importer SHALL skip the item without error and increment the skipped count in the running progress totals
3. IF an individual item write fails, THEN THE Item_Importer SHALL increment the failed count, log the ConsignCloud item identifier and error reason, and continue processing the remaining items on the page
4. WHEN all items on a page have been processed (whether imported, skipped, or failed), THE Item_Importer SHALL update the Checkpoint in the Import_Table with the current cursor position and cumulative progress counts (total processed, imported, skipped, failed)
5. WHEN creating a new item, THE Item_Importer SHALL use a DynamoDB conditional expression on the item Put (condition: `sourceId` does not already exist for that value) so that concurrent processing of the same page cannot create duplicate records

### Requirement 9: Self-Re-Invocation for Long-Running Imports

**User Story:** As a shop operator, I want the import to continue automatically across Lambda timeout boundaries, so that I do not need to manually resume for large imports.

#### Acceptance Criteria

1. WHEN the Item_Importer has been running for 270 seconds (30 seconds before the 300-second timeout) and has completed processing the current page, THE Item_Importer SHALL save the current Checkpoint and invoke itself asynchronously with the job identifier
2. WHEN self-re-invoking, THE Item_Importer SHALL pass the job identifier so the new invocation resumes from the saved Checkpoint
3. THE Item_Importer Lambda SHALL have IAM permissions to invoke itself (lambda:InvokeFunction on its own ARN)
4. WHEN self-re-invocation is used, THE Item_Importer SHALL log the handoff including the current cursor and progress counts
5. WHEN the Item_Importer successfully invokes itself, THE current invocation SHALL terminate without processing further pages, to prevent concurrent processing of the same job

### Requirement 10: Observability

**User Story:** As a system administrator, I want visibility into item import operations, so that I can monitor progress and troubleshoot issues.

#### Acceptance Criteria

1. WHEN the Item_Importer begins processing, THE Item_Importer SHALL log a structured JSON entry at INFO level containing the job identifier, filter parameters (including `createdAfter` if specified), and whether this is a new job or a resumption
2. WHEN each page is processed, THE Item_Importer SHALL log a structured JSON entry at INFO level containing the job identifier, page number, count of items on the page, and cumulative progress counts (total processed, imported, skipped, failed)
3. WHEN the Item_Importer completes or pauses, THE Item_Importer SHALL log a structured JSON entry at INFO level containing the job identifier, final state (`complete` or `paused`), total items processed, and elapsed time in seconds
4. IF a non-retryable error occurs, THEN THE Item_Importer SHALL log a structured JSON entry at ERROR level containing the job identifier, the ConsignCloud API response status code, and the response body truncated to a maximum of 10,000 characters
5. WHEN an individual item fails to import, THE Item_Importer SHALL log a structured JSON entry at WARN level containing the job identifier, the ConsignCloud item UUID, and the error reason
6. THE Item_Importer SHALL include the job identifier in every log entry emitted during import processing, enabling filtering and correlation of logs across self-re-invocations
