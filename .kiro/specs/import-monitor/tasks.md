# Implementation Plan: Import Monitor

## Overview

Add an Import Monitor page to the shop admin interface. The implementation follows this order: infrastructure (API Gateway route for new GET endpoint), backend (aggregated status handler + route registration in import-handler), frontend (types, API client, utility functions, polling hook, card component, page component, navigation), and tests.

Backend code is TypeScript in `projects/shop-api/src/`. Frontend code is TypeScript/React in `projects/shop/src/features/imports/`. Infrastructure is Terraform in `infrastructure/modules/import/`.

## Tasks

- [x] 1. Infrastructure — API Gateway route for aggregated status endpoint
  - [x] 1.1 Add API Gateway route for `GET /api/import/status` in `infrastructure/modules/import/main.tf`
    - Add `aws_apigatewayv2_route.get_import_status` resource
    - route_key: `GET /api/import/status`
    - target: import integration (`aws_apigatewayv2_integration.import`)
    - authorization_type: `CUSTOM`, authorizer_id: cognito authorizer (via `var.authorizer_id`)
    - _Requirements: 9.1, 9.4_

- [x] 2. Backend — Aggregated import status endpoint
  - [x] 2.1 Create `projects/shop-api/src/import/import-status-handler.ts`
    - Implement `handleImportStatusAll` function
    - For each import type (items, sales, accounts), call the corresponding job manager's `getRunningOrPausedJob()` method
    - If no running/paused job exists, query for the most recent completed job (scan with prefix, sort by `lastUpdatedAt` descending, limit 1)
    - When job state is `complete`, fetch the corresponding import report from the import table (PK: `{PREFIX}#REPORT`, SK: `{jobId}`)
    - Return null for types with no job found
    - Assemble response as `{ items: ImportJobStatus | null, sales: ImportJobStatus | null, accounts: ImportJobStatus | null }`
    - Handle errors gracefully: if one type fails, log and return null for that type rather than failing the entire request
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 2.2 Register route in `projects/shop-api/src/import-handler.ts`
    - Import `handleImportStatusAll` from `./import/import-status-handler.js`
    - Add route: `if (path === "/api/import/status" && method === "GET") { return handleImportStatusAll(event); }`
    - Place the new route before the existing type-specific routes
    - _Requirements: 9.1_

- [x] 3. Checkpoint — Verify backend builds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Frontend — Types and utility functions
  - [x] 4.1 Create `projects/shop/src/features/imports/imports-types.ts`
    - Define `ImportType`, `JobState`, `ImportPhase` type aliases
    - Define `ProgressCounts`, `FailureEntry`, `ImportReport`, `ImportJobStatus`, `ImportStatusResponse`, `ActionButtonStates` interfaces
    - _Requirements: 1.2, 2.1, 3.1_

  - [x] 4.2 Create `projects/shop/src/features/imports/imports-utils.ts`
    - Implement `getStatusColor(state: JobState): string` — return distinct Tailwind color classes for running, paused, failed, complete
    - Implement `getActionButtonStates(job: ImportJobStatus | null): ActionButtonStates` — derive startEnabled, resumeVisible, cancelVisible from job state
    - Implement `shouldPoll(status: ImportStatusResponse | null): boolean` — return true if any non-null job has state "running"
    - Implement `sanitizeErrorMessage(error: string): string` — strip stack traces, file paths, internal prefixes; truncate to 200 chars
    - Implement `formatElapsedTime(seconds: number): string` — format seconds into human-readable duration
    - _Requirements: 1.4, 4.1, 4.2, 6.4, 7.1, 7.3, 8.3_

- [x] 5. Frontend — API client and polling hook
  - [x] 5.1 Create `projects/shop/src/features/imports/imports-api.ts`
    - Implement `fetchImportStatus(options?: { signal?: AbortSignal }): Promise<ImportStatusResponse>` — GET `/api/import/status` with auth headers
    - Implement `startImport(type: ImportType): Promise<{ jobId: string; state: string; phase: string }>` — POST `/api/import/{type}/start`
    - Implement `resumeImport(type: ImportType, jobId: string): Promise<{ jobId: string; state: string; phase: string }>` — POST `/api/import/{type}/resume`
    - Implement `cancelImport(type: ImportType, jobId: string): Promise<void>` — POST `/api/import/{type}/cancel`
    - Follow same auth pattern as existing API clients (fetchAuthSession, include Authorization header, 30s timeout)
    - _Requirements: 1.1, 6.2, 7.2, 7.4_

  - [x] 5.2 Create `projects/shop/src/features/imports/use-import-status.ts`
    - Implement `useImportStatus` hook returning `UseImportStatusResult`
    - Fetch status on mount, poll every 10 seconds while `shouldPoll` returns true
    - Stop polling when all jobs are terminal or no jobs active
    - Expose `refresh()` for manual refresh, `startImport()`, `resumeImport()`, `cancelImport()` action dispatchers
    - Track `actionError` state for failed actions (409 conflict, network errors), expose `clearActionError()`
    - Use AbortController to cancel in-flight requests on unmount
    - _Requirements: 4.1, 4.2, 4.3, 6.2, 6.3, 7.2, 7.4, 8.1, 8.2_

