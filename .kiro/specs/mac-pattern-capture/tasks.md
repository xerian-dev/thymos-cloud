# Implementation Plan: Mac Pattern Capture

## Overview

Add pattern data capture to the macOS item-capture app. All changes go into the single file `projects/item-capture-mac/Sources/ItemCaptureApp.swift`, following existing patterns for color/brand canonical values, sync stages, pricing adjustments, and form fields.

## Tasks

- [x] 1. Extend data model and enum for pattern support
  - [x] 1.1 Add `pattern` case to the CanonicalKind enum
    - Add `case pattern` to the existing `CanonicalKind: String, CaseIterable, Sendable` enum
    - _Requirements: 5.1_
  - [x] 1.2 Add `pattern` field to PricingRecord SwiftData model
    - Add `var pattern: String` with default value `""` to the `PricingRecord` model
    - Update the PricingRecord initializer to accept a `pattern` parameter with a default of `""`
    - _Requirements: 3.1_
  - [x] 1.3 Add `pattern` field to PricingRecordDTO
    - Add `let pattern: String` to the `PricingRecordDTO` Decodable struct
    - Use a custom `init(from decoder:)` or `CodingKeys` with default handling so missing values decode to `""`
    - _Requirements: 3.1, 3.2_

- [x] 2. Implement API client and sync for patterns
  - [x] 2.1 Add `PatternsResponse` DTO and `fetchCanonicalPatterns()` to APIClient
    - Create `struct PatternsResponse: Decodable` with `let patterns: [String]`
    - Add `func fetchCanonicalPatterns() async throws -> [String]` following the same pattern as `fetchCanonicalColors()`
    - Endpoint: `/pricing/canonical/patterns`
    - _Requirements: 1.1_
  - [x] 2.2 Add pattern sync stage to SyncService
    - Inside `syncCanonicalValues()`, add a pattern sync step after the existing stages
    - Call `await apiClient.fetchCanonicalPatterns()` and pass result to `upsertCanonicalValues(patterns, kind: .pattern)`
    - Wrap in do/catch, log error and continue on failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 2.3 Update PricingRecord sync mapping to persist pattern
    - In `SyncService.syncPricingRecords()`, map the DTO's `pattern` field to the PricingRecord model when creating/updating records
    - _Requirements: 3.2_

- [x] 3. Checkpoint
  - Ensure the app compiles successfully with the new model and sync changes. Ask the user if questions arise.

- [x] 4. Implement pricing engine pattern adjustment
  - [x] 4.1 Add `pattern` parameter to PricingEngine suggest method
    - Update `suggest()` signature to accept a `pattern: String` parameter
    - Pass pattern through to `exactMatch()`
    - _Requirements: 3.3_
  - [x] 4.2 Implement pattern-based adjustment in exactMatch
    - Filter records where `$0.pattern == pattern`
    - If pattern matches exist and don't equal the full set, compute `patternMedian` from `tagPrice` values
    - Apply adjustment: `adjustment += (patternMedian - median) * 0.3`
    - Follow the exact structure of the existing color adjustment
    - _Requirements: 3.3_
  - [ ]* 4.3 Write property test for pattern adjustment zero when uniform (Property 2)
    - **Property 2: Pattern adjustment does not change suggestion when all records share the same pattern**
    - **Validates: Requirements 3.3**
  - [ ]* 4.4 Write property test for pattern adjustment direction (Property 3)
    - **Property 3: Pattern adjustment direction matches relative pricing**
    - **Validates: Requirements 3.3**

- [x] 5. Implement pattern field in item capture form
  - [x] 5.1 Add @Query for pattern canonical values and wire AutocompleteField
    - Add a `@Query` filtering `CanonicalValue` where `kind == "pattern"` (following the existing brand/color query pattern)
    - Add an `AutocompleteField` for pattern in the form between the color field and the brand field
    - Wire the queried canonical values as autocomplete candidates
    - _Requirements: 2.1, 2.2, 5.2_
  - [x] 5.2 Implement pattern filtering and selection behavior
    - The AutocompleteField already implements case-insensitive prefix filtering — pass the pattern candidates to it
    - Ensure the pattern field can remain empty (optional attribute)
    - When cleared, the pattern binding resets to `""`
    - _Requirements: 2.3, 2.4, 2.5, 2.6_
  - [x] 5.3 Wire pattern change to price recalculation
    - Add `.onChange(of: pattern)` modifier to trigger `notifyPriceFields()`
    - Update `onPriceFieldsChanged` callback and `computeSuggestion` in ContentView to pass pattern to PricingEngine
    - _Requirements: 3.4_
  - [ ]* 5.4 Write property test for autocomplete filtering (Property 5)
    - **Property 5: Autocomplete filtering is case-insensitive prefix match**
    - **Validates: Requirements 2.3**

- [x] 6. Include pattern in item submission payload
  - [x] 6.1 Update item creation request to include pattern
    - When pattern is non-empty, include `"pattern": "<value>"` in the JSON body
    - When pattern is empty, omit the `pattern` key from the payload (or send null)
    - Send the canonical value exactly as stored (not translated)
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ]* 6.2 Write property test for payload serialization (Property 4)
    - **Property 4: Empty pattern is omitted from submission payload**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 7. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- All changes are in `projects/item-capture-mac/Sources/ItemCaptureApp.swift`
- Follow existing patterns exactly: color adjustment in PricingEngine, AutocompleteField usage, upsertCanonicalValues for sync
- Property tests validate universal correctness properties from the design document
- The `upsertCanonicalValues(_:kind:)` method already handles insert/delete reconciliation generically

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "5.2", "6.1"] },
    { "id": 5, "tasks": ["4.3", "4.4", "5.3", "5.4", "6.2"] }
  ]
}
```
