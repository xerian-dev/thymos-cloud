# Implementation Plan: Accounts Page

## Overview

This plan implements the Accounts Page feature — a sortable data table for consigner accounts with a creation form, backed by DynamoDB single-table design. The implementation proceeds from infrastructure (DynamoDB table), through shared types and utilities, to the API layer, data table, form, and finally integration with routing and navigation.

## Tasks

- [x] 1. Set up DynamoDB infrastructure
  - [x] 1.1 Create DynamoDB table Terraform resource
    - Create `infrastructure/dynamodb.tf` with the shop DynamoDB table resource
    - Configure PAY_PER_REQUEST billing, string hash key `PK`, string range key `SK`
    - Apply standard tags (Environment, Project) using existing variables
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 1.2 Add DynamoDB table outputs
    - Add table name and ARN outputs to `infrastructure/outputs.tf`
    - Include descriptions per infrastructure standards
    - _Requirements: 8.1_

- [x] 2. Create accounts feature types and utilities
  - [x] 2.1 Create accounts type definitions
    - Create `src/features/accounts/accounts-types.ts`
    - Define `Account` interface with uuid, shopUid, name, address, telephone, commentCount, tags
    - Define `CreateAccountRequest` and `CreateAccountResult` types
    - _Requirements: 2.1, 2.2, 8.1_

  - [x] 2.2 Implement formatShopUid utility
    - Create `src/features/accounts/accounts-utils.ts`
    - Implement `formatShopUid(uid: number): string` that zero-pads to 7 digits
    - _Requirements: 2.3, 5.4_

  - [x] 2.3 Write property test for formatShopUid
    - **Property 1: Shop UID formatting preserves numeric value and produces fixed-width output**
    - Create `src/features/accounts/accounts-utils.property.test.ts`
    - For any integer N in [1, 9999999], verify output is exactly 7 chars, all digits, numeric value equals N
    - **Validates: Requirements 2.3, 5.4**

  - [x] 2.4 Write unit tests for formatShopUid
    - Create `src/features/accounts/accounts-utils.test.ts`
    - Test edge cases: 1 → "0000001", 9999999 → "9999999", 42 → "0000042"
    - _Requirements: 2.3, 5.4_

- [x] 3. Implement validation schemas
  - [x] 3.1 Create Zod validation schemas
    - Create `src/features/accounts/accounts-validation.ts`
    - Implement `accountNumberSchema`: integer, 1–9999999, no decimals/negatives/non-digits
    - Implement `accountFormSchema`: accountNumber + name (required, 1–100 chars, non-whitespace) + optional address (max 500) + optional telephone (max 30)
    - Export `AccountFormData` interface
    - _Requirements: 5.1, 5.3, 6.1, 6.2, 6.3_

  - [x] 3.2 Write property test for account number validation
    - **Property 2: Account number validation accepts only natural numbers in valid range**
    - Create `src/features/accounts/accounts-validation.property.test.ts`
    - For any string S, verify acceptance iff S is a positive integer in [1, 9999999] with no decimals/negatives/whitespace/non-digits
    - **Validates: Requirements 5.1, 5.3**

  - [x] 3.3 Write property test for name validation
    - **Property 3: Name validation requires non-whitespace content within length bounds**
    - Add to `src/features/accounts/accounts-validation.property.test.ts`
    - For any string S, verify acceptance iff S has at least one non-whitespace character and total length ≤ 100
    - **Validates: Requirements 6.1, 6.2**

  - [x] 3.4 Write unit tests for validation schemas
    - Create `src/features/accounts/accounts-validation.test.ts`
    - Test specific edge cases: empty name, whitespace-only name, max length boundaries, zero account number, negative numbers, decimal numbers
    - _Requirements: 5.1, 5.3, 6.1, 6.2, 6.3_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement API layer
  - [x] 5.1 Create accounts API module
    - Create `src/features/accounts/accounts-api.ts`
    - Implement `fetchAccounts(): Promise<AccountsApiResponse>`
    - Implement `fetchNextAccountNumber(): Promise<number>`
    - Implement `createAccount(data): Promise<CreateAccountResult>` with 30-second AbortController timeout
    - Handle error mapping: duplicate, max_reached, network, server, timeout
    - _Requirements: 7.1, 7.4, 7.5, 7.7, 9.1_

  - [x] 5.2 Create useAccounts custom hook
    - Create `src/features/accounts/use-accounts.ts`
    - Implement `useAccounts()` hook returning accounts, loading, error, and refresh function
    - Handle loading state and error state management
    - _Requirements: 2.6, 2.7_

  - [x] 5.3 Write unit tests for accounts API module
    - Create `src/features/accounts/accounts-api.test.ts`
    - Use MSW to mock API responses
    - Test success cases, network errors, server errors, timeout, duplicate UID responses
    - _Requirements: 7.1, 7.4, 7.5, 7.7_

  - [x] 5.4 Write unit tests for useAccounts hook
    - Create `src/features/accounts/use-accounts.test.ts`
    - Test loading state, error state, successful data fetch, refresh behavior
    - _Requirements: 2.6, 2.7_

