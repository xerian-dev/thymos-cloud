# Implementation Plan: Sales Table Views & User Detail Panel

## Overview

This plan implements the Sales table view with full CRUD, a shared User Detail Panel, and consistency refactoring across all three entity tables. Work proceeds from shared infrastructure (types, Sheet component), through the Sales feature build-out, to integration with routing/navigation and updates to the existing Items feature.

## Tasks

- [x] 1. Extract shared PageSize type and update existing features
  - [x] 1.1 Create shared pagination types module
    - Create `src/lib/pagination-types.ts` with `PageSize` type and `CursorPaginationParams` interface
    - _Requirements: 5.1_

  - [x] 1.2 Update PaginationControls to import from shared location
    - Update `src/components/shared/pagination-controls.tsx` to import `PageSize` from `@/lib/pagination-types`
    - Re-export `PageSize` from pagination-controls for backward compatibility
    - _Requirements: 5.1_

  - [x] 1.3 Update Accounts types to use shared PageSize
    - Update `src/features/accounts/accounts-types.ts` to import `PageSize` and `CursorPaginationParams` from `@/lib/pagination-types`
    - Remove local `PageSize` and `CursorPaginationParams` definitions
    - _Requirements: 5.1, 5.7_

  - [x] 1.4 Update Items types to use shared PageSize
    - Update `src/features/inventory/items-types.ts` to import `PageSize` and `CursorPaginationParams` from `@/lib/pagination-types`
    - Remove local `PageSize` and `CursorPaginationParams` definitions
    - _Requirements: 5.1, 5.7_

- [x] 2. Add Sheet UI component and create User Detail Panel
  - [x] 2.1 Add shadcn/ui Sheet component
    - Run `npx shadcn@latest add sheet` to install the Sheet component
    - Verify it creates `src/components/ui/sheet.tsx`
    - _Requirements: 4.1_

  - [x] 2.2 Create Employee types and API module
    - Create `src/features/employees/employees-types.ts` with `Employee` interface
    - Create `src/features/employees/employees-api.ts` with `fetchEmployee` and `fetchEmployeesByIds` functions
    - Follow established API pattern (auth headers, timeout, error handling)
    - _Requirements: 4.2, 4.5_

  - [x] 2.3 Create UserDetailPanel shared component
    - Create `src/components/shared/user-detail-panel.tsx`
    - Use Sheet component with `side="right"` and `sm:max-w-md` width
    - Accept `open`, `onClose`, `employeeId` props
    - Fetch employee data when open and employeeId provided
    - Display employee name, sourceId, createdAt, updatedAt in a structured layout
    - Show loading state and error state
    - Include proper accessibility: role="dialog", aria-labelledby, focus trap, Escape to close
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 7.4, 7.5_

- [x] 3. Create Sales feature — types, API, and utilities
  - [x] 3.1 Create Sales type definitions
    - Create `src/features/sales/sales-types.ts`
    - Define `Sale`, `SaleLineItem`, `CreateSaleRequest`, `UpdateSaleRequest` interfaces
    - Define `CreateSaleResult`, `UpdateSaleResult`, `DeleteSaleResult` discriminated unions
    - Define `CursorPaginatedSalesResponse`, `CachedPage`, `UsePaginatedSalesResult`
    - Import `PageSize` from `@/lib/pagination-types`
    - _Requirements: 2.1, 3.6_

  - [x] 3.2 Create Sales API module
    - Create `src/features/sales/sales-api.ts`
    - Implement `fetchCursorPaginatedSales` with cursor pagination, timeout, abort signal
    - Implement `createSale`, `updateSale`, `deleteSale` with discriminated union results
    - Implement `fetchNextSaleNumber`
    - Follow established API pattern (auth headers, 30s timeout, error mapping)
    - _Requirements: 2.7, 2.8, 2.9, 3.1, 3.2, 3.3_

  - [x] 3.3 Create Sales utilities
    - Create `src/features/sales/sales-utils.ts`
    - Implement `formatChfCents(cents: number): string` — converts cents to "CHF X.XX" display
    - Implement `formatSaleDate(isoString: string | undefined): string` — formatted date or "—"
    - Implement `getStatusVariant(status: Sale["status"])` — returns styling classes for status badge
    - _Requirements: 2.3, 2.5, 2.6_

  - [x] 3.4 Create Sales validation schema
    - Create `src/features/sales/sales-validation.ts`
    - Implement Zod schema for sale form validation (cashierId required, memo optional max 500 chars)
    - _Requirements: 3.7_

- [x] 4. Create Sales feature — pagination hook
  - [x] 4.1 Create usePaginatedSales hook
    - Create `src/features/sales/use-paginated-sales.ts`
    - Implement cursor-based pagination with page caching, matching `usePaginatedAccounts` and `usePaginatedItems` patterns exactly
    - Include abort controller management, retry logic, page size changes
    - _Requirements: 2.7, 5.4_

