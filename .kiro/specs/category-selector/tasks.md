# Implementation Plan: Category Selector

## Overview

Replace the plain text Category input on the Item Capture Page with a searchable autocomplete component backed by a new `GET /api/categories` endpoint. The backend scans DynamoDB for category records and caches results in-memory. The frontend component maps between category names (displayed) and UUIDs (stored).

## Tasks

- [x] 1. Implement backend categories endpoint
  - [x] 1.1 Create list-categories route handler
    - Create `projects/shop-api/src/routes/list-categories.ts`
    - Implement `listCategories` handler with in-memory cache (5-min TTL)
    - Scan DynamoDB for records with PK beginning with `CATEGORY#` and SK = `METADATA`
    - Handle paginated scan (loop until `LastEvaluatedKey` is undefined)
    - Extract UUID from PK, return `{ id, name }` objects sorted alphabetically
    - Filter out items without a valid `name` string
    - Export `_resetCache()` for testing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 Register route in router
    - Add import and route entry `"GET /api/categories": listCategories` in `projects/shop-api/src/router.ts`
    - _Requirements: 5.1_

  - [ ]* 1.3 Write unit tests for list-categories
    - Create `projects/shop-api/tests/routes/list-categories.test.ts`
    - Test: successful scan, cached response, DynamoDB error returns 500, pagination handling, alphabetical sort, items without name are filtered
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Add API Gateway route
  - [x] 2.1 Add Terraform route for GET /api/categories
    - Add `aws_apigatewayv2_route` resource in `infrastructure/api-gateway.tf`
    - Route key: `GET /api/categories`
    - Use monolambda integration and Cognito authorizer
    - _Requirements: 2.1, 2.2_

- [x] 3. Implement frontend categories API client
  - [x] 3.1 Create categories-api module
    - Create `projects/shop/src/features/item-capture/categories-api.ts`
    - Implement `fetchCategories(signal?: AbortSignal)` with timeout handling (30s)
    - Return discriminated union: `{ success: true, categories }` or `{ success: false, error: "server" | "network" | "timeout" }`
    - Follow existing `pricing-api.ts` fetch pattern (auth session, bearer token)
    - _Requirements: 3.1, 3.5, 3.6_

- [x] 4. Implement CategoryAutocomplete component
  - [x] 4.1 Create CategoryAutocomplete component
    - Create `projects/shop/src/features/item-capture/category-autocomplete.tsx`
    - Fetch categories on mount with AbortController cleanup
    - Maintain bidirectional id↔name maps (useMemo)
    - Pass category names to existing `AutocompleteInput`
    - Translate name selections back to UUIDs via `onChange` callback
    - Display name for current UUID value prop
    - Accept `value`, `onChange`, `disabled`, `className` props
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 4.2 Write unit tests for CategoryAutocomplete
    - Create `projects/shop/src/features/item-capture/category-autocomplete.test.tsx`
    - Test: renders with categories, selecting a name fires onChange with UUID, displays name for given UUID value, handles fetch failure gracefully, aborts on unmount
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 5. Integrate into Item Capture Page
  - [x] 5.1 Replace plain Category input with CategoryAutocomplete
    - Update `projects/shop/src/features/item-capture/item-capture-page.tsx`
    - Replace the `<Input>` for category with `<CategoryAutocomplete value={categoryId} onChange={setCategoryId} />`
    - Ensure `categoryId` state continues to flow to PriceSuggestionPanel
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The design has a Correctness Properties section but the properties are better validated by unit tests than formal PBT for this small feature (UI mapping, sort order)
- The backend follows the same pattern as `canonical-lists.ts` (in-memory cache, error logging, generic error response)
- The frontend follows the same pattern as BrandAutocomplete/ColorAutocomplete but handles `{id, name}` objects instead of plain strings

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "4.1"] },
    { "id": 2, "tasks": ["4.2", "5.1"] }
  ]
}
```
