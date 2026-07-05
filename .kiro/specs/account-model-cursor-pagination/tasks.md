# Implementation Plan: Account Model & Cursor-Based Pagination

## Overview

Refactor the accounts data model from natural-key PKs to UUID-based PKs, add an overloaded GSI (`GSI1`) for cursor-based pagination, rewrite the list-accounts API from full-table Scan to targeted Query, and update the frontend to use forward/backward cursor navigation with page caching. This replaces the existing scan+sort+offset approach entirely.

## Tasks

- [x] 1. Infrastructure: Add GSI1 to DynamoDB table
  - [x] 1.1 Add GSI1 global secondary index to Shop_Table Terraform resource
    - Add `GSI1PK` (String) and `GSI1SK` (String) attribute definitions to `infrastructure/dynamodb.tf`
    - Add a `global_secondary_index` block with name `GSI1`, hash_key `GSI1PK`, range_key `GSI1SK`, projection_type `ALL`
    - Preserve existing `sourceId-index` GSI unchanged
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 2. Backend: Update import process to write new key pattern
  - [x] 2.1 Refactor sync-to-shop-table creation path for UUID-based PK and GSI1 attributes
    - In `projects/shop-api/src/import/sync-to-shop-table.ts`, change `PK` from `ACCOUNT#<paddedNumber>` to `ACCOUNT#<uuid>`
    - Add `GSI1PK = "ACCOUNT"` and `GSI1SK = <zero_padded_account_number>` to PutCommand Item
    - Add `shopUid = <zero_padded_account_number>` attribute
    - Ensure `uuid` attribute stores the same UUID (without prefix)
    - Update TAG# items to use the new UUID-based PK
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 7.1, 7.2, 7.4, 7.5_

  - [x] 2.2 Refactor sync-to-shop-table update path to preserve immutable key fields
    - Ensure update path does NOT overwrite `PK`, `GSI1PK`, or `GSI1SK`
    - Retain existing UpdateCommand pattern for mutable attributes only
    - _Requirements: 1.5, 7.3_

  - [ ]* 2.3 Write property test: Account record shape invariant (Property 1)
    - **Property 1: Account record shape invariant**
    - Test that for any valid import input, the produced record has correct PK pattern, SK, shopUid, GSI1PK, GSI1SK, sourceId, and uuid
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.2, 2.3, 7.1, 7.2, 7.4, 7.5**

  - [ ]* 2.4 Write property test: Update preserves immutable fields (Property 2)
    - **Property 2: Update preserves immutable fields**
    - Test that for any existing record and any mutable field changes, PK, GSI1PK, and GSI1SK remain unchanged
    - **Validates: Requirements 1.5, 7.3**

- [x] 3. Backend: Update CRUD routes for UUID-based PK lookup
  - [x] 3.0 Refactor create-account, update-account, and delete-account routes for UUID-based keys
    - `create-account.ts`: Already generates a UUID — change PK from `buildAccountPk(number)` to `ACCOUNT#<uuid>`, add `shopUid`, `GSI1PK`, `GSI1SK` attributes
    - `update-account.ts`: Look up account by account number via GSI1 Query (to get the UUID-based PK), then UpdateCommand on the resolved PK
    - `delete-account.ts`: Look up account by account number via GSI1 Query (to get the UUID-based PK), then delete METADATA + TAG items using resolved PK
    - Update `pk-utils.ts` — `buildAccountPk` is no longer needed for CRUD operations; add a `buildAccountUuidPk(uuid)` helper if useful
    - _Requirements: 1.1, 2.2, 2.3_

- [x] 4. Backend: Rewrite list-accounts API for cursor-based pagination
  - [x] 4.1 Implement cursor encoding/decoding utilities
    - Create `encodeCursor` and `decodeCursor` functions in `projects/shop-api/src/routes/list-accounts.ts` (or a shared utility)
    - Use `base64url` encoding of JSON-serialized `LastEvaluatedKey`
    - _Requirements: 3.7_

  - [x] 4.2 Rewrite list-accounts handler to use GSI1 Query with cursor
    - Replace full-table Scan with QueryCommand on `GSI1` using `GSI1PK = "ACCOUNT"`, `ScanIndexForward = true`, `Limit = pageSize`
    - Accept `pageSize` (20|50|100, default 20) and optional `cursor` query parameter
    - Decode cursor into `ExclusiveStartKey` when provided
    - Return `{ accounts, nextCursor, hasMore }` response shape
    - Remove all sorting logic, `pageIndex` handling, and `ScanCommand` usage
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.11, 3.12_

  - [x] 4.3 Add input validation and error handling for new parameters
    - Reject invalid `pageSize` values with HTTP 400
    - Reject invalid `cursor` values (bad base64, bad JSON) with HTTP 400
    - Reject legacy parameters (`pageIndex`, `sortColumn`, `sortDirection`) with HTTP 400
    - _Requirements: 3.9, 3.10, 3.11_

  - [ ]* 4.4 Write property test: Page size validation (Property 3)
    - **Property 3: Page size validation**
    - Test that only values 20, 50, 100 are accepted; all others return 400
    - **Validates: Requirements 3.1, 3.10**

  - [ ]* 4.5 Write property test: Cursor round-trip encoding (Property 4)
    - **Property 4: Cursor round-trip encoding**
    - Test that for any valid LastEvaluatedKey object, encode then decode produces a deeply equal object
    - **Validates: Requirements 3.7**

  - [ ]* 4.6 Write property test: Invalid cursor rejection (Property 5)
    - **Property 5: Invalid cursor rejection**
    - Test that any string that is not valid base64url-encoded JSON returns HTTP 400
    - **Validates: Requirements 3.9**

