# Implementation Plan: Item Creation

## Overview

This plan implements full item CRUD management for the consignment shop. It starts with shared component extraction (DataTable, PaginationControls), then builds the backend API routes, followed by the frontend feature. Tasks are ordered so shared components come first (both accounts refactoring and items depend on them), backend before frontend, and property tests accompany their related implementation.

## Tasks

- [x] 1. Extract shared DataTable and PaginationControls components
  - [x] 1.1 Create the shared DataTable component
    - Create `projects/shop/src/components/shared/data-table.tsx`
    - Implement a generic typed `DataTable<TData>` component that accepts TanStack Table column definitions, data array, loading boolean, error string | null, onRetry callback, and aria-label string
    - Render table headers, rows, loading state, error state with retry button, and empty state
    - Use the same markup/class patterns from the existing `AccountsTable`
    - Export the `DataTableProps<TData>` interface
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 1.2 Move PaginationControls to shared location
    - Create `projects/shop/src/components/shared/pagination-controls.tsx`
    - Move the `PaginationControls` component from `features/accounts/pagination-controls.tsx` to the shared location
    - Update the `PageSize` type to be imported from a shared types file or defined locally
    - Keep behavior and styling identical
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 1.3 Refactor AccountsTable to use shared components
    - Update `features/accounts/accounts-table.tsx` to use the shared `DataTable` and `PaginationControls` from `components/shared/`
    - Remove inline table rendering from AccountsTable, delegate to DataTable
    - Update the old `pagination-controls.tsx` in accounts to re-export from shared (or update all imports)
    - Verify accounts page behavior remains unchanged
    - _Requirements: 14.8, 15.5_

  - [x] 1.4 Write unit tests for shared DataTable component
    - Create `projects/shop/src/components/shared/data-table.test.tsx`
    - Test: renders headers from column definitions, renders rows matching data, loading state, error state with retry callback, empty state, aria-label on region
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 1.5 Write unit tests for shared PaginationControls
    - Create `projects/shop/src/components/shared/pagination-controls.test.tsx`
    - Test: button disabled states based on hasPrevious/hasMore, page size options render, callbacks fire correctly
    - _Requirements: 15.1, 15.2, 15.3_