- [x] 6. Implement accounts data table
  - [x] 6.1 Create column definitions
    - Create `src/features/accounts/accounts-columns.tsx`
    - Define columns in order: Account # (sortable, numeric, zero-padded display), Name (sortable), Address (sortable), Telephone (sortable), Comments (not sortable, numeric count), Tags (not sortable, comma-separated)
    - UUID column excluded by default
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 6.2 Create AccountsTable component
    - Create `src/features/accounts/accounts-table.tsx`
    - Use TanStack Table with shadcn/ui table primitives
    - Implement single-column sorting with toggle (asc/desc)
    - Custom numeric sort for account number, case-insensitive for text columns
    - Display loading skeleton, error state with retry, and empty state
    - Apply proper table semantics: `scope="col"`, `aria-sort` attributes on sortable headers
    - _Requirements: 2.1, 2.6, 2.7, 2.8, 3.7, 3.8, 3.9, 3.10, 10.1, 10.2_

  - [x] 6.3 Write property tests for AccountsTable sorting
    - **Property 5: Sort ordering correctness**
    - **Property 6: Sort toggle behavior**
    - Create `src/features/accounts/accounts-table.property.test.tsx`
    - Property 5: For any list and sortable column, verify numeric order for account # and case-insensitive alpha for others
    - Property 6: Verify click on unsorted column → ascending; click on sorted column → toggle direction
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.7, 3.8, 3.10**

  - [x] 6.4 Write property test for aria-sort attributes
    - **Property 9: Aria-sort attribute correctness**
    - Add to `src/features/accounts/accounts-table.property.test.tsx`
    - For any sort state, verify sorted column has correct aria-sort value and others have "none"
    - **Validates: Requirements 10.2**

  - [x] 6.5 Write unit tests for AccountsTable
    - Create `src/features/accounts/accounts-table.test.tsx`
    - Test column order and visibility, loading indicator, error message, empty state message, sort indicator display
    - _Requirements: 2.1, 2.2, 2.6, 2.7, 2.8, 3.9, 10.1_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement account creation form
  - [x] 8.1 Create AccountForm component
    - Create `src/features/accounts/account-form.tsx`
    - Render in a shadcn/ui Dialog modal
    - Input fields: account number (max 7 digits), name (max 200 chars), address (max 500 chars), telephone (max 30 chars)
    - Pre-fill account number with `defaultAccountNumber` prop
    - On blur of account number, format as 7-digit zero-padded display
    - Validate with Zod schema on submit
    - Manage submission state: disable inputs and submit button, show loading indicator
    - Implement 30-second timeout handling
    - Display error messages with `role="alert"`, `aria-invalid`, `aria-describedby`
    - Associate labels with inputs using `for`/`id` pairing
    - Focus first input on modal open (within 100ms)
    - Indicate required fields visually
    - Support keyboard navigation (Tab, Shift+Tab, Enter on submit)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.4, 6.4, 6.5, 7.1, 7.2, 7.3, 7.6, 7.7, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9_

  - [x] 8.2 Write property test for form error state preservation
    - **Property 8: Form error state preserves field values**
    - Create `src/features/accounts/account-form.property.test.tsx`
    - For any set of field values and any error type, after error the form contains same values and inputs are re-enabled
    - **Validates: Requirements 7.6**

  - [x] 8.3 Write property test for invalid form prevents API call
    - **Property 4: Invalid form data prevents API submission**
    - Add to `src/features/accounts/account-form.property.test.tsx`
    - For any form state with at least one validation failure, verify no API call is triggered
    - **Validates: Requirements 6.4**

  - [x] 8.4 Write property test for error accessibility attributes
    - **Property 10: Error messages use accessible attributes**
    - Add to `src/features/accounts/account-form.property.test.tsx`
    - For any field with validation error, verify aria-invalid="true", aria-describedby, and role="alert" on error element
    - **Validates: Requirements 10.4, 10.5**

  - [x] 8.5 Write unit tests for AccountForm
    - Create `src/features/accounts/account-form.test.tsx`
    - Test modal open/close, field presence, required indicators, on-blur formatting, validation error display, submit disabling during loading, error message display for each error type, focus management
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.2, 5.4, 7.2, 7.4, 7.5, 7.6, 7.7, 10.3, 10.7, 10.8_

