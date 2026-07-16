# Implementation Plan: Employees Page

## Overview

Add a read-only Employees page to the shop admin interface. The implementation follows this order: infrastructure (GSI2 + API Gateway route), backend (list-employees handler + router registration), frontend (types, API client, pagination hook, columns, page, navigation), write path updates (GSI2 attributes on employee creation), backfill script, and tests.

All backend code is TypeScript in `projects/shop-api/src/`. Frontend code is TypeScript/React in `projects/shop/src/features/employees/`. Infrastructure is Terraform in `infrastructure/`.

## Tasks

- [x] 1. Infrastructure — DynamoDB GSI2 and API Gateway route
  - [x] 1.1 Add GSI2 to DynamoDB table in `infrastructure/dynamodb.tf`
    - Add two `attribute` blocks: `GSI2PK` (S) and `GSI2SK` (S)
    - Add a `global_secondary_index` block: name `GSI2`, hash_key `GSI2PK`, range_key `GSI2SK`, projection_type `ALL`
    - _Requirements: 2.3_

  - [x] 1.2 Add API Gateway route for `GET /api/employees` in `infrastructure/api-gateway.tf`
    - Add `aws_apigatewayv2_route.get_employees` resource
    - route_key: `GET /api/employees`
    - target: monolambda integration
    - authorization_type: `CUSTOM`, authorizer_id: cognito authorizer
    - _Requirements: 6.1, 6.2_

- [x] 2. Backend — List employees endpoint
  - [x] 2.1 Create `projects/shop-api/src/routes/list-employees.ts`
    - Implement `listEmployees` handler following same pattern as `list-accounts.ts`
    - Validate `pageSize` (20 | 50 | 100, default 20), return 400 for invalid values
    - Decode optional `cursor` via `decodeCursor()`, return 400 for invalid cursors
    - Query GSI2 with `GSI2PK = "EMPLOYEES"`, `ScanIndexForward: true`, `Limit: pageSize`
    - Map DynamoDB items to response shape: `{ uuid, name, sourceId, createdAt, updatedAt }`
    - Encode `LastEvaluatedKey` as `nextCursor`, set `hasMore` boolean
    - Return `{ employees, nextCursor, hasMore }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.2_

  - [x] 2.2 Register route in `projects/shop-api/src/router.ts`
    - Import `listEmployees` from `./routes/list-employees.js`
    - Add `"GET /api/employees": listEmployees` to the `routes` map
    - _Requirements: 6.3_

- [x] 3. Frontend — Types, API client, and pagination hook
  - [x] 3.1 Update `projects/shop/src/features/employees/employees-types.ts`
    - Add `CursorPaginatedEmployeesResponse` interface (`employees`, `nextCursor`, `hasMore`)
    - Add `CachedEmployeePage` interface (`employees`, `nextCursor`)
    - Add `UsePaginatedEmployeesResult` interface (employees, loading, error, hasMore, hasPrevious, pageSize, goNext, goPrevious, setPageSize, retry)
    - Re-export `PageSize` and `CursorPaginationParams` from `@/lib/pagination-types`
    - _Requirements: 1.1_

  - [x] 3.2 Add `fetchPaginatedEmployees` to `projects/shop/src/features/employees/employees-api.ts`
    - Follow same pattern as `fetchCursorPaginatedAccounts` in accounts feature
    - Accept `CursorPaginationParams` and optional `AbortSignal`
    - Include auth headers, 30s timeout, abort signal handling
    - Call `GET /api/employees?pageSize=X&cursor=Y`
    - Return `CursorPaginatedEmployeesResponse`
    - _Requirements: 1.1_

  - [x] 3.3 Create `projects/shop/src/features/employees/use-paginated-employees.ts`
    - Follow same pattern as `use-paginated-accounts.ts`
    - Implement page cache, cursor-based navigation (goNext, goPrevious)
    - Page size changes reset to first page
    - Handle loading, error, and retry states
    - Return `UsePaginatedEmployeesResult`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 4. Frontend — Page components and navigation
  - [x] 4.1 Create `projects/shop/src/features/employees/employees-columns.tsx`
    - Define `employeesColumns: ColumnDef<Employee>[]` for TanStack Table
    - Columns: Name (`name`), Source ID (`sourceId`), Created At (`createdAt` with date formatting)
    - No actions column (read-only)
    - _Requirements: 3.1_

  - [x] 4.2 Create `projects/shop/src/features/employees/employees-page.tsx`
    - Heading "Employees"
    - Use `usePaginatedEmployees` hook
    - Display DataTable with `employeesColumns` and pagination controls
    - Loading state while data is being fetched
    - Error state with retry button on failure
    - No create/edit/delete buttons (read-only)
    - Proper ARIA table semantics and keyboard navigation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.3 Add Employees entry to navigation and routing
    - Add `{ label: "Employees", path: "/employees", icon: UserCheck }` to `projects/shop/src/config/navigation.ts`
    - Position after "Accounts" and before "Sales" in the array
    - Add `/employees` route to the app router pointing to `EmployeesPage`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 5. Checkpoint — Verify frontend and backend build
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Write path updates — Add GSI2 attributes to employee creation
  - [x] 6.1 Update `projects/shop-api/src/stream/upsert-service.ts` — `resolveOrCreateEmployee()`
    - Add `GSI2PK: "EMPLOYEES"` and `GSI2SK: \`EMPLOYEE#\${uuid}\`` to the PutCommand Item
    - _Requirements: 2.1_

  - [x] 6.2 Update `projects/shop-api/src/import/item-sync-orchestrator.ts` — inline employee creation
    - Add `GSI2PK: "EMPLOYEES"` and `GSI2SK: \`EMPLOYEE#\${employeeUuid}\`` to the PutCommand Item in `resolveOrCreateEmployee()`
    - _Requirements: 2.1_

  - [x] 6.3 Update `projects/shop-api/src/import/sale-sync-orchestrator.ts` — inline employee creation
    - Add `GSI2PK: "EMPLOYEES"` and `GSI2SK: \`EMPLOYEE#\${employeeUuid}\`` to the PutCommand Item in `resolveOrCreateEmployee()`
    - _Requirements: 2.1_

