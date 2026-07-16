# Requirements Document

## Introduction

Refactor the ConsignCloud import system to extract shared fetch-stage-sync plumbing into reusable modules, and implement a new Account import that uses the same pattern as the existing Item and Sale imports. The Account import fetches all accounts (with full includes/expands) from ConsignCloud and stages them in the import DynamoDB table. Only the fetch and staging phases are implemented — the transform/sync phase will be done separately.

## Glossary

- **Import_System**: The collection of Lambda functions, Step Functions state machines, and DynamoDB tables that orchestrate fetching data from ConsignCloud and staging it for synchronization to the shop table.
- **Fetch_Orchestrator**: The module responsible for paginating through a ConsignCloud API endpoint, staging each page of records into the import table, and managing checkpoints for resumability.
- **ConsignCloud_Client**: The HTTP client module that handles communication with the ConsignCloud API, including rate limiting, retry logic for 429 and 5xx responses, and request timeout handling.
- **Job_Manager**: The module that tracks import job state (running, paused, failed, complete), enforces valid state transitions, and persists job metadata in the import table.
- **Checkpoint_Manager**: The module that persists pagination cursor and progress counts so that a fetch operation can resume after a Lambda timeout or failure.
- **Rate_Limiter**: A token-bucket implementation that throttles outbound API requests to stay within ConsignCloud rate limits.
- **Step_Function_Loop**: The AWS Step Functions state machine that repeatedly invokes the import Lambda until the fetch or sync phase signals completion.
- **Import_Table**: The DynamoDB table used for staging raw ConsignCloud records, storing job metadata, and persisting checkpoints. Key pattern: `PK: "IMPORT#CONSIGNCLOUD#<TYPE>#<id>"`, `SK: "METADATA"`.
- **Incremental_Sync**: A sync mode where only records created or updated after a given timestamp are fetched, enabling scheduled periodic imports.
- **Account**: A ConsignCloud account (consignor/vendor) entity fetched from the `/accounts` API endpoint.

## Requirements

### Requirement 1: Generic Fetch Orchestrator

**User Story:** As a developer, I want a shared fetch orchestrator module parameterized by entity type, so that Account, Item, and Sale imports all use the same pagination, checkpointing, and timeout logic without code duplication.

#### Acceptance Criteria

1. THE Import_System SHALL provide a generic Fetch_Orchestrator that accepts a page-fetching function, a record-staging function, and a job type identifier as parameters.
2. WHEN the generic Fetch_Orchestrator is invoked, THE Import_System SHALL paginate through all available pages using cursor-based pagination until no more pages remain or the timeout threshold is reached.
3. WHEN the timeout threshold is reached before all pages are fetched, THE Fetch_Orchestrator SHALL save a checkpoint containing the current cursor and progress counts, then return a "continue" status so the Step_Function_Loop re-invokes the Lambda.
4. WHEN a fetch operation resumes after a timeout, THE Fetch_Orchestrator SHALL load the previously saved checkpoint and continue from the stored cursor position.
5. WHEN all pages have been fetched successfully, THE Fetch_Orchestrator SHALL transition the job to "paused" state and return a "complete" status.
6. THE generic Fetch_Orchestrator SHALL maintain backward compatibility with existing Item and Sale imports by supporting the same interface contracts (progress counts, job state transitions, checkpoint structure).

### Requirement 2: Generic Job Manager

**User Story:** As a developer, I want a shared job manager module parameterized by import type prefix, so that all import types use the same job lifecycle logic.

#### Acceptance Criteria

