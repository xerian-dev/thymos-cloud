# Requirements Document

## Introduction

This feature adds an automated scheduled job that runs every 15 minutes to import accounts, items, and sales from the ConsignCloud API into the shop system's DynamoDB table. The scheduled sync eliminates manual intervention by triggering imports via Amazon EventBridge Scheduler, orchestrating the three import types sequentially (accounts → items → sales), tracking "last successful sync" timestamps for incremental fetching, and preventing duplicate concurrent executions. The feature builds entirely on the existing import infrastructure — the same Import Lambda, Step Functions state machine, Import_Table, rate limiter, and ConsignCloud API client — adding only a scheduling trigger, a sync orchestration handler, and sync state persistence.

## Glossary

- **Sync_Scheduler**: The Amazon EventBridge rule that triggers the Import Lambda every 15 minutes on a fixed schedule
- **Sync_Orchestrator**: The handler within the Import Lambda responsible for coordinating the sequential execution of account, item, and sale imports during a scheduled sync run
- **Sync_State**: A record in the Import_Table that persists the last successful sync timestamps for each import type (accounts, items, sales), enabling incremental fetching
- **Sync_Run**: A single execution of the scheduled sync job that imports accounts, items, and sales sequentially
- **Import_Lambda**: The existing Lambda function (`thymos-{environment}-shop-import`) with 300-second timeout that handles all import operations
- **Import_Table**: The existing DynamoDB table (`thymos-{environment}-import`) used to stage data, track job state, checkpoints, and now sync state
- **Shop_Table**: The existing DynamoDB table (`thymos-{environment}-shop`) storing production entity data
- **ConsignCloud_API**: The external REST API at `https://api.consigncloud.com/api/v1` providing account, item, and sale data
- **Step_Functions_State_Machine**: The existing AWS Step Functions state machine (`thymos-{environment}-shop-import-loop`) that orchestrates long-running import operations via Lambda re-invocation
- **Rate_Limiter**: The existing token bucket mechanism (100 capacity, 10 requests per second drain) throttling outbound ConsignCloud_API requests
- **Sync_Lock**: A record in the Import_Table that prevents concurrent Sync_Run executions using DynamoDB conditional writes
- **Incremental_Fetch**: The technique of using a `createdAfter` timestamp filter to fetch only new records since the last successful sync

## Requirements

### Requirement 1: EventBridge Scheduled Trigger

**User Story:** As a shop operator, I want the system to automatically import data from ConsignCloud every 15 minutes, so that the shop database stays current without manual intervention.

#### Acceptance Criteria

1. THE Sync_Scheduler SHALL invoke the Import_Lambda every 15 minutes using a fixed-rate EventBridge rule
2. WHEN the Sync_Scheduler invokes the Import_Lambda, THE Sync_Scheduler SHALL pass an event payload containing `{ "action": "scheduled-sync" }` to identify the invocation as a scheduled sync trigger
3. THE Import_Lambda SHALL have an IAM resource-based policy granting the EventBridge service (`events.amazonaws.com`) permission to invoke the function, scoped to the specific Sync_Scheduler rule ARN via the `source_arn` condition
4. THE Sync_Scheduler SHALL be configured with state `ENABLED` so that scheduling begins immediately upon deployment
5. THE Sync_Scheduler SHALL be configured with a retry policy of 0 retry attempts and no dead-letter queue, so that failed invocations are not automatically retried by EventBridge
6. IF the Import_Lambda returns an error or times out when invoked by the Sync_Scheduler, THEN THE Sync_Scheduler SHALL discard the failed event without retry, and the next scheduled invocation SHALL proceed at the next 15-minute interval as normal

### Requirement 2: Sync Run Orchestration

**User Story:** As a shop operator, I want the scheduled sync to import accounts, items, and sales in the correct order, so that reference data (accounts, employees) exists before items and sales that depend on it.

#### Acceptance Criteria

