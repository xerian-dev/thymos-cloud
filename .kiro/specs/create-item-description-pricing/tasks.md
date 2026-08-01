# Implementation Plan: Create Item Description & Pricing

## Overview

Add a description autocomplete field to the item capture form, backed by a canonical descriptions API endpoint, and wire it into the price suggestion flow. The implementation follows the existing BrandAutocomplete/fetchCanonicalBrands/listCanonicalBrands pattern exactly.

## Tasks

- [x] 1. Backend: Add canonical descriptions endpoint
  - [x] 1.1 Add `listCanonicalDescriptions` handler to `canonical-lists.ts`
    - Add `descriptionsCache` variable following the same `CacheEntry` pattern as brands/colors
    - Implement `listCanonicalDescriptions` function querying `CANONICAL#DESCRIPTIONS` PK
    - Return JSON `{ descriptions: string[] }` response
    - Update `_resetCaches` to also clear `descriptionsCache`
    - _Requirements: 3.1, 3.2_

  - [x] 1.2 Register route in `router.ts`
    - Import `listCanonicalDescriptions` from `canonical-lists.js`
    - Add route entry `"GET /api/pricing/canonical/descriptions": listCanonicalDescriptions`
    - _Requirements: 3.1_

- [x] 2. Frontend: Extract levenshtein utility to shared lib
  - [x] 2.1 Create `projects/shop/src/lib/levenshtein.ts`
    - Extract `levenshteinDistance` function from `brand-autocomplete.tsx`
    - Extract `findFuzzyMatch` function as a generic utility accepting `(input: string, canonicalValues: string[])` params
    - Export both functions as named exports
    - _Requirements: 1.4_

  - [x] 2.2 Update `brand-autocomplete.tsx` to import from shared lib
    - Remove the inline `levenshteinDistance` and `findFuzzyMatch` functions
    - Import `levenshteinDistance` and `findFuzzyMatch` from `@/lib/levenshtein`
    - Verify existing behavior is unchanged
    - _Requirements: 1.4_

- [x] 3. Frontend: Add `fetchCanonicalDescriptions` to pricing API client
  - [x] 3.1 Add `fetchCanonicalDescriptions` function to `pricing-api.ts`
    - Follow the exact same pattern as `fetchCanonicalBrands`
    - Call `GET /api/pricing/canonical/descriptions`
    - Parse response as `{ descriptions: string[] }` and return via `CanonicalListResult`
    - _Requirements: 3.3, 3.4_

  - [x] 3.2 Add `description` parameter to `fetchPriceSuggestion`
    - Add optional `description?: string` to the params object
    - Include `description` as a query parameter when non-empty
    - Omit the parameter when empty or undefined
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Frontend: Create DescriptionAutocomplete component
  - [x] 5.1 Create `projects/shop/src/features/item-capture/description-autocomplete.tsx`
    - Follow the `BrandAutocomplete` component pattern
    - Load canonical descriptions on mount via `fetchCanonicalDescriptions`
    - Use `AutocompleteInput` with a custom `substringFilter` for case-insensitive substring matching
    - Implement fuzzy matching using `findFuzzyMatch` from `@/lib/levenshtein` with debounced "Did you mean?" suggestion
    - On load failure, render a plain text `<input>` as fallback
    - Allow free-text entry that doesn't match any canonical description
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 5.2 Write property test for substring filter
    - **Property 1: Substring filter returns only matching items**
    - **Validates: Requirements 1.2**

  - [ ]* 5.3 Write property test for fuzzy match correctness
    - **Property 2: Fuzzy match correctness within Levenshtein distance**
    - **Validates: Requirements 1.4**

- [x] 6. Frontend: Integrate description into item capture page and price suggestion
  - [x] 6.1 Add description field to `item-capture-page.tsx`
    - Add `description` state variable
    - Import and render `DescriptionAutocomplete` between category and color fields
    - Label the field "Description"
    - Pass `description` prop to `PriceSuggestionPanel`
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 6.2 Update `PriceSuggestionPanel` trigger logic
    - Add `description: string` to `PriceSuggestionPanelProps` interface
    - Change trigger guard from `if (!categoryId)` to `if (!categoryId && !description)`
    - Pass `description` to `fetchPriceSuggestion` params
    - Add `description` to the `useEffect` dependency array
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.2_

  - [ ]* 6.3 Write property test for price suggestion trigger condition
    - **Property 3: Price suggestion trigger fires when at least one identifier is present**
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 6.4 Write property test for description parameter inclusion
    - **Property 4: Description parameter inclusion in URL**
    - **Validates: Requirements 5.2, 5.3**

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The implementation follows the existing BrandAutocomplete pattern exactly per project conventions
- TypeScript strict mode applies to all new code

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2"] },
    { "id": 2, "tasks": ["5.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 4, "tasks": ["6.2"] },
    { "id": 5, "tasks": ["6.3", "6.4"] }
  ]
}
```