- [x] 2. Implement backend item utilities and validation
  - [x] 2.1 Extend pk-utils with item key helpers
    - Add `buildItemPk(uuid: string): string` returning `"ITEM#<uuid>"`
    - Add `formatSkuGsi1sk(sku: number): string` returning `"ITEM#<7-digit zero-padded sku>"`
    - File: `projects/shop-api/src/pk-utils.ts`
    - _Requirements: 1.1, 1.4_

  - [x] 2.2 Write property test for item PK and GSI1SK construction (Property 1)
    - **Property 1: Item key and GSI1SK construction**
    - Create `projects/shop-api/tests/item-pk-utils.property.test.ts`
    - For any valid UUID, `buildItemPk(uuid)` produces `"ITEM#" + uuid`
    - For any integer sku in [1, 9999999], `formatSkuGsi1sk(sku)` produces `"ITEM#"` followed by exactly 7 digits whose numeric value equals sku
    - **Validates: Requirements 1.1, 1.4**

  - [x] 2.3 Create item validation module
    - Create `projects/shop-api/src/item-validation.ts`
    - Implement `validateItemInput(body: unknown)` that validates all required fields: accountId (non-empty string), title (non-empty, ≤200), tagPrice (number 0-999999.99, ≤2 decimals), quantity (positive integer ≤9999), split (integer 0-100), inventoryType ("Consignment" | "Retail"), terms ("Return To Consignor" | "Donate" | "Discard")
    - Validate optional fields: description (≤2000), details (≤5000), tags (array ≤20 items, each ≤50 chars), expirationDate (ISO 8601 future date), imageKeys (array ≤10)
    - Return discriminated union: `{ valid: true, data: ValidatedItemInput }` | `{ valid: false, errors: Array<{ field: string; message: string }> }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9, 2.10, 2.11, 2.12, 2.13_

  - [x] 2.4 Create item normalization function
    - Add `normalizeItemAttributes(input: ValidatedItemInput)` to `projects/shop-api/src/item-validation.ts` (or separate file)
    - Strip empty-string optional fields (category, brand, color, size, shelf, details, description)
    - Omit undefined/empty tags array
    - Default taxExempt to false if omitted
    - Preserve imageKeys array order
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 11.5_

  - [x] 2.5 Write property tests for item validation (Properties 3, 4, 5)
    - Create `projects/shop-api/tests/item-validation.property.test.ts`
    - **Property 3: Required field validation — accept valid, reject invalid**
    - **Property 4: Optional field length validation**
    - **Property 5: Validation error completeness**
    - **Validates: Requirements 2.1–2.7, 2.9–2.13**

  - [x] 2.6 Write property tests for item normalization (Properties 6, 7)
    - Create `projects/shop-api/tests/item-normalization.property.test.ts`
    - **Property 6: Optional field normalization**
    - **Property 7: Image key order preservation**
    - **Validates: Requirements 10.1–10.11, 11.5**

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement backend item CRUD routes
  - [x] 4.1 Implement create-item route
    - Create `projects/shop-api/src/routes/create-item.ts`
    - Validate request body using item-validation module
    - Verify accountId exists in Shop_Table (GetItem on `ACCOUNT#<accountId>`)
    - Generate v4 UUID, build TransactWriteItems: Update counter (PK=`SEQUENCE#ITEM`, SK=`COUNTER`) + Put item record with all keys/attributes
    - Handle counter initialization (if no counter exists, start at 1)
    - Retry with new UUID on PK collision (up to 3 attempts)
    - Return 201 with full item record on success
    - Return 400/422/500 on validation/account_not_found/server errors
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.2 Write property test for sequence counter monotonicity (Property 2)
    - Create `projects/shop-api/tests/item-sequence.property.test.ts`
    - **Property 2: Sequence counter monotonicity**
    - Extract `computeNextSku(current: number): number` as a testable pure function
    - For any non-negative integer current below max, result > current
    - **Validates: Requirements 8.2, 8.4**

  - [x] 4.3 Implement update-item route
    - Create `projects/shop-api/src/routes/update-item.ts`
    - Validate request body
    - Verify item exists (GetItem on `ITEM#<uuid>`)
    - Update mutable attributes, set updatedAt, preserve uuid/sku/createdAt
    - Return 200 with full updated item record
    - Return 400/404/500 on validation/not_found/server errors
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 4.4 Write property test for update immutability (Property 8)
    - Create `projects/shop-api/tests/item-update.property.test.ts`
    - **Property 8: Update immutability of identity fields**
    - For any valid update applied to an item, uuid/sku/createdAt remain unchanged
    - **Validates: Requirements 4.3**

  - [x] 4.5 Implement delete-item route
    - Create `projects/shop-api/src/routes/delete-item.ts`
    - Verify item exists, then delete it
    - Return 200 with `{ success: true }` on success
    - Return 404/500 on not_found/server errors
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.6 Implement list-items route
    - Create `projects/shop-api/src/routes/list-items.ts`
    - Query GSI1 with `GSI1PK = "ITEMS"`, forward scan, limit = pageSize
    - Accept `pageSize` (20/50/100, default 20) and optional `cursor` query params
    - Decode cursor to LastEvaluatedKey, encode LastEvaluatedKey to nextCursor
    - Return `{ items, nextCursor, hasMore }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 4.7 Write property test for pagination cursor correctness (Property 10)
    - Create `projects/shop-api/tests/item-pagination.property.test.ts`
    - **Property 10: Pagination cursor correctness**
    - For any list of N items and page size P, consecutive pages cover all items without gaps or duplicates, and each page's first SKU > previous page's last SKU
    - **Validates: Requirements 6.3, 6.4**

  - [x] 4.8 Implement next-item-sku route
    - Create `projects/shop-api/src/routes/next-item-sku.ts`
    - Read counter (PK=`SEQUENCE#ITEM`, SK=`COUNTER`), return `{ nextSku: value + 1 }`
    - If no counter exists, return `{ nextSku: 1 }`
    - Return 500 on error
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 4.9 Write property test for next-SKU computation (Property 9)
    - Create `projects/shop-api/tests/item-next-sku.property.test.ts`
    - **Property 9: Next-SKU computation**
    - For any non-negative integer currentCounterValue, next-sku returns currentCounterValue + 1; if no counter, returns 1
    - **Validates: Requirements 9.2, 9.3**

  - [x] 4.10 Implement presign-upload route
    - Create `projects/shop-api/src/routes/presign-upload.ts`
    - Accept `{ filename, contentType }` where contentType is "image/jpeg" | "image/png" | "image/webp"
    - Generate S3 key: `items/<itemUuid>/<randomId>.<ext>`
    - Return presigned PUT URL + s3Key
    - Return 400 for invalid content type
    - _Requirements: 11.1, 11.9_

  - [x] 4.11 Register item routes in router
    - Update `projects/shop-api/src/router.ts` to add all item routes:
      - `POST /api/items` → createItem
      - `PUT /api/items/{uuid}` → updateItem
      - `DELETE /api/items/{uuid}` → deleteItem
      - `GET /api/items` → listItems
      - `GET /api/items/next-sku` → nextItemSku
      - `POST /api/items/upload-url` → presignUpload
    - _Requirements: 3.1, 4.1, 5.1, 6.1, 9.1_

