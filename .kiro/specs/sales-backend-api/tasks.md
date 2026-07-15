# Implementation Plan: Sales Backend API

## Overview

Add seven route handlers for Sales and Employee endpoints to the existing shop-api monolambda. Implementation follows established codebase patterns — same file layout, DynamoDB client, response utilities, and cursor pagination approach.

## Tasks

- [x] 1. Add pk-utils helpers and sale validation modules
  - [x] 1.1 Add sale and employee key construction helpers to pk-utils.ts
    - Add `SALE_PREFIX`, `EMPLOYEE_PREFIX` constants
    - Add `buildSalePk(uuid)`, `formatSaleGsi1sk(saleNumber)`, `buildEmployeePk(uuid)` functions
    - Follow existing patterns from `buildItemPk` and `formatSkuGsi1sk`
    - _Requirements: 3.4, 8.1–8.7_

  - [x] 1.2 Create sale-validation.ts module
    - Implement `validateSaleInput(body)` returning `SaleValidationResult`
    - Validate `status` is one of `"open"`, `"finalized"`, `"voided"` (required)
    - Validate `cashierId` is a non-empty string (required)
    - Validate optional numeric fields (`subtotal`, `total`, `storePortion`, `consignorPortion`, `change`)
    - Validate optional string field (`memo`)
    - Collect all errors (no fail-fast), matching `item-validation.ts` pattern
    - _Requirements: 3.6, 3.7, 3.9_

  - [x] 1.3 Create sale-update-validation.ts module
    - Implement `validateSaleUpdate(body)` returning `SaleUpdateValidationResult`
    - All fields optional — only validate types of fields that are present
    - Validate `status` (if provided) is one of `"open"`, `"finalized"`, `"voided"`
    - Validate optional numeric and string fields by type
    - _Requirements: 4.2, 4.4_

- [x] 2. Implement list-sales and next-sale-number handlers
  - [x] 2.1 Implement list-sales.ts route handler
    - Query GSI1 with `GSI1PK = "SALES"`, `ScanIndexForward = false` (descending)
    - Validate `pageSize` query param (one of 20, 50, 100; default 20)
    - Decode `cursor` query param as ExclusiveStartKey
    - Return `{ sales, nextCursor, hasMore }` response
    - Map DynamoDB records to API response shape (strip PK/SK/GSI keys)
    - Follow `list-accounts.ts` patterns exactly
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 2.2 Implement next-sale-number.ts route handler
    - GetItem on `PK = "SEQUENCE#SALE"`, `SK = "COUNTER"`
    - Export `computeNextSaleNumber(current)` for testability
    - Return `{ nextNumber: currentValue + 1 }`, or `{ nextNumber: 1 }` if counter absent
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Implement create-sale handler
  - [x] 3.1 Implement create-sale.ts route handler
    - Parse JSON body (400 `invalid_json` on failure)
    - Validate with `validateSaleInput`
    - Generate v4 UUID, read current counter, compute next number
    - TransactWrite: conditionally increment counter + put sale record
    - Handle `TransactionCanceledException` with retry (max 3 attempts)
    - Return 201 with created sale record
    - Follow `create-item.ts` transactional pattern exactly
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11_

- [x] 4. Implement update-sale and delete-sale handlers
  - [x] 4.1 Implement update-sale.ts route handler
    - Extract UUID from path parameters (400 `missing_uuid` if absent)
    - Parse JSON body (400 `invalid_json` on failure)
    - Validate with `validateSaleUpdate`
    - GetItem to verify sale exists (404 `not_found` if missing)
    - Merge provided fields into existing record, set `updatedAt`
    - PutItem with condition expression `attribute_exists(PK)`
    - Return 200 with updated sale record
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 4.2 Implement delete-sale.ts route handler
    - Extract UUID from path parameters (400 `missing_uuid` if absent)
    - GetItem to verify sale exists (404 `not_found` if missing)
    - Query ALL records under `PK = "SALE#<uuid>"` (METADATA + LINE_ITEM# records)
    - BatchWriteItem to delete all returned items
    - Return 204 with empty body
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 5. Implement employee handlers
  - [x] 5.1 Implement get-employee.ts route handler
    - Extract UUID from path parameters (400 `missing_uuid` if absent)
    - GetItem with `PK = "EMPLOYEE#<uuid>"`, `SK = "METADATA"`
    - Return 404 `not_found` if record doesn't exist
    - Map to response shape: `uuid`, `name`, `sourceId`, `createdAt`, `updatedAt`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 5.2 Implement batch-get-employees.ts route handler
    - Parse JSON body (400 `invalid_json` on failure)
    - Validate `uuids` field is an array (400 `validation_error` if not)
    - Reject if array length > 100 (400 `too_many_uuids`)
    - Return empty `employees` array for empty `uuids` input
    - BatchGetItem for all UUIDs, omit missing records from response
    - Map each to response shape: `uuid`, `name`, `sourceId`, `createdAt`, `updatedAt`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 6. Register routes and wire handlers
  - [x] 6.1 Register all new routes in router.ts
    - Import all seven handler functions
    - Add route key mappings: `GET /api/sales`, `GET /api/sales/next-number`, `POST /api/sales`, `PUT /api/sales/{uuid}`, `DELETE /api/sales/{uuid}`, `GET /api/employees/{uuid}`, `POST /api/employees/batch`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 7. Checkpoint - Verify build and existing tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Add unit and property tests
  - [x] 8.1 Write property test for sale validation completeness
    - **Property 1: Sale validation completeness**
    - **Validates: Requirements 3.6, 3.7, 3.9, 4.4**

  - [x] 8.2 Write property test for page size validation
    - **Property 2: Page size validation**
    - **Validates: Requirements 1.2, 1.4**

  - [x] 8.3 Write property test for sale key construction round-trip
    - **Property 3: Sale key construction round-trip**
    - **Validates: Requirements 3.4**

  - [x] 8.4 Write property test for next sale number monotonicity
    - **Property 4: Next sale number monotonicity**
    - **Validates: Requirements 2.2**

  - [x] 8.5 Write property test for update merge preserves identity
    - **Property 5: Update merge preserves identity**
    - **Validates: Requirements 4.2**

  - [x] 8.6 Write property test for employee response mapping
    - **Property 6: Employee response mapping**
    - **Validates: Requirements 6.2, 7.2**

  - [x] 8.7 Write property test for batch request validation
    - **Property 7: Batch request validation**
    - **Validates: Requirements 7.5, 7.7**

  - [x] 8.8 Write unit tests for sales handlers
    - Test default page size (20) when no pageSize param provided
    - Test missing UUID returns 400 for update/delete handlers
    - Test invalid JSON returns `invalid_json` error
    - Test counter absent returns nextNumber = 1
    - Test delete with line items removes all records
    - _Requirements: 1.3, 2.3, 3.8, 4.5, 5.3_

  - [x] 8.9 Write unit tests for employee handlers
    - Test missing UUID returns 400
    - Test empty batch array returns empty employees array
    - Test batch with > 100 UUIDs returns `too_many_uuids`
    - Test missing employee returns 404
    - _Requirements: 6.3, 6.4, 7.5, 7.6, 7.7_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All handlers follow existing patterns from list-accounts.ts, create-item.ts, etc.
- Use `fast-check` for property-based tests (available in project ecosystem via vitest)
- Use `aws-sdk-client-mock` for DynamoDB mocking in unit/integration tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1", "5.1", "5.2"] },
    { "id": 2, "tasks": ["4.1", "4.2"] },
    { "id": 3, "tasks": ["6.1"] },
    { "id": 4, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9"] }
  ]
}
```
