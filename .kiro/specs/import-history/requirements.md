# Requirements Document

## Introduction

The Import History feature extends the existing Imports page (`/imports`) to display historical import job data for each import type (items, sales, accounts). Each import type card gains a toggleable history section showing paginated summary rows of past jobs, with drill-down capability into full report and failure details for any historical job. On the backend, a new paginated endpoint returns historical jobs using DynamoDB cursor-based pagination (ExclusiveStartKey/LastEvaluatedKey).

## Glossary

- **Import_History_Section**: A collapsible section within each ImportTypeCard that displays a paginated list of historical import jobs for that import type.
- **History_Job_Summary**: A summary row representing a single historical import job, displaying the date, status, and progress counters (processed, imported, skipped, failed).
- **Import_History_API**: The backend endpoint (`GET /api/import/{type}/history`) that returns a paginated list of historical jobs for a given import type.
- **Pagination_Token**: An opaque string representing the DynamoDB LastEvaluatedKey, used as a cursor to fetch the next page of results.
- **Import_Type**: One of three categories of data being imported: items, sales, or accounts.
- **Import_Job**: A record in the import DynamoDB table representing a single import run, with state, phase, progress counters, and timestamps.
- **Import_Report**: A summary record containing final progress counts, elapsed time, and failure details for a completed job.
- **ImportTypeCard**: The existing React card component that displays the current status of a single import type on the Imports page.
- **PaginationControls**: The existing shared React component that renders previous/next navigation and page-size selection.

## Requirements

### Requirement 1: Toggle History Visibility

**User Story:** As an admin, I want to expand a history section on each import type card, so that I can view past import jobs without cluttering the current status view.

#### Acceptance Criteria

1. THE ImportTypeCard SHALL display a toggle control labelled "History" that expands or collapses the Import_History_Section.
2. WHEN the admin activates the history toggle, THE Import_History_Section SHALL become visible and THE Import_History_API SHALL be called to fetch the first page of historical jobs for that import type.
3. WHEN the admin deactivates the history toggle, THE Import_History_Section SHALL be hidden and outstanding fetch requests for that import type history SHALL be cancelled.
4. WHEN the Imports page loads, THE Import_History_Section SHALL be in the collapsed state for all import types.

### Requirement 2: Display History Job Summaries

**User Story:** As an admin, I want to see a summary of each past import job (date, status, progress counters), so that I can quickly assess historical import health.

#### Acceptance Criteria

1. THE Import_History_Section SHALL display a list of History_Job_Summary rows ordered by most recent first.
2. THE History_Job_Summary SHALL display: the job start date and time, the job state (running, paused, failed, complete), and the progress counters (processed, imported, skipped, failed).
3. THE History_Job_Summary SHALL use the same colour-coded status indicators used by the ImportTypeCard for job state.
4. WHEN the Import_History_API returns an empty list for an import type, THE Import_History_Section SHALL display a message indicating no historical jobs exist.

### Requirement 3: Drill-Down into Job Details

**User Story:** As an admin, I want to expand a historical job row to see its full report and failure details, so that I can investigate past issues without leaving the page.

#### Acceptance Criteria

1. THE History_Job_Summary SHALL be expandable to reveal a detail view for that job.
2. WHEN the admin expands a History_Job_Summary for a job in the complete state, THE Import_History_Section SHALL display the Import_Report data including elapsed time, final progress counts, and failure entries.
3. WHEN the admin expands a History_Job_Summary for a job in the failed state with a job-level error, THE Import_History_Section SHALL display the error message.
4. IF the Import_Report indicates failures were truncated, THEN THE Import_History_Section SHALL display the total number of failures and a message indicating truncation.
5. THE Import_History_Section SHALL sanitize error messages before display, removing stack traces and internal file paths.

### Requirement 4: Paginated History Navigation

**User Story:** As an admin, I want to page through historical jobs in manageable chunks, so that the interface remains responsive even with hundreds of past jobs.

#### Acceptance Criteria

1. THE Import_History_API SHALL accept a `pageSize` query parameter with a value of 20, 50, or 100, defaulting to 20.
2. THE Import_History_API SHALL accept an optional `nextToken` query parameter representing the Pagination_Token for cursor-based pagination.
3. THE Import_History_API SHALL return a response containing a `jobs` array and an optional `nextToken` field (present when more results exist).
4. THE Import_History_Section SHALL display PaginationControls below the job list when history is visible.
5. WHEN the admin selects "Next", THE Import_History_Section SHALL fetch the next page using the Pagination_Token from the previous response.
6. WHEN the admin selects "Previous", THE Import_History_Section SHALL navigate to the previously viewed page from client-side page history.
7. WHILE a history page is being fetched, THE Import_History_Section SHALL display a loading indicator and disable pagination controls.

### Requirement 5: Backend History Endpoint

**User Story:** As a frontend developer, I want a paginated GET endpoint that returns historical jobs for a given import type, so that the history UI can fetch data efficiently.

#### Acceptance Criteria

1. THE Import_History_API SHALL expose a GET endpoint at `/api/import/{type}/history` where `{type}` is one of items, sales, or accounts.
2. THE Import_History_API SHALL scan the import DynamoDB table for job metadata records matching the prefix for the requested import type, sorted by lastUpdatedAt descending.
3. THE Import_History_API SHALL return at most `pageSize` job records per response.
4. WHEN more results exist beyond the current page, THE Import_History_API SHALL include a `nextToken` field in the response containing an opaque pagination cursor.
5. WHEN a job in the response has state "complete", THE Import_History_API SHALL include the Import_Report data for that job in the response.
6. THE Import_History_API SHALL require authentication via the existing API Gateway authorizer.
7. IF the `type` path parameter is not one of items, sales, or accounts, THEN THE Import_History_API SHALL return HTTP 400 with an error message "Invalid import type".
8. IF the `pageSize` parameter is not 20, 50, or 100, THEN THE Import_History_API SHALL default to 20.

### Requirement 6: History Error Handling

**User Story:** As an admin, I want to see clear feedback when history data cannot be loaded, so that I understand the issue and can retry.

#### Acceptance Criteria

1. IF the Import_History_API returns a non-success response, THEN THE Import_History_Section SHALL display a user-friendly error message and a retry button within the history section.
2. IF a network error occurs when fetching history data, THEN THE Import_History_Section SHALL display a connectivity error message.
3. THE Import_History_Section SHALL not display raw error stack traces or internal details to the admin.
4. WHEN the admin clicks the retry button, THE Import_History_Section SHALL re-fetch the current page of history data.

### Requirement 7: Independent Per-Type History State

**User Story:** As an admin, I want each import type's history to operate independently, so that expanding one type's history does not affect the others.

#### Acceptance Criteria

1. THE Import_History_Section for each import type SHALL maintain independent toggle state, pagination position, and loading state.
2. WHEN the admin toggles history for one import type, THE Import_History_Section for other import types SHALL remain unchanged.
3. THE Import_History_Section for each import type SHALL fetch data independently from the Import_History_API using its own type parameter.