- [x] 7. Backfill script — Populate GSI2 for existing employees
  - [x] 7.1 Create `projects/shop-api/src/scripts/backfill-employees-gsi2.ts`
    - Scan DynamoDB table for items where `PK begins_with "EMPLOYEE#"` and `SK = "METADATA"` and `attribute_not_exists(GSI2PK)`
    - For each matching record, UpdateCommand to set `GSI2PK = "EMPLOYEES"` and `GSI2SK = "EMPLOYEE#<uuid>"`
    - Process in batches to avoid throttling
    - Log progress (processed count, updated count)
    - _Requirements: 2.4_

- [x] 8. Tests
  - [x] 8.1 Write unit tests for `list-employees.ts` handler
    - Test default pageSize is 20
    - Test valid pageSize values (20, 50, 100)
    - Test GSI2 query uses correct key condition (`GSI2PK = "EMPLOYEES"`)
    - Test response maps only `uuid`, `name`, `sourceId`, `createdAt`, `updatedAt`
    - Test `nextCursor` and `hasMore` behavior
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 1.8, 1.9, 2.2_

  - [ ]* 8.2 Write property test: invalid pageSize rejection
    - **Property 3: Invalid pageSize rejection**
    - Use `fast-check` to generate arbitrary non-valid pageSize values
    - Assert handler returns 400 status for all of them
    - **Validates: Requirements 1.4**

  - [ ]* 8.3 Write property test: invalid cursor rejection
    - **Property 4: Invalid cursor rejection**
    - Use `fast-check` to generate arbitrary non-base64url strings
    - Assert handler returns 400 status for all of them
    - **Validates: Requirements 1.6**

  - [ ]* 8.4 Write property test: page size limit
    - **Property 2: Page size limit**
    - Use `fast-check` to generate arbitrary arrays of employee records (up to 200)
    - Assert response array length is always <= requested pageSize
    - **Validates: Requirements 1.2**

  - [ ]* 8.5 Write property test: response structure invariant
    - **Property 1: Response structure invariant**
    - For any valid combination of pageSize and cursor parameters
    - Assert response always contains `employees` (array), `nextCursor` (string | null), `hasMore` (boolean)
    - **Validates: Requirements 1.1**

  - [x] 8.6 Write unit tests for employees page component
    - Test page heading is "Employees"
    - Test column headers render (Name, Source ID, Created At)
    - Test loading state displays
    - Test error state with retry button
    - Test no CRUD action buttons present
    - Test ARIA table semantics
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 8.7 Write unit tests for pagination controls
    - Test Next/Previous button enabled/disabled states
    - Test page size selector shows options 20, 50, 100
    - _Requirements: 4.1, 4.2, 4.5_

  - [x] 8.8 Write unit tests for navigation integration
    - Test "Employees" entry present in navigation items
    - Test positioned after "Accounts" and before "Sales"
    - Test route navigates to `/employees`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 8.9 Write unit test for router mapping
    - Test `routeRequest` dispatches `GET /api/employees` to `listEmployees` handler
    - _Requirements: 6.3_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Run full test suites: `vitest --run` in both `projects/shop` and `projects/shop-api`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1–4)
- Property 5 (record mapping completeness) is already covered by the existing `employee-mapping.property.test.ts`
- The design specifies TypeScript throughout — no language selection needed
- The backfill script (7.1) should be run once after deploying the GSI2 infrastructure change
- Write path updates (6.x) can be deployed alongside or before the backfill

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "6.1", "6.2", "6.3"] },
    { "id": 3, "tasks": ["3.3", "7.1"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 5, "tasks": ["8.1", "8.6", "8.7", "8.8", "8.9"] },
    { "id": 6, "tasks": ["8.2", "8.3", "8.4", "8.5"] }
  ]
}
```