- [x] 5. Checkpoint
  - Ensure all backend tests pass, ask the user if questions arise.

- [x] 6. Frontend: Update types and API client for cursor-based pagination
  - [x] 6.1 Update accounts-types.ts with cursor-based pagination types
    - Replace `PaginationQueryParams` and `PaginatedAccountsResponse` with `CursorPaginationParams`, `CursorPaginatedResponse`, `CachedPage`, and `UseCursorPaginatedAccountsResult` interfaces
    - Keep `PageSize` type as-is
    - Remove sort-related types from pagination interfaces
    - _Requirements: 3.6, 4.1, 4.2, 5.1_

  - [x] 6.2 Rewrite accounts-api.ts for cursor-based fetching
    - Replace `buildPaginatedAccountsUrl` and `fetchPaginatedAccounts` with a new `fetchCursorPaginatedAccounts` function
    - Accept `{ pageSize, cursor? }` and return `{ accounts, nextCursor, hasMore }`
    - Remove sort-related URL parameter construction
    - _Requirements: 3.6, 4.1_

- [x] 7. Frontend: Rewrite pagination hook with page cache
  - [x] 7.1 Rewrite use-paginated-accounts.ts with cursor-based state and page caching
    - Maintain `pageCache: CachedPage[]` and `currentPageIndex` state
    - Implement `goNext`: use cached page if available, otherwise fetch with stored `nextCursor`
    - Implement `goPrevious`: decrement index, read from cache
    - Implement `setPageSize`: clear cache, fetch first page with new size
    - Expose `{ accounts, loading, error, hasMore, hasPrevious, pageSize, goNext, goPrevious, setPageSize, retry }`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.2, 5.3_

  - [ ]* 7.2 Write property test: Page cache avoids redundant fetches (Property 7)
    - **Property 7: Page cache avoids redundant fetches**
    - Test that forward then backward navigation to a previously fetched page uses cached data without API call
    - **Validates: Requirements 4.5, 4.6**

  - [ ]* 7.3 Write property test: Page size change invalidates cache (Property 8)
    - **Property 8: Page size change invalidates cache**
    - Test that changing page size clears the cache and fetches the first page with the new size
    - **Validates: Requirements 4.7, 5.3**

- [x] 8. Frontend: Update pagination controls and table components
  - [x] 8.1 Rewrite pagination-controls.tsx for cursor-based navigation
    - Remove "Page X of Y" display and `totalCount` prop
    - Accept `hasPrevious`, `hasMore`, `onNext`, `onPrevious`, `pageSize`, `onPageSizeChange` props
    - Disable Previous when `hasPrevious` is false, disable Next when `hasMore` is false
    - Retain page size selector (20, 50, 100)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.8, 5.1, 5.3_

  - [x] 8.2 Remove sorting from accounts-table.tsx
    - Remove `SortingState`, `onSortingChange`, `SortIndicator`, `manualSorting` config
    - Remove sort-related props (`sortColumn`, `sortDirection`, `onSortingChange`)
    - Remove sort button rendering from column headers
    - Update `AccountsTableProps` to use cursor-based pagination props
    - Wire new `PaginationControls` props
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 8.3 Write property test: Navigation button state reflects position (Property 9)
    - **Property 9: Navigation button state reflects position**
    - Test that Previous is disabled iff on first page, Next is disabled iff hasMore is false
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 8.4 Write property test: Display order preserves API order (Property 10)
    - **Property 10: Display order preserves API order**
    - Test that accounts table renders rows in the same order as the API response array
    - **Validates: Requirements 6.1**

- [x] 9. Frontend: Wire updated components in accounts page
  - [x] 9.1 Update accounts page to use new hook and pass cursor-based props to table
    - Replace `usePaginatedAccounts` usage with new cursor-based hook return values
    - Remove sorting state and callbacks from the page component
    - Pass `goNext`, `goPrevious`, `hasMore`, `hasPrevious`, `pageSize`, `setPageSize` to child components
    - _Requirements: 4.1, 4.2, 5.1, 6.2, 6.3_

- [x] 10. Cleanup: Remove legacy pagination code
  - [x] 10.1 Remove unused legacy types, functions, and imports
    - Remove `PaginationQueryParams`, `PaginatedAccountsResponse` if still present
    - Remove `buildPaginatedAccountsUrl`, old `fetchPaginatedAccounts` if not already replaced
    - Remove `parsePaginationParams` and related sort/offset types from backend
    - Remove `SortIndicator` component and any unused sorting imports
    - _Requirements: 3.11, 3.12, 6.2, 6.3_

- [x] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Infrastructure (task 1) must be applied before backend changes can be tested against a real table
- The import process (task 2) must be deployed before list-accounts can return data in the new format
- Frontend tasks (5–8) depend on the API contract being finalized (task 3)
- Property 6 (Pagination sequential consistency) is an integration-level property best validated through the backend unit tests in task 3.2 with mocked DynamoDB responses

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.0", "4.2", "4.5"] },
    { "id": 3, "tasks": ["2.4", "4.3", "4.4", "4.6", "6.1"] },
    { "id": 4, "tasks": ["6.2", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "8.1", "8.2"] },
    { "id": 6, "tasks": ["8.3", "8.4", "9.1"] },
    { "id": 7, "tasks": ["10.1"] }
  ]
}
```