- [x] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement frontend items types, API client, and validation
  - [x] 6.1 Create items types module
    - Create `projects/shop/src/features/inventory/items-types.ts`
    - Define: Item, CreateItemRequest, UpdateItemRequest, CreateItemResult, UpdateItemResult, DeleteItemResult, CursorPaginatedItemsResponse, CachedPage, PageSize, CursorPaginationParams, UsePaginatedItemsResult
    - _Requirements: 3.2, 4.4, 5.2, 6.5_

  - [x] 6.2 Create items API client
    - Create `projects/shop/src/features/inventory/items-api.ts`
    - Implement: fetchCursorPaginatedItems, fetchNextSku, createItem, updateItem, deleteItem, requestPresignedUrl
    - Follow patterns from accounts-api.ts (auth headers, timeout, abort signal, discriminated union results)
    - _Requirements: 3.1, 4.1, 5.1, 6.1, 9.1, 11.9_

  - [x] 6.3 Create items client-side validation
    - Create `projects/shop/src/features/inventory/items-validation.ts`
    - Implement Zod schema mirroring server validation rules
    - Required: accountId, title (≤200), tagPrice (0-999999.99, ≤2 decimals), quantity (1-9999), split (0-100), inventoryType, terms
    - Optional: description (≤2000), details (≤5000), tags (≤20, each ≤50), expirationDate (future ISO date)
    - _Requirements: 7.14_

  - [x] 6.4 Create items utility functions
    - Create `projects/shop/src/features/inventory/items-utils.ts`
    - Implement `formatChf(value: number): string` returning `"CHF X.XX"` format
    - _Requirements: 12.4_

  - [x] 6.5 Write property test for CHF currency formatting (Property 11)
    - Create `projects/shop/src/features/inventory/items-utils.property.test.ts`
    - **Property 11: CHF currency formatting**
    - For any non-negative number with at most 2 decimal places, formatChf produces "CHF X.XX" with exactly 2 decimal digits
    - **Validates: Requirements 12.4**

- [x] 7. Implement frontend items table and pagination
  - [x] 7.1 Create usePaginatedItems hook
    - Create `projects/shop/src/features/inventory/use-paginated-items.ts`
    - Implement cursor-based pagination with CachedPage pattern (analogous to use-paginated-accounts.ts)
    - Expose: items, loading, error, hasMore, hasPrevious, pageSize, goNext, goPrevious, setPageSize, retry
    - _Requirements: 13.7_

  - [x] 7.2 Create items column definitions
    - Create `projects/shop/src/features/inventory/items-columns.tsx`
    - Define columns: SKU (numeric), Title, Account (name), Category, Tag Price (CHF formatted), Quantity, Inventory Type, Actions (Edit/Delete buttons)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 7.3 Create ItemsTable component
    - Create `projects/shop/src/features/inventory/items-table.tsx`
    - Use shared DataTable and PaginationControls components
    - Accept data, loading, error, pagination props, onEdit, onDelete callbacks
    - _Requirements: 12.1, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 12.12_