1. THE Import_System SHALL provide a generic Job_Manager that accepts an import type prefix (e.g., "ITEM_IMPORT", "SALE_IMPORT", "ACCOUNT_IMPORT") and applies the same state machine logic (running → paused → running, running → failed, running → complete) for all import types.
2. WHEN a new import job is created, THE Job_Manager SHALL generate a UUID, persist the job record with initial state "running" and phase "fetch", and store the provided filter parameters.
3. WHEN a job state transition is requested, THE Job_Manager SHALL validate the transition against the allowed transitions before applying it.
4. IF an invalid state transition is requested, THEN THE Job_Manager SHALL throw an error describing the invalid transition.
5. THE Job_Manager SHALL use the import type prefix in the DynamoDB partition key pattern (e.g., `PK: "<PREFIX>#<jobId>"`, `SK: "METADATA"`).

### Requirement 3: Generic Checkpoint Manager

**User Story:** As a developer, I want a shared checkpoint manager parameterized by import type prefix, so that all import types persist and recover pagination state using the same logic.

#### Acceptance Criteria

1. THE Import_System SHALL provide a generic Checkpoint_Manager that accepts an import type prefix and persists checkpoint records with key pattern `PK: "<PREFIX>#<jobId>"`, `SK: "CHECKPOINT"`.
2. WHEN a checkpoint is saved, THE Checkpoint_Manager SHALL store the cursor, progress counts, and a last-updated timestamp.
3. WHEN a checkpoint is loaded for a job that has no saved checkpoint, THE Checkpoint_Manager SHALL return null.
4. IF a checkpoint save fails, THEN THE Checkpoint_Manager SHALL retry up to 3 times with a 500ms delay between attempts before throwing the error.

### Requirement 4: Generic ConsignCloud API Client

**User Story:** As a developer, I want a shared HTTP client module with retry and rate-limiting logic, so that all entity-specific clients reuse the same resilience patterns.

#### Acceptance Criteria

1. THE Import_System SHALL provide a generic ConsignCloud_Client that accepts a URL, authorization header, and Rate_Limiter, and executes GET requests with retry logic.
2. WHEN a 429 response is received, THE ConsignCloud_Client SHALL wait using exponential backoff (respecting the Retry-After header if present) and retry the request.
3. IF 5 consecutive 429 responses are received for the same request, THEN THE ConsignCloud_Client SHALL throw a rate-limit error.
4. WHEN a 5xx response is received, THE ConsignCloud_Client SHALL retry up to 3 times with exponential backoff.
5. IF a request exceeds the configured timeout (default 30 seconds), THEN THE ConsignCloud_Client SHALL throw a timeout error.
6. WHEN a non-retryable 4xx response (other than 429) is received, THE ConsignCloud_Client SHALL throw an error containing the HTTP status and response body.

### Requirement 5: Account ConsignCloud Client

**User Story:** As a developer, I want an Account-specific ConsignCloud client that fetches accounts with all supported includes and expands, so that the staged data is complete for future transformation.

#### Acceptance Criteria

1. WHEN fetching a page of accounts, THE ConsignCloud_Client SHALL call the `/accounts` endpoint with `include=default_split,last_settlement,number_of_purchases,default_inventory_type,default_terms,last_item_entered,number_of_items,created_by,last_activity,locations,recurring_fees,tags,is_vendor,has_pending_invite`.
2. WHEN fetching a page of accounts, THE ConsignCloud_Client SHALL call the `/accounts` endpoint with `expand=created_by,locations,recurring_fees`.
3. THE ConsignCloud_Client SHALL fetch all accounts regardless of account status, applying no filtering at the fetch stage.
4. WHEN a `createdAfter` timestamp is provided, THE ConsignCloud_Client SHALL pass it as `created:gt` (or the equivalent "updated after" parameter) to fetch only accounts created or updated after that timestamp.
5. THE ConsignCloud_Client SHALL support cursor-based pagination using the `cursor` query parameter and reading `next_cursor` from the response.
6. THE ConsignCloud_Client SHALL accept a configurable page size via a `limit` query parameter.

### Requirement 6: Account Fetch Orchestrator

**User Story:** As a developer, I want an Account fetch orchestrator that uses the generic Fetch_Orchestrator to paginate through all ConsignCloud accounts and stage them in the import table.

#### Acceptance Criteria