- [x] 6. Frontend — Page components
  - [x] 6.1 Create `projects/shop/src/features/imports/failure-details.tsx`
    - Render a list of `FailureEntry` objects showing itemId and error message
    - Show truncation message when `report.truncated` is true with `report.totalFailures` count
    - Use collapsible/expandable pattern for long failure lists
    - _Requirements: 3.1, 3.2_

  - [x] 6.2 Create `projects/shop/src/features/imports/import-type-card.tsx`
    - Render a card for a single import type with: status indicator (colour-coded), phase, timestamps, progress counters, action buttons, failure details
    - Show "No job available" when job is null
    - Show Start button (disabled when running), Resume button (visible when paused/failed), Cancel button (visible when running)
    - Show job-level error message when state is failed
    - Proper ARIA attributes and keyboard navigation for action buttons
    - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.3, 6.1, 6.4, 7.1, 7.3_

  - [x] 6.3 Create `projects/shop/src/features/imports/imports-page.tsx`
    - Page heading "Imports"
    - Render three `ImportTypeCard` components (items, sales, accounts)
    - Display manual refresh button
    - Loading state while initial data is fetched
    - Error state with retry button on failure
    - Show action error as toast/alert when present
    - Proper ARIA semantics
    - _Requirements: 1.1, 4.3, 6.1, 8.1, 8.2_

  - [x] 6.4 Add Imports entry to navigation and routing
    - Add `{ label: "Imports", path: "/imports", icon: Download }` to `projects/shop/src/config/navigation.ts` (use appropriate lucide-react icon)
    - Position after "Sales" in the navigation array
    - Add `/imports` route to the app router pointing to `ImportsPage`
    - _Requirements: 5.1, 5.2_

- [x] 7. Checkpoint — Verify frontend builds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Tests
  - [x] 8.1 Write unit tests for `import-status-handler.ts`
    - Test returns aggregated status for all three types
    - Test includes report data when job is complete
    - Test returns null for types with no job
    - Test graceful degradation when one job manager fails
    - Mock DynamoDB calls
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 8.2 Write unit tests for `imports-utils.ts`
    - Test `getStatusColor` returns distinct values for each state
    - Test `getActionButtonStates` for null, running, paused, failed, complete
    - Test `shouldPoll` with various combinations of job states
    - Test `sanitizeErrorMessage` strips stack traces and file paths
    - Test `formatElapsedTime` with various durations
    - _Requirements: 1.4, 4.1, 4.2, 6.4, 7.1, 7.3, 8.3_

  - [x] 8.3 Write property test for status color mapping
    - **Property 1: Status color mapping produces distinct values for each state**
    - Use `fast-check` to generate arbitrary `JobState` values
    - Assert `getStatusColor` always returns non-empty string and no two states map to same color
    - **Validates: Requirements 1.4**

  - [x] 8.4 Write property test for polling logic
    - **Property 4: Polling is active if and only if at least one job is running**
    - Use `fast-check` to generate arbitrary `ImportStatusResponse` objects (each slot null or valid `ImportJobStatus` with any state)
    - Assert `shouldPoll` returns true iff at least one non-null job has state "running"
    - **Validates: Requirements 4.1, 4.2**

  - [x] 8.5 Write property test for action button states
    - **Property 5: Action button states are correctly derived from job state**
    - Use `fast-check` to generate arbitrary `ImportJobStatus | null` values
    - Assert `getActionButtonStates` returns correct startEnabled, resumeVisible, cancelVisible for each state
    - **Validates: Requirements 6.4, 7.1, 7.3**

  - [x] 8.6 Write property test for error message sanitization
    - **Property 6: Error messages are sanitized**
    - Use `fast-check` to generate arbitrary strings containing stack trace patterns
    - Assert `sanitizeErrorMessage` result does not contain stack traces, file paths, or internal error prefixes
    - **Validates: Requirements 8.3**

  - [x] 8.7 Write unit tests for `imports-api.ts`
    - Test `fetchImportStatus` handles success, error responses, and network errors
    - Test `startImport` handles 200 success and 409 conflict
    - Test `resumeImport` and `cancelImport` handle success and error responses
    - Mock `fetch` and `fetchAuthSession`
    - _Requirements: 6.2, 6.3, 7.2, 7.4, 7.5, 8.1, 8.2_

  - [x] 8.8 Write unit tests for `import-type-card.tsx`
    - Test renders status indicator with correct color for each state
    - Test shows progress counters for running, paused, failed, complete jobs
    - Test shows correct action buttons based on job state
    - Test shows "No job available" when job is null
    - Test shows failure details when report has failures
    - Test shows truncation message when applicable
    - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 6.1, 6.4, 7.1, 7.3_

  - [x] 8.9 Write unit tests for `imports-page.tsx`
    - Test page heading is "Imports"
    - Test renders three import type cards
    - Test loading state displays
    - Test error state with retry button
    - Test manual refresh button present
    - _Requirements: 1.1, 4.3, 8.1_

  - [x] 8.10 Write unit tests for navigation integration
    - Test "Imports" entry present in navigation items
    - Test route navigates to `/imports`
    - _Requirements: 5.1, 5.2_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Run full test suites: `vitest --run` in both `projects/shop` and `projects/shop-api`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1, 4, 5, 6)
- Properties 2 and 3 from the design are better validated with example-based unit tests (component rendering) rather than PBT
- The design specifies TypeScript throughout — no language selection needed
- The import lambda is a separate function from the monolambda, defined in `infrastructure/modules/import/main.tf` with its own API Gateway integration
- The new `GET /api/import/status` route uses the existing import integration, not the monolambda integration
- Existing job managers (`generic-job-manager.ts`) already provide `getRunningOrPausedJob()` which is reused by the status handler
- The import report reader needs a new `getReport` function to read from `{PREFIX}#REPORT` partition key

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["4.1", "4.2"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3", "6.4"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.7", "8.8", "8.9", "8.10"] },
    { "id": 7, "tasks": ["8.3", "8.4", "8.5", "8.6"] }
  ]
}
```
