# Requirements Document

## Introduction

Replace full DynamoDB table scans in the import job system with efficient Query operations by introducing "fat pointer" records under a well-known `JOBS` partition key. Pointer records duplicate essential job fields (jobId, state, phase, progress, startedAt, lastUpdatedAt, error) so that queries can serve API responses directly without follow-up GetItem calls. The sort key pattern `<PREFIX>#<lastUpdatedAt>#<jobId>` enables time-sorted listing. A migration script backfills pointers for existing job records.

## Glossary

- **Import_System**: The backend Lambda handlers and job manager modules responsible for creating, updating, querying, and cancelling import jobs (generic-job-manager.ts, import-status-handler.ts, import-history-handler.ts, and the cancel handlers).
- **Pointer_Record**: A DynamoDB item stored under a well-known partition key (`JOBS`) whose sort key encodes prefix, timestamp, and jobId. It duplicates key fields from the job metadata record to enable efficient queries without follow-up reads.
- **Job_Metadata_Record**: The existing DynamoDB item with PK `<PREFIX>#<jobId>` and SK `METADATA` that stores the full import job state.
- **Fat_Pointer**: A Pointer_Record that contains duplicated fields (jobId, state, phase, progress, startedAt, lastUpdatedAt, error) sufficient to serve API responses without a follow-up GetItem on the Job_Metadata_Record.
- **Pointer_SK**: The sort key pattern for a Pointer_Record: `<PREFIX>#<lastUpdatedAt>#<jobId>` (e.g., `ITEM_IMPORT#2024-01-15T10:30:00.000Z#abc-123`).
- **Import_Prefix**: One of the three import type identifiers: `ITEM_IMPORT`, `SALE_IMPORT`, or `ACCOUNT_IMPORT`.
- **Migration_Script**: A standalone script that scans existing Job_Metadata_Records and creates corresponding Pointer_Records for each.

## Requirements

### Requirement 1: Pointer Record Creation

**User Story:** As a developer, I want every new import job to automatically create a fat pointer record, so that query-based lookups are available from the moment a job is created.

#### Acceptance Criteria

1. WHEN a new import job is created, THE Import_System SHALL write a Pointer_Record with PK `JOBS` and SK following the Pointer_SK pattern using the job's Import_Prefix, startedAt timestamp (as lastUpdatedAt), and jobId.
2. WHEN a new import job is created, THE Import_System SHALL populate the Pointer_Record with the fields: jobId, state, phase, progress, startedAt, lastUpdatedAt, and the Import_Prefix.
3. THE Import_System SHALL write the Pointer_Record in the same DynamoDB operation (or transactional batch) as the Job_Metadata_Record to ensure consistency.

### Requirement 2: Pointer Record Update on State Transition

**User Story:** As a developer, I want pointer records to reflect the latest job state, so that query results are always accurate without reading the metadata record.

#### Acceptance Criteria

1. WHEN transitionJob is called with a new state, THE Import_System SHALL update the corresponding Pointer_Record fields: state, progress, lastUpdatedAt, and error.
2. WHEN transitionJob changes the lastUpdatedAt value, THE Import_System SHALL delete the old Pointer_Record and write a new Pointer_Record with the updated Pointer_SK to maintain correct sort order.
3. IF the Job_Metadata_Record does not exist during a transition, THEN THE Import_System SHALL throw an error without creating or modifying any Pointer_Record.

### Requirement 3: Pointer Record Update on Phase Change

**User Story:** As a developer, I want phase changes to update the pointer record's sort key, so that time-sorted queries reflect the latest activity.

#### Acceptance Criteria

1. WHEN updateJobPhase is called, THE Import_System SHALL delete the old Pointer_Record and write a new Pointer_Record with the updated lastUpdatedAt in the Pointer_SK.
2. WHEN updateJobPhase is called, THE Import_System SHALL update the Pointer_Record fields: phase and lastUpdatedAt.

### Requirement 4: Query-Based Active Job Lookup