1. WHEN a scheduled-sync event is received, THE Sync_Orchestrator SHALL always begin from the account import phase regardless of any previously persisted state, and SHALL execute imports in fixed sequential order: the account import phase must complete before the item import phase is started, and the item import phase must be started before the sale import phase is started
2. WHEN starting the account import phase, THE Sync_Orchestrator SHALL verify that the current phase is account import (the first phase after lock acquisition in every Sync_Run), and SHALL invoke the existing account fetch and sync operations (equivalent to POST /api/import/fetch followed by POST /api/import/sync) synchronously within the same Lambda invocation and wait for completion before proceeding to the next phase
3. WHEN starting the item import phase, THE Sync_Orchestrator SHALL start an item import job via the Step_Functions_State_Machine with the `createdAfter` parameter set to the last successful item sync timestamp from the Sync_State record
4. WHEN starting the sale import phase, THE Sync_Orchestrator SHALL start a sale import job via the Step_Functions_State_Machine with the `createdAfter` parameter set to the last successful sale sync timestamp from the Sync_State record
5. IF no previous Sync_State record exists (first-ever sync run), THEN THE Sync_Orchestrator SHALL omit the `createdAfter` parameter for items and sales, causing a full import of all available data
6. WHEN an import phase completes or is initiated successfully, THE Sync_Orchestrator SHALL update the corresponding Sync_State timestamp field (`lastAccountSyncAt`, `lastItemSyncAt`, or `lastSaleSyncAt`) with the timestamp captured at the start of the current Sync_Run, updating each field independently as its phase succeeds
7. IF the account import phase fails, THEN THE Sync_Orchestrator SHALL skip the item and sale import phases without updating any Sync_State timestamp fields for the current Sync_Run
8. IF the item or sale Step Functions start fails after retry, THEN THE Sync_Orchestrator SHALL NOT update the corresponding Sync_State timestamp field for that phase but SHALL continue to attempt subsequent phases

### Requirement 3: Concurrency Control

**User Story:** As a shop operator, I want the scheduled sync to skip execution if a previous sync is still running, so that duplicate imports do not create data inconsistencies or exceed API rate limits.

#### Acceptance Criteria

1. WHEN the Sync_Orchestrator begins a Sync_Run, THE Sync_Orchestrator SHALL attempt to acquire the Sync_Lock by writing a lock record to the Import_Table with PK `SYNC_LOCK` and SK `METADATA` using a DynamoDB conditional expression (`attribute_not_exists(PK)`) to ensure only one Sync_Run executes at a time
2. THE Sync_Lock record SHALL contain: `lockedAt` (ISO 8601 UTC timestamp when the lock was acquired), `correlationId` (the UUID identifying the current Sync_Run), and `ttl` (Unix epoch timestamp set to 60 minutes after `lockedAt`)
3. IF the Sync_Lock already exists (conditional write fails with ConditionalCheckFailedException), THEN THE Sync_Orchestrator SHALL read the existing lock record and check whether the lock is stale (the `lockedAt` timestamp is older than 60 minutes compared to the current time)
4. IF the Sync_Lock is stale (older than 60 minutes), THEN THE Sync_Orchestrator SHALL force-acquire the lock by overwriting it with a new timestamp using a conditional expression that verifies the `lockedAt` value has not changed since it was read (optimistic locking to prevent race conditions between two concurrent force-acquire attempts)
5. IF the Sync_Lock is not stale (less than 60 minutes old), THEN THE Sync_Orchestrator SHALL log an INFO message indicating that a sync is already in progress and terminate immediately without starting any imports or performing any further processing
6. IF the Sync_Orchestrator detects that another sync execution is already running after acquiring a lock (race condition despite protections), THEN THE Sync_Orchestrator SHALL terminate immediately without starting any imports, log a WARN indicating concurrent execution detected, and release the lock
7. WHEN the Sync_Run completes (all phases initiated or skipped), THE Sync_Orchestrator SHALL delete the Sync_Lock record from the Import_Table
8. IF the Sync_Run fails with an unhandled error, THEN THE Sync_Orchestrator SHALL attempt to delete the Sync_Lock record in a finally block to prevent permanent lock-out; if the lock deletion itself fails, THE Sync_Orchestrator SHALL log a WARN and allow the stale lock timeout mechanism to recover

### Requirement 4: Incremental Sync State Tracking

**User Story:** As a shop operator, I want each sync to fetch only new data since the last successful run, so that imports are fast and do not reprocess already-imported records.

#### Acceptance Criteria