- [x] 5. Create Sales feature — table components
  - [x] 5.1 Create Sales column definitions
    - Create `src/features/sales/sales-columns.tsx`
    - Define columns: Sale # (number), Status (badge), Cashier (clickable link), Total (CHF formatted), Finalized At (date or "—"), Actions (edit/delete buttons)
    - Define `SalesTableMeta` interface with `onEdit`, `onDelete`, `onViewUser` callbacks
    - Cashier cell renders as a button styled as link that calls `meta.onViewUser`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.6_

  - [x] 5.2 Create SalesTable component
    - Create `src/features/sales/sales-table.tsx`
    - Compose DataTable with sales columns and PaginationControls
    - Accept same prop pattern as AccountsTable and ItemsTable plus `onViewUser`
    - _Requirements: 2.1, 2.7, 2.8, 2.9, 2.10, 5.2, 7.1_

- [x] 6. Create Sales feature — form and delete dialog
  - [x] 6.1 Create SaleForm component
    - Create `src/features/sales/sale-form.tsx`
    - Dialog with fields: Cashier (employee searchable dropdown), Memo (textarea), Status (edit mode only)
    - Follow AccountForm/ItemForm patterns for validation, submission, error handling, accessibility
    - Manage loading state, disable inputs during submission
    - Proper aria-invalid, aria-describedby, role="alert" for errors
    - Focus management: focus first input on open, return focus on close
    - _Requirements: 3.1, 3.2, 3.4, 3.6, 3.7, 7.2, 7.3_

  - [x] 6.2 Create DeleteSaleDialog component
    - Create `src/features/sales/delete-sale-dialog.tsx`
    - AlertDialog showing sale number and status, warning deletion is permanent
    - Follow DeleteAccountDialog/DeleteItemDialog patterns
    - Handle error states with user-friendly messages
    - _Requirements: 3.3, 3.5, 3.8_

- [x] 7. Create Sales feature — page orchestrator
  - [x] 7.1 Create SalesPage component
    - Create `src/features/sales/sales-page.tsx`
    - Page header with "Sales" title and "Add Sale" button
    - Wire usePaginatedSales hook to SalesTable
    - Manage form dialog state (create/edit modes)
    - Manage delete dialog state
    - Manage UserDetailPanel state (open, selectedEmployeeId)
    - Handle onViewUser callback from table
    - Memoize table component for performance
    - Return focus to triggering element on dialog/panel close
    - _Requirements: 1.3, 3.1, 3.2, 3.3, 3.4, 3.5, 5.5_

- [x] 8. Integrate Sales into routing and navigation
  - [x] 8.1 Add Sales route
    - Update `src/config/routes.ts` to add `/sales` route under authenticated layout
    - Import and use `SalesPage` component
    - _Requirements: 1.1, 1.4_

  - [x] 8.2 Add Sales navigation item
    - Update `src/config/navigation.ts` to add "Sales" nav item with `Receipt` icon from lucide-react
    - Position between "Accounts" and "Help"
    - _Requirements: 1.2_

- [x] 9. Update Items feature for createdBy username display
  - [x] 9.1 Update Item type with createdBy and categoryId fields
    - Update `src/features/inventory/items-types.ts` to add `createdBy?: string` and `categoryId?: string`
    - _Requirements: 6.1_

  - [x] 9.2 Update Items columns with Created By column
    - Update `src/features/inventory/items-columns.tsx` to add "Created By" column
    - Render as clickable employee name link using `meta.onViewUser`
    - Show "Unknown" if name not resolved
    - Update `ItemsTableMeta` to include `onViewUser` callback
    - _Requirements: 6.2, 6.3, 6.4, 7.6_

  - [x] 9.3 Update ItemsTable and ItemsPage for user detail panel
    - Update `ItemsTableProps` to include `onViewUser` prop
    - Update `ItemsPage` to manage UserDetailPanel state
    - Add UserDetailPanel to ItemsPage render
    - _Requirements: 6.3, 4.7_

- [x] 10. Final verification
  - [x] 10.1 Run TypeScript compilation
    - Run `npm run typecheck` to verify no type errors
    - Fix any compilation issues

  - [x] 10.2 Run lint
    - Run `npm run lint` to verify code quality
    - Fix any lint issues

  - [x] 10.3 Verify build
    - Run `npm run build` to ensure production build succeeds

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["2.3", "3.2", "3.3", "3.4"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["5.1", "5.2"] },
    { "id": 6, "tasks": ["6.1", "6.2"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["8.1", "8.2"] },
    { "id": 9, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 10, "tasks": ["10.1", "10.2", "10.3"] }
  ]
}
```

## Notes

- The shadcn/ui Sheet component must be added before the UserDetailPanel can be built
- Employee resolution in tables can use a simple in-memory cache to avoid re-fetching the same employee on every page navigation
- The Sale form's line items feature (adding items to a sale) is a complex sub-feature — for the initial implementation, the form will support cashier, memo, and status fields. Line item management can be enhanced in a follow-up spec.
- The existing Accounts and Items tests should continue passing after the PageSize refactor since the type signature doesn't change
