# Requirements Document

## Introduction

The Import Monitor is an admin page in the shop frontend that provides visibility into the ConsignCloud import/sync pipeline. It allows operators to view the status of import jobs (items, sales, accounts), monitor progress counters (processed, imported, skipped, failed), review failure details from completed reports, and trigger manual actions (start, resume, cancel) on import jobs.

## Glossary

- **Import_Monitor_Page**: The frontend page within the shop admin interface that displays import job status and progress information.
- **Import_Job**: A record in the import DynamoDB table representing a single import run. Has a state (running, paused, failed, complete), a phase (fetch, sync), progress counters, and timestamps.
- **Import_Type**: One of three categories of data being imported: items, sales, or accounts. Each type has its own independent job lifecycle.
- **Progress_Counters**: A set of four numeric fields (processed, imported, skipped, failed) tracked for each import job.
- **Import_Report**: A summary record written to the import table when a job completes, containing final progress counts, elapsed time, and failure details (up to 100 entries).
- **Import_API**: The backend API endpoints (`/api/import/{type}/status`, `/api/import/{type}/start`, etc.) that expose import job data and actions.
- **Job_State**: The current lifecycle state of an import job: `running`, `paused`, `failed`, or `complete`.
- **Job_Phase**: The current processing stage within an import job: `fetch` (pulling data from ConsignCloud) or `sync` (writing to the shop table).

## Requirements

### Requirement 1: Display Import Job Status

**User Story:** As an admin, I want to see the current status of each import type (items, sales, accounts), so that I can monitor whether imports are running, paused, failed, or complete.

#### Acceptance Criteria

1. WHEN the Import_Monitor_Page loads, THE Import_Monitor_Page SHALL request the current job status for each Import_Type (items, sales, accounts) from the Import_API.
2. THE Import_Monitor_Page SHALL display for each Import_Type: the Job_State, the Job_Phase, the startedAt timestamp, and the lastUpdatedAt timestamp.
3. WHEN no active or recent job exists for an Import_Type, THE Import_Monitor_Page SHALL display an indication that no job is available for that type.
4. THE Import_Monitor_Page SHALL use colour-coded status indicators to visually distinguish between running, paused, failed, and complete states.

### Requirement 2: Display Progress Counters

**User Story:** As an admin, I want to see how many records have been processed, imported, skipped, and failed for each import job, so that I can assess the health of the sync pipeline.

#### Acceptance Criteria

1. WHILE an Import_Job is in the running state, THE Import_Monitor_Page SHALL display the Progress_Counters (processed, imported, skipped, failed) for that job.
2. WHILE an Import_Job is in the paused or failed state, THE Import_Monitor_Page SHALL display the last known Progress_Counters for that job.
3. WHEN an Import_Job is in the complete state, THE Import_Monitor_Page SHALL display the final Progress_Counters from the Import_Report.

### Requirement 3: Display Failure Details

**User Story:** As an admin, I want to see specific error messages from failed records in a completed import, so that I can investigate and resolve data issues.

#### Acceptance Criteria

1. WHEN an Import_Job is in the complete state and the Import_Report contains failures, THE Import_Monitor_Page SHALL display the failure entries (item/record identifier and error message).
2. IF the Import_Report indicates failures were truncated, THEN THE Import_Monitor_Page SHALL display a message indicating the total number of failures and that the list is truncated.
3. WHEN an Import_Job is in the failed state with an error message, THE Import_Monitor_Page SHALL display the job-level error message.

### Requirement 4: Auto-Refresh Job Status

**User Story:** As an admin, I want the import status to refresh periodically while a job is running, so that I can observe progress without manually reloading the page.

#### Acceptance Criteria

1. WHILE at least one Import_Job is in the running state, THE Import_Monitor_Page SHALL poll the Import_API for updated status at an interval of 10 seconds.
2. WHEN all Import_Jobs are in a terminal state (complete or failed) or no jobs are active, THE Import_Monitor_Page SHALL stop automatic polling.
3. THE Import_Monitor_Page SHALL provide a manual refresh button that fetches updated status on demand regardless of polling state.

### Requirement 5: Navigation Integration

**User Story:** As an admin, I want to access the import monitor from the main navigation menu, so that I can quickly check import status.

#### Acceptance Criteria

1. THE Import_Monitor_Page SHALL be accessible via a navigation item labelled "Imports" in the admin navigation menu.
2. THE Import_Monitor_Page SHALL be accessible at the URL path `/imports`.

### Requirement 6: Start Import Action

**User Story:** As an admin, I want to manually trigger an import for a specific type, so that I can run imports outside the scheduled 15-minute interval.

#### Acceptance Criteria

1. THE Import_Monitor_Page SHALL display a "Start Import" button for each Import_Type.
2. WHEN the admin clicks "Start Import" for an Import_Type, THE Import_Monitor_Page SHALL call the corresponding start endpoint on the Import_API.
3. IF the Import_API returns a 409 conflict (job already active), THEN THE Import_Monitor_Page SHALL display a message indicating that an import is already running for that type.
4. WHILE an Import_Job is in the running state for an Import_Type, THE Import_Monitor_Page SHALL disable the "Start Import" button for that type.

### Requirement 7: Resume and Cancel Actions

**User Story:** As an admin, I want to resume a paused or failed import, or cancel a running import, so that I can manage the import lifecycle.

#### Acceptance Criteria

1. WHILE an Import_Job is in the paused or failed state, THE Import_Monitor_Page SHALL display a "Resume" button for that Import_Type.
2. WHEN the admin clicks "Resume", THE Import_Monitor_Page SHALL call the resume endpoint on the Import_API for that Import_Type and job.
3. WHILE an Import_Job is in the running state, THE Import_Monitor_Page SHALL display a "Cancel" button for that Import_Type.
4. WHEN the admin clicks "Cancel", THE Import_Monitor_Page SHALL call the cancel endpoint on the Import_API for that Import_Type and job.
5. IF the Import_API returns an error for a resume or cancel action, THEN THE Import_Monitor_Page SHALL display the error message to the admin.

### Requirement 8: Error Handling

**User Story:** As an admin, I want to see clear error messages when the import monitor cannot load data, so that I can understand connectivity or authorization issues.

#### Acceptance Criteria

1. IF the Import_API returns a non-success response when fetching status, THEN THE Import_Monitor_Page SHALL display a user-friendly error message and a retry button.
2. IF a network error occurs when communicating with the Import_API, THEN THE Import_Monitor_Page SHALL display a connectivity error message.
3. THE Import_Monitor_Page SHALL not display raw error stack traces or internal details to the admin.

### Requirement 9: Backend Status Endpoint Enhancement

**User Story:** As a frontend developer, I want a single GET endpoint that returns the status of all import types at once, so that the monitor page can fetch all data in one request.

#### Acceptance Criteria

1. THE Import_API SHALL expose a GET endpoint at `/api/import/status` that returns the current or most recent job for each Import_Type (items, sales, accounts).
2. WHEN a job is in the complete state, THE Import_API SHALL include the Import_Report data in the response for that Import_Type.
3. WHEN no job exists for an Import_Type, THE Import_API SHALL return null for that type in the response.
4. THE Import_API SHALL require authentication (via the existing authorizer) for the status endpoint.