**User Story:** As a developer, I want getRunningOrPausedJob to use a Query operation instead of a Scan, so that the lookup completes in constant time regardless of table size.

#### Acceptance Criteria

1. THE Import_System SHALL retrieve active jobs by issuing a DynamoDB Query on PK `JOBS` with a SK begins_with condition using the relevant Import_Prefix.
2. THE Import_System SHALL filter Query results to return only Pointer_Records where state equals `running` or `paused`.
3. THE Import_System SHALL return the job data directly from the Pointer_Record fields without issuing a follow-up GetItem on the Job_Metadata_Record.

### Requirement 5: Query-Based Most Recent Job Lookup

**User Story:** As a developer, I want getMostRecentJob to use a Query with reverse sort order, so that it returns the latest job in a single page read.

#### Acceptance Criteria

1. THE Import_System SHALL retrieve the most recent job by issuing a DynamoDB Query on PK `JOBS` with SK begins_with the relevant Import_Prefix, using ScanIndexForward set to false and Limit set to 1.
2. THE Import_System SHALL return the job data directly from the Pointer_Record fields without issuing a follow-up GetItem on the Job_Metadata_Record.

### Requirement 6: Query-Based History Listing

**User Story:** As a developer, I want the import history endpoint to use a Query with cursor-based pagination, so that it scales efficiently as the number of jobs grows.

#### Acceptance Criteria

1. THE Import_System SHALL retrieve history jobs by issuing a DynamoDB Query on PK `JOBS` with SK begins_with the relevant Import_Prefix, using ScanIndexForward set to false.
2. THE Import_System SHALL support pagination by passing the DynamoDB LastEvaluatedKey as the nextToken to the client and accepting it as ExclusiveStartKey on subsequent requests.
3. THE Import_System SHALL limit each page to the requested pageSize (20, 50, or 100 records).
4. THE Import_System SHALL return job data directly from Pointer_Record fields without issuing follow-up GetItem calls on Job_Metadata_Records.

### Requirement 7: Cancel Updates Pointer State

**User Story:** As a developer, I want cancellation to update the pointer record to "cancelled" state rather than deleting it, so that cancelled jobs remain visible in history.

#### Acceptance Criteria

1. WHEN a cancel operation succeeds, THE Import_System SHALL update the corresponding Pointer_Record state field to `cancelled`.
2. WHEN a cancel operation updates the pointer state, THE Import_System SHALL delete the old Pointer_Record and write a new Pointer_Record with the updated lastUpdatedAt in the Pointer_SK.
3. THE Import_System SHALL retain the Pointer_Record after cancellation so the job appears in history queries.

### Requirement 8: Migration Script for Existing Jobs

**User Story:** As a developer, I want a one-time migration script that backfills pointer records for all existing import jobs, so that the new query pattern returns complete results immediately after deployment.

#### Acceptance Criteria

1. THE Migration_Script SHALL scan all existing Job_Metadata_Records across all three Import_Prefix values (ITEM_IMPORT, SALE_IMPORT, ACCOUNT_IMPORT).
2. THE Migration_Script SHALL create a Pointer_Record for each existing Job_Metadata_Record using the job's lastUpdatedAt and jobId in the Pointer_SK.
3. THE Migration_Script SHALL be idempotent, allowing safe re-execution without creating duplicate Pointer_Records.
4. THE Migration_Script SHALL log progress including the total number of jobs found and the number of Pointer_Records created.
5. IF a Pointer_Record already exists for a given job, THEN THE Migration_Script SHALL skip that job without error.

### Requirement 9: JobState Type Extension

**User Story:** As a developer, I want the JobState type to include "cancelled" as a valid state, so that the type system reflects the new cancel behaviour.

#### Acceptance Criteria

1. THE Import_System SHALL define `cancelled` as a valid value in the JobState type.
2. THE Import_System SHALL treat `cancelled` as a terminal state with no valid outbound transitions.
3. WHEN getRunningOrPausedJob filters for active jobs, THE Import_System SHALL exclude jobs with state `cancelled`.
