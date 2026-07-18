# Implementation Plan: Import History

## Overview

Extend the existing Imports page with a per-type collapsible history section showing paginated historical import jobs. Add a backend GET endpoint (`/api/import/{type}/history`) using DynamoDB cursor-based pagination, and integrate into the existing `ImportTypeCard` component. Implementation uses TypeScript throughout (frontend React + backend Lambda handler).

## Tasks

- [x] 1. Add history types and pure utility functions
  - [x] 1.1 Extend imports-types.ts with history interfaces
    - Add `HistoryJobSummary`, `ImportHistoryResponse`, and `ImportHistoryParams` interfaces to `projects/shop/src/features/imports/imports-types.ts`
    - _Requirements: 2.2, 4.3, 5.1_

  - [x] 1.2 Create import-history-utils.ts with pure utility functions
    - Create `projects/shop/src/features/imports/import-history-utils.ts`
    - Implement `normalizePageSize`, `isValidImportType`, `sortJobsByDate`, and `createPageStack` functions
    - _Requirements: 4.1, 5.2, 5.7, 5.8_

  - [x] 1.3 Write unit tests for import-history-utils.ts
    - Create `projects/shop/src/features/imports/import-history-utils.test.ts`
    - Test `normalizePageSize` with valid/invalid values, `isValidImportType` with valid/invalid strings, `sortJobsByDate` with various orderings, `createPageStack` push/pop/peek/clear
    - _Requirements: 4.1, 5.2, 5.7, 5.8_

  - [x] 1.4 Write property tests for import-history-utils.ts
    - Create `projects/shop/src/features/imports/import-history-utils.property.test.ts`
    - **Property 1: Jobs sorted by date descending**
    - **Validates: Requirements 2.1, 5.2**
    - **Property 4: PageSize normalisation defaults invalid values to 20**
    - **Validates: Requirements 4.1, 5.8**
    - **Property 8: Invalid import type returns error**
    - **Validates: Requirements 5.7**
    - **Property 10: Page stack navigation integrity**
    - **Validates: Requirements 4.6**

- [x] 2. Implement backend history handler
  - [x] 2.1 Create import-history-handler.ts
    - Create `projects/shop-api/src/import/import-history-handler.ts`
    - Implement `handleImportHistory` function following the `import-status-handler.ts` pattern
    - Extract type from path, validate it, extract pageSize/nextToken from query params
    - Scan DynamoDB for job metadata matching type prefix, sort by lastUpdatedAt descending
    - Return paginated results with optional nextToken; attach report for complete jobs
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8_

  - [x] 2.2 Add history route to import-handler.ts
    - Add route matching for `GET /api/import/{items|sales|accounts}/history` in `projects/shop-api/src/import-handler.ts`
    - Import and dispatch to `handleImportHistory`
    - _Requirements: 5.1, 5.6_

  - [x] 2.3 Write unit tests for import-history-handler.ts
    - Create `projects/shop-api/src/import/__tests__/import-history-handler.test.ts`
    - Test valid type returns paginated jobs sorted by date, invalid type returns 400, pageSize defaults to 20 for invalid values, nextToken pagination, report enrichment for complete jobs, DynamoDB error returns 500
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8_

- [x] 3. Add infrastructure route for history endpoint
  - [x] 3.1 Add API Gateway route for GET /api/import/{type}/history
    - Add three `aws_apigatewayv2_route` resources in `infrastructure/modules/import/main.tf` for `GET /api/import/items/history`, `GET /api/import/sales/history`, `GET /api/import/accounts/history`
    - Use existing integration and authorizer references
    - _Requirements: 5.1, 5.6_

- [x] 4. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement frontend API client and hook
  - [x] 5.1 Add fetchImportHistory to imports-api.ts
    - Add `fetchImportHistory` function to `projects/shop/src/features/imports/imports-api.ts`
    - Accept `ImportHistoryParams` and optional `AbortSignal`, return `ImportHistoryResponse`
    - Follow existing fetch pattern with auth headers, timeout, and error handling
    - _Requirements: 4.1, 4.2, 6.1, 6.2_

  - [x] 5.2 Create use-import-history.ts hook
    - Create `projects/shop/src/features/imports/use-import-history.ts`
    - Manage toggle state, fetch on expand, abort on collapse, page cursor stack for previous navigation, pageSize state, loading/error state with retry
    - _Requirements: 1.2, 1.3, 4.5, 4.6, 4.7, 6.4, 7.1, 7.2_

  - [x] 5.3 Write unit tests for use-import-history.ts
    - Create `projects/shop/src/features/imports/use-import-history.test.ts`
    - Test toggle triggers fetch, collapse aborts request, pagination forward/back, page size change resets to first page, error state and retry
    - _Requirements: 1.2, 1.3, 4.5, 4.6, 4.7, 6.4, 7.1_

- [x] 6. Implement frontend history UI components
  - [x] 6.1 Create import-history-section.tsx
    - Create `projects/shop/src/features/imports/import-history-section.tsx`
    - Render toggle button, loading state, error state with retry, empty state message, job summary list using DataTable, and PaginationControls
    - Use colour-coded status indicators via `getStatusColor` from imports-utils.ts
    - _Requirements: 1.1, 1.4, 2.1, 2.2, 2.3, 2.4, 4.4, 4.7, 6.1, 6.2, 6.3_

  - [x] 6.2 Create import-history-detail.tsx
    - Create `projects/shop/src/features/imports/import-history-detail.tsx`
    - Render expanded detail view for a single historical job: elapsed time, progress counts, failure entries via FailureDetails component, error message for failed jobs, truncation message
    - Sanitize error messages using existing `sanitizeErrorMessage`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 6.3 Integrate ImportHistorySection into ImportTypeCard
    - Modify `projects/shop/src/features/imports/import-type-card.tsx`
    - Add `ImportHistorySection` below the card footer, passing the import type
    - _Requirements: 1.1, 1.4, 7.1, 7.2, 7.3_

  - [x] 6.4 Write component tests for import-history-section.tsx
    - Create `projects/shop/src/features/imports/import-history-section.test.tsx`
    - Test toggle expand/collapse, loading indicator, error state with retry button, empty state message, job list rendering with correct status colours
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.3, 2.4, 4.7, 6.1_

  - [x] 6.5 Write component tests for import-history-detail.tsx
    - Create `projects/shop/src/features/imports/import-history-detail.test.tsx`
    - Test rendering of complete job report fields, failed job error display, truncation message when failures truncated, error sanitization
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend handler pattern closely follows `import-status-handler.ts` (same DynamoDB scan + sort approach)
- Frontend reuses existing shared components: `DataTable`, `PaginationControls`, `FailureDetails`
- Infrastructure adds 3 API Gateway routes (one per import type) following the existing route pattern

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "5.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.3", "5.2"] },
    { "id": 3, "tasks": ["5.3", "6.1", "6.2"] },
    { "id": 4, "tasks": ["6.3", "6.4", "6.5"] }
  ]
}
```
