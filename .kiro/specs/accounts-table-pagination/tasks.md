# Implementation Plan: Accounts Table Pagination

## Overview

Convert the accounts table from client-side data loading and sorting to server-side pagination and sorting. This involves extending the backend `list-accounts` route with pagination/sort query parameters, creating a `usePaginatedAccounts` hook, building a `PaginationControls` component, and updating the `AccountsTable` to use `manualSorting` with server-driven data.

## Tasks

- [x] 1. Extend backend list-accounts route with pagination support
  - [x] 1.1 Add pagination query parameter parsing and validation to `list-accounts.ts`
    - Parse `pageIndex`, `pageSize`, `sortColumn`, `sortDirection` from `event.queryStringParameters`
    - Validate: `pageIndex` >= 0 (default 0), `pageSize` in [20, 50, 100] (default 20), `sortColumn` in allowed list, `sortDirection` in ["asc", "desc"] (default "asc")
    - Return 400 with error details for invalid parameters
    - File: `projects/shop-api/src/routes/list-accounts.ts`
    - _Requirements: 1.3_

  - [x] 1.2 Implement in-memory sort and page slicing in `list-accounts.ts`
    - Sort the scanned accounts array by `sortColumn` and `sortDirection` (case-insensitive string comparison)
    - Compute `offset = pageIndex * pageSize` and slice `[offset, offset + pageSize)`
    - Return `{ accounts: [...], totalCount: N }` where `totalCount` is the full array length before slicing
    - File: `projects/shop-api/src/routes/list-accounts.ts`
    - _Requirements: 1.4_

  - [x] 1.3 Write property tests for API parameter parsing and pagination slicing
    - **Property 2: API Parameter Parsing and Validation**
    - **Property 3: Pagination Slice Correctness**
    - **Validates: Requirements 1.3, 1.4**
    - File: `projects/shop-api/src/routes/list-accounts.property.test.ts`

  - [x] 1.4 Write unit tests for list-accounts pagination
    - Test default parameter values when none provided
    - Test 400 response for invalid pageSize, invalid sortColumn, negative pageIndex
    - Test correct slice with known data
    - Test empty result when pageIndex exceeds available pages
    - File: `projects/shop-api/tests/routes/list-accounts.test.ts`
    - _Requirements: 1.3, 1.4_

- [x] 2. Checkpoint - Backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add frontend paginated accounts API function and types
  - [x] 3.1 Define pagination types in `accounts-types.ts`
    - Add `PaginationQueryParams` interface (`pageIndex`, `pageSize`, `sortColumn?`, `sortDirection?`)
    - Add `PaginatedAccountsResponse` interface (`accounts: Account[]`, `totalCount: number`)
    - Add `PageSize` type alias (`20 | 50 | 100`)
    - File: `projects/shop/src/features/accounts/accounts-types.ts`
    - _Requirements: 1.3, 1.4_

  - [x] 3.2 Implement `fetchPaginatedAccounts` function in `accounts-api.ts`
    - Build URL with query parameters from `PaginationQueryParams`
    - Use `AbortController` with 30s timeout
    - Handle non-2xx, network errors, and timeouts
    - Keep existing `fetchAccounts` for backward compatibility
    - File: `projects/shop/src/features/accounts/accounts-api.ts`
    - _Requirements: 1.2, 1.6_

  - [x] 3.3 Write property test for API request construction
    - **Property 1: API Request Construction**
    - **Validates: Requirements 1.2**
    - File: `projects/shop/src/features/accounts/pagination-logic.property.test.ts`

- [x] 4. Implement `usePaginatedAccounts` hook
  - [x] 4.1 Create `use-paginated-accounts.ts` hook
    - Manage `PaginationState` (pageIndex, pageSize, sortColumn, sortDirection)
    - Fetch on mount and whenever pagination state changes
    - Expose `setPageIndex`, `setPageSize`, `setSorting`, `retry`
    - `setPageSize` and `setSorting` reset `pageIndex` to 0
    - Cancel in-flight requests with `AbortController` when new requests are made
    - File: `projects/shop/src/features/accounts/use-paginated-accounts.ts`
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 2.3, 5.1, 5.2, 5.3_

  - [x] 4.2 Write property tests for pagination state management
    - **Property 4: Page Size Change Resets Page**
    - **Property 8: Sort Change Resets Page**
    - **Validates: Requirements 2.3, 5.1, 5.2, 5.3**
    - File: `projects/shop/src/features/accounts/pagination-logic.property.test.ts`

  - [x] 4.3 Write unit tests for `usePaginatedAccounts` hook
    - Test initial load with default params
    - Test loading state shown during fetch
    - Test error state with retry
    - Test page size change resets page index
    - Test sort change resets page index
    - Test request cancellation on rapid state changes
    - File: `projects/shop/src/features/accounts/use-paginated-accounts.test.ts`
    - _Requirements: 1.1, 1.5, 1.6, 2.3, 5.1_