1. THE Account Fetch_Orchestrator SHALL use the generic Fetch_Orchestrator with the Account ConsignCloud_Client page-fetch function.
2. WHEN accounts are staged, THE Import_System SHALL write each account record to the Import_Table with key pattern `PK: "IMPORT#CONSIGNCLOUD#ACCOUNT#<account_id>"`, `SK: "METADATA"`.
3. WHEN accounts are staged, THE Import_System SHALL store the full raw ConsignCloud response payload (including all included/expanded fields) on the staged record.
4. WHEN accounts are staged, THE Import_System SHALL set an `importedAt` ISO 8601 timestamp on each staged record.
5. THE Account Fetch_Orchestrator SHALL batch-write staged records in groups of 25 using DynamoDB BatchWriteItem.

### Requirement 7: Account Import Job Management

**User Story:** As a developer, I want an Account import job type that integrates with the generic Job_Manager, so that account imports have the same lifecycle and observability as item and sale imports.

#### Acceptance Criteria

1. THE Import_System SHALL support an "account" import type that uses the DynamoDB key prefix "ACCOUNT_IMPORT" for job records.
2. WHEN a new account import is started, THE Import_System SHALL reject the request if an existing account import job is in "running" or "paused" state.
3. WHEN an account import job is created, THE Import_System SHALL accept an optional `createdAfter` filter parameter for incremental sync.
4. THE Import_System SHALL expose account import operations (start, status, resume, cancel) via API Gateway routes following the same pattern as sale imports.

### Requirement 8: Incremental Sync via Scheduled Trigger

**User Story:** As a developer, I want the account import to support scheduled incremental sync, so that new or updated accounts are automatically fetched periodically.

#### Acceptance Criteria

1. WHEN the scheduled EventBridge trigger fires, THE Import_System SHALL determine the "last successful sync" timestamp for accounts and pass it as the `createdAfter` parameter.
2. WHEN no previous successful account sync exists, THE Import_System SHALL perform a full fetch (no `createdAfter` filter).
3. THE Import_System SHALL include account imports in the existing Step_Function_Loop and EventBridge scheduled trigger alongside item and sale imports.
4. WHEN the account fetch phase completes successfully, THE Import_System SHALL record the sync timestamp for use by subsequent scheduled runs.

### Requirement 9: Backward Compatibility

**User Story:** As a developer, I want the refactored shared modules to maintain backward compatibility with existing Item and Sale imports, so that the extraction does not break current functionality.

#### Acceptance Criteria

1. WHEN the generic modules are introduced, THE Import_System SHALL preserve the existing DynamoDB key patterns for Item imports (`PK: "ITEM_IMPORT#<jobId>"`) and Sale imports (`PK: "SALE_IMPORT#<jobId>"`).
2. WHEN the generic modules are introduced, THE Import_System SHALL preserve the existing API Gateway route contracts for item and sale import endpoints.
3. WHEN the generic modules are introduced, THE Import_System SHALL preserve the existing Step_Function_Loop state machine input/output contract (action, jobId, phase, type fields).
4. THE Import_System SHALL maintain the same rate-limiter configuration (capacity: 100, drainRate: 10) used by existing imports.
5. WHEN the generic modules are introduced, THE Import_System SHALL preserve the existing checkpoint save/load behavior including the 3-retry mechanism with 500ms delay.

### Requirement 10: No Transform/Sync Phase for Accounts

**User Story:** As a developer, I want the account import to stop after staging, so that transformation logic can be implemented separately without coupling it to the fetch implementation.

#### Acceptance Criteria

1. WHEN the account fetch phase completes, THE Import_System SHALL transition the job to "paused" state without automatically starting a sync phase.
2. THE Import_System SHALL NOT implement account-to-shop-table mapping or sync logic as part of this feature.
3. WHEN an account import job is in "paused" state after fetch completion, THE Import_System SHALL allow it to be cancelled via the cancel endpoint.