- [x] 9. Implement sequence counter logic
  - [x] 9.1 Create sequence counter utility
    - Create `src/features/accounts/sequence-counter.ts` (or add logic to accounts-api.ts)
    - Implement the sequence counter update logic: if UID equals default → counter + 1; if UID > counter → UID + 1; if UID < counter → no change
    - This utility is for backend logic reference and testing; frontend calls API to get next number
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 9.2 Write property test for sequence counter update logic
    - **Property 7: Sequence counter update logic**
    - Create `src/features/accounts/sequence-counter.property.test.ts`
    - For any current value C and UID U in [1, 9999999]: verify (a) U==C → C+1, (b) U>C → U+1, (c) U<C → C unchanged
    - **Validates: Requirements 9.2, 9.3, 9.4**

- [x] 10. Wire up page, routing, and navigation
  - [x] 10.1 Create AccountsPage component
    - Create `src/features/accounts/accounts-page.tsx`
    - Render page header with "Accounts" title and "Add Account" button
    - Manage modal open/close state
    - Wire `useAccounts` hook to `AccountsTable`
    - Wire `AccountForm` with `onSuccess` → refresh accounts data and close modal
    - Implement focus return to "Add Account" button after modal close
    - _Requirements: 1.3, 4.1, 7.3, 10.8_

  - [x] 10.2 Add accounts route to router configuration
    - Update `src/config/routes.ts` to add `/accounts` route under authenticated layout
    - Import and use `AccountsPage` component
    - _Requirements: 1.1, 1.4_

  - [x] 10.3 Add accounts navigation item
    - Update `src/config/navigation.ts` to add "Accounts" nav item with a lucide-react icon (e.g., `Users`) and path `/accounts`
    - _Requirements: 1.2_

  - [x] 10.4 Write unit tests for page integration
    - Create `src/features/accounts/accounts-page.test.tsx`
    - Test "Add Account" button opens modal, modal close, data refresh on success, focus return
    - _Requirements: 1.3, 4.1, 7.3, 10.8_

  - [x] 10.5 Write unit tests for route and navigation
    - Test route configuration includes /accounts under AuthGuard
    - Test navigation items include "Accounts" entry
    - _Requirements: 1.1, 1.2, 1.4_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The API module uses an abstraction layer — actual transport (REST/GraphQL) is pluggable
- TanStack Table is used via the shadcn/ui data table pattern (headless)
- `@tanstack/react-table` must be installed as a dependency before implementing table tasks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.2", "2.3", "2.4", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4", "5.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "9.1"] },
    { "id": 4, "tasks": ["5.4", "6.1", "9.2"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["6.3", "6.4", "6.5", "8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "8.4", "8.5"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3"] },
    { "id": 10, "tasks": ["10.4", "10.5"] }
  ]
}
```