- [x] 8. Implement frontend item form and dialogs
  - [x] 8.1 Create image upload sub-component
    - Create `projects/shop/src/features/inventory/image-upload.tsx`
    - Accept/reject files by type (JPEG, PNG, WebP) and size (≤5 MB)
    - Display thumbnail previews, upload progress indicators
    - Allow removal of individual images
    - Enforce max 10 images (reject entire batch if exceeded)
    - Upload via presigned URL, store s3Keys
    - Handle upload errors with retry option
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.7, 11.8, 11.9, 11.10_

  - [x] 8.2 Create ItemForm component
    - Create `projects/shop/src/features/inventory/item-form.tsx`
    - Two-column dialog layout: left (item attributes), right (inventory/pricing)
    - Fields: account dropdown (searchable), title, SKU (read-only), category, description, brand, color, size, details (rich text), image upload, quantity (default 1), tagPrice, tags, inventoryType (default "Consignment"), expirationDate (toggle + picker), shelf, split (% to consignor), terms (default "Return To Consignor"), taxExempt (toggle, default off)
    - Create mode: fetch next SKU, POST on submit, reset on success
    - Edit mode: populate fields, read-only SKU, PUT on submit
    - Client-side validation with inline errors
    - Server error mapping to inline or banner messages
    - Disable submit while submitting
    - ARIA labels, keyboard navigation, focus indicators
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15_

  - [x] 8.3 Create DeleteItemDialog component
    - Create `projects/shop/src/features/inventory/delete-item-dialog.tsx`
    - Show item title and SKU in confirmation message
    - On confirm: call deleteItem API, invoke onSuccess callback
    - Handle errors with contextual messages
    - _Requirements: 13.4, 13.5_

- [x] 9. Implement Items Page and wire everything together
  - [x] 9.1 Create ItemsPage component
    - Replace placeholder `inventory-page.tsx` with full `items-page.tsx`
    - Compose: ItemsTable, "Add Item" button, ItemForm dialog, DeleteItemDialog
    - "Add Item" → fetch next SKU → open form in create mode
    - Edit action → open form in edit mode with item data
    - Delete action → open delete dialog
    - On success (create/edit/delete) → close dialog + refresh table
    - Manage pagination state via usePaginatedItems
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x] 9.2 Update application routing to use new ItemsPage
    - Update the app router/navigation so the inventory route renders ItemsPage instead of the placeholder InventoryPage
    - _Requirements: 13.1_

- [x] 10. Infrastructure and API Gateway configuration
  - [x] 10.1 Add item API routes to API Gateway Terraform
    - Update `infrastructure/api-gateway.tf` to add routes:
      - `POST /api/items`
      - `PUT /api/items/{uuid}`
      - `DELETE /api/items/{uuid}`
      - `GET /api/items`
      - `GET /api/items/next-sku`
      - `POST /api/items/upload-url`
    - All routes use Cognito authorizer
    - _Requirements: 3.4, 4.6, 5.4, 6.6, 9.4_

  - [x] 10.2 Add S3 presigned URL permissions to Lambda IAM role
    - Update Terraform to grant the shop-api Lambda permission to generate presigned PUT URLs for the items S3 bucket/path
    - _Requirements: 11.9_

- [x] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout (both frontend and backend)
- SKU is a numeric shopUid (NOT a formatted string like "ITM-0000042")
- inventoryType values are "Consignment" and "Retail"
- Shared components (1.x) must be completed before items table (7.x) since both accounts and items depend on them

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.3"] },
    { "id": 1, "tasks": ["1.3", "1.4", "1.5", "2.2", "2.4", "6.1"] },
    { "id": 2, "tasks": ["2.5", "2.6", "4.1", "6.2", "6.3", "6.4"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.5", "4.6", "4.8", "4.10", "6.5"] },
    { "id": 4, "tasks": ["4.4", "4.7", "4.9", "4.11", "7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3"] },
    { "id": 7, "tasks": ["9.1", "10.1", "10.2"] },
    { "id": 8, "tasks": ["9.2"] }
  ]
}
```