- [x] 5. Implement `PaginationControls` component
  - [x] 5.1 Create `pagination-controls.tsx` component
    - Render page size selector (dropdown with 20, 50, 100 options)
    - Render Previous/Next buttons
    - Display "Page X of Y" indicator
    - Disable Previous on first page, Next on last page
    - Add ARIA attributes: `aria-label` on nav, `aria-current="page"`, `aria-disabled` on buttons
    - Add accessible label on page size selector
    - Support keyboard navigation on all interactive elements
    - File: `projects/shop/src/features/accounts/pagination-controls.tsx`
    - _Requirements: 2.1, 2.4, 3.1, 3.2, 3.3, 3.4, 6.1, 6.2, 6.4_

  - [x] 5.2 Write property tests for pagination controls logic
    - **Property 5: Total Pages Calculation**
    - **Property 6: Page Navigation**
    - **Property 9: ARIA Attributes Reflect Pagination State**
    - **Validates: Requirements 3.1, 3.5, 3.6, 6.2**
    - File: `projects/shop/src/features/accounts/pagination-logic.property.test.ts`

  - [x] 5.3 Write unit tests for `PaginationControls` component
    - Test page size selector shows 20, 50, 100 options
    - Test default page size is 20
    - Test Previous disabled on first page
    - Test Next disabled on last page
    - Test page info display (Page 1 of 5)
    - Test keyboard navigation on controls
    - Test page size selector has accessible label
    - File: `projects/shop/src/features/accounts/pagination-controls.test.tsx`
    - _Requirements: 2.1, 2.2, 3.2, 3.3, 3.4, 6.1, 6.4_

- [x] 6. Checkpoint - Frontend component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update `AccountsTable` to use server-side sorting and pagination
  - [x] 7.1 Refactor `AccountsTable` to use `manualSorting` and integrate pagination
    - Remove `getSortedRowModel()` from TanStack Table config
    - Add `manualSorting: true` to table options
    - Delegate `onSortingChange` to the hook's `setSorting` (convert TanStack SortingState to column/direction)
    - Accept paginated data and pagination callbacks via props or hook
    - Render `PaginationControls` below the table
    - Move focus to table region after page navigation completes
    - File: `projects/shop/src/features/accounts/accounts-table.tsx`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.3_

  - [x] 7.2 Write property test for sort state cycle
    - **Property 7: Sort State Cycle**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**
    - File: `projects/shop/src/features/accounts/pagination-logic.property.test.ts`

  - [x] 7.3 Write unit tests for updated AccountsTable
    - Test sort indicator displays correctly
    - Test sort cycle (unsorted → asc → desc → unsorted)
    - Test single-sort mode (only one column sorted at a time)
    - Test focus moves to table after navigation
    - File: `projects/shop/src/features/accounts/accounts-table.test.tsx`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 6.3_

- [x] 8. Wire accounts page to use paginated hook
  - [x] 8.1 Update `accounts-page.tsx` to use `usePaginatedAccounts`
    - Replace `useAccounts` with `usePaginatedAccounts` in the accounts page
    - Pass pagination state and callbacks to `AccountsTable`
    - Ensure page size selector visually reflects selected value
    - File: `projects/shop/src/features/accounts/accounts-page.tsx`
    - _Requirements: 1.1, 2.2, 2.4, 3.5, 3.6_

  - [x] 8.2 Write integration tests for full pagination flow
    - Test: mount page → verify initial API call with defaults → render data → paginate → verify next API call
    - Test: sort column → verify reset to page 0 → navigate pages → verify params
    - Test: error → retry → success
    - File: `projects/shop/src/features/accounts/accounts-pagination.integration.test.tsx`
    - _Requirements: 1.1, 1.2, 1.6, 3.5, 3.6, 5.1_

- [x] 9. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `fetchAccounts` and `useAccounts` are preserved for backward compatibility
- `fast-check` is already available in devDependencies for both `shop` and `shop-api`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "3.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "3.3", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 6, "tasks": ["8.2"] }
  ]
}
```