1. THE Sync_State record SHALL be stored in the Import_Table with PK `SYNC_STATE` and SK `METADATA`, containing: `lastAccountSyncAt` (ISO 8601 UTC or null), `lastItemSyncAt` (ISO 8601 UTC or null), `lastSaleSyncAt` (ISO 8601 UTC or null), and `updatedAt` (ISO 8601 UTC)
2. WHEN the account import phase completes successfully (fetch and sync operations both return without error), THE Sync_Orchestrator SHALL update the Sync_State `lastAccountSyncAt` field with the ISO 8601 UTC timestamp captured immediately after the Sync_Lock is acquired, before any import phase begins
3. WHEN the Step_Functions_State_Machine StartExecution API returns successfully for an item import job, THE Sync_Orchestrator SHALL update the Sync_State `lastItemSyncAt` field with the ISO 8601 UTC timestamp captured immediately after the Sync_Lock is acquired, before any import phase begins
4. WHEN the Step_Functions_State_Machine StartExecution API returns successfully for a sale import job, THE Sync_Orchestrator SHALL update the Sync_State `lastSaleSyncAt` field with the ISO 8601 UTC timestamp captured immediately after the Sync_Lock is acquired, before any import phase begins
5. WHEN starting an item import, THE Sync_Orchestrator SHALL pass the `lastItemSyncAt` value from the Sync_State as the `createdAfter` parameter to filter the ConsignCloud_API response to only items created after that timestamp
6. WHEN starting a sale import, THE Sync_Orchestrator SHALL pass the `lastSaleSyncAt` value from the Sync_State as the `createdAfter` parameter to filter the ConsignCloud_API response to only sales created after that timestamp
7. IF a Sync_State DynamoDB update fails, THEN THE Sync_Orchestrator SHALL retry the write up to 2 times before logging an ERROR and continuing to the next import phase without updating that field, so that the next Sync_Run re-fetches from the previous successful timestamp rather than skipping records

### Requirement 5: Account Import Handling

**User Story:** As a shop operator, I want the scheduled sync to import all accounts each time, so that updated account information (names, contacts) is always current.

#### Acceptance Criteria

1. WHEN executing the account import phase, THE Sync_Orchestrator SHALL invoke the existing account fetch logic (fetching all active accounts from the ConsignCloud_API) without a `createdAfter` filter since the accounts endpoint does not support incremental fetching
2. WHEN executing the account import phase, THE Sync_Orchestrator SHALL invoke the existing account sync logic to create or update accounts in the Shop_Table based on `sourceId` matching, processing all fetched accounts regardless of individual account write failures
3. IF the account import phase encounters a non-recoverable error (authentication failure, ConsignCloud_API unreachable after 3 retry attempts, or SSM parameter retrieval failure), THEN THE Sync_Orchestrator SHALL log the error at ERROR level as a structured JSON entry and skip the remaining import phases (items and sales) for the current Sync_Run
4. WHEN the account import phase completes successfully, THE Sync_Orchestrator SHALL log a structured JSON entry at INFO level containing the sync report with counts for: accounts added, accounts updated, accounts skipped, and accounts errored
5. IF individual account writes fail during the sync phase while the overall phase continues, THEN THE Sync_Orchestrator SHALL count each failed account in the "errored" field of the sync report and treat the phase as successfully completed ONLY when the fetch and batch processing both completed without a non-recoverable error; IF a non-recoverable error occurs at any point during the phase, THEN THE Sync_Orchestrator SHALL treat the phase as failed regardless of how many individual account writes succeeded or failed

### Requirement 6: Item and Sale Import Handling

**User Story:** As a shop operator, I want item and sale imports to run as long-running Step Functions executions, so that large datasets complete reliably across Lambda timeout boundaries.

#### Acceptance Criteria

1. WHEN starting the item import phase, THE Sync_Orchestrator SHALL call the Step_Functions_State_Machine `StartExecution` API with a payload containing the job identifier, phase `fetch`, type `items`, and the `createdAfter` filter parameter, using an execution name derived from the job identifier to ensure uniqueness per state machine
2. WHEN starting the sale import phase, THE Sync_Orchestrator SHALL call the Step_Functions_State_Machine `StartExecution` API with a payload containing the job identifier, phase `fetch`, type `sales`, and the `createdAfter` filter parameter, using an execution name derived from the job identifier to ensure uniqueness per state machine
3. THE Sync_Orchestrator SHALL NOT wait for item or sale Step Functions executions to complete before finishing the Lambda invocation, regardless of import type or expected duration, since these executions are asynchronous and may take longer than the Lambda timeout
4. IF a Step_Functions_State_Machine StartExecution call fails with a retryable error (service unavailable or throttling), THEN THE Sync_Orchestrator SHALL retry once after a 2-second delay; IF the retry also fails, THEN THE Sync_Orchestrator SHALL log the retry failure at ERROR level with the error details and continue to the next import phase without updating the corresponding Sync_State timestamp field
5. IF a Step_Functions_State_Machine StartExecution call fails with a non-retryable error (access denied, invalid ARN, or validation error), THEN THE Sync_Orchestrator SHALL log an ERROR immediately without retrying and continue to the next import phase without updating the corresponding Sync_State timestamp field

### Requirement 7: Infrastructure Resources

**User Story:** As a developer, I want the scheduling infrastructure defined in Terraform alongside the existing import resources, so that the deployment is reproducible and consistent.

#### Acceptance Criteria

1. THE Sync_Scheduler SHALL be defined as an `aws_cloudwatch_event_rule` resource in the import Terraform module with a `schedule_expression` of `rate(15 minutes)` and its `state` set to `ENABLED`
2. THE Sync_Scheduler target SHALL be defined as an `aws_cloudwatch_event_target` resource pointing to the existing Import_Lambda function ARN, with a fixed JSON input payload containing the action identifier that the Lambda uses to route the sync operation
3. THE Import_Lambda SHALL have an `aws_lambda_permission` resource granting `events.amazonaws.com` permission to invoke the function, with the `source_arn` set to the EventBridge rule ARN
4. THE EventBridge rule, target, and Lambda permission resources SHALL be defined in the existing import module at `infrastructure/modules/import/main.tf`
5. THE Sync_Scheduler resources SHALL follow the existing module's naming convention (`${var.project_name}-${var.environment}-` prefix) and include `Environment` and `Project` tags consistent with other resources in the module

### Requirement 8: Error Handling and Resilience

**User Story:** As a shop operator, I want the scheduled sync to handle failures gracefully, so that transient errors do not break the sync cycle permanently.

#### Acceptance Criteria

1. IF the account import phase fails, THEN THE Sync_Orchestrator SHALL skip the item and sale import phases, NOT update the Sync_State `lastAccountSyncAt` field, release the Sync_Lock, and log an ERROR with the failure details
2. IF the item import Step Functions start fails after retry (1 retry with 2-second delay as defined in Requirement 6), THEN THE Sync_Orchestrator SHALL log an ERROR, NOT update the Sync_State `lastItemSyncAt` field, and proceed to attempt the sale import phase regardless of the item import failure
3. IF the sale import Step Functions start fails after retry (1 retry with 2-second delay as defined in Requirement 6), THEN THE Sync_Orchestrator SHALL log an ERROR, NOT update the Sync_State `lastSaleSyncAt` field, and complete the Sync_Run by releasing the Sync_Lock
4. IF an unhandled exception occurs at any point during the Sync_Run, THEN THE Sync_Orchestrator SHALL release the Sync_Lock in a finally block (handling the case where the lock was never acquired without throwing a secondary error), log the error at ERROR level, and return a response object to the Lambda runtime without throwing so that future scheduled invocations continue
5. THE Sync_Scheduler target SHALL be configured with `maximum_retry_attempts` set to 0 on the EventBridge target to prevent EventBridge from retrying failed Lambda invocations (the next scheduled run will handle recovery)

### Requirement 9: Observability

**User Story:** As a system administrator, I want visibility into scheduled sync operations, so that I can monitor health and investigate failures.

#### Acceptance Criteria

1. WHEN the Sync_Orchestrator begins a Sync_Run, THE Sync_Orchestrator SHALL log a structured JSON entry at INFO level containing the event source (`scheduled-sync`), the correlation identifier, the Sync_State timestamps for each import type (or null if no previous sync exists), and whether each phase will be full or incremental
2. WHEN the Sync_Orchestrator skips execution due to an existing Sync_Lock, THE Sync_Orchestrator SHALL log a structured JSON entry at INFO level containing a correlation identifier, the lock timestamp, and the age of the lock in whole minutes (rounded down)
3. WHEN the Sync_Orchestrator completes a Sync_Run, THE Sync_Orchestrator SHALL log a structured JSON entry at INFO level containing the correlation identifier, the total elapsed time in milliseconds, the outcome of each phase (one of: `success`, `skipped`, or `error` with a descriptive reason string), and any Step Functions execution ARNs started
4. WHEN the Sync_Orchestrator force-acquires a stale lock, THE Sync_Orchestrator SHALL log a structured JSON entry at WARN level containing the correlation identifier, the stale lock timestamp, and the stale lock age in whole minutes (rounded down)
5. THE Sync_Orchestrator SHALL generate the correlation identifier (v4 UUID) as the first action upon receiving a scheduled-sync event, before lock acquisition, and SHALL include it in every log entry emitted during the invocation — including entries for skipped executions due to an existing lock — so that a single invocation that generates a correlation ID and then skips due to a non-stale lock produces both a "sync run beginning" log entry (AC 1) and a "skipped due to lock" log entry (AC 2) with the same correlation identifier, enabling filtering all log output from a single invocation
