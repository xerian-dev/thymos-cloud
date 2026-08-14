# Design Document: Mac Pattern Capture

## Overview

This design adds pattern data capture to the macOS item-capture application. The pattern field stores the visual pattern/print of an item (e.g., Gestreift, Punkte, Kariert) as a canonical German value. The implementation touches four areas:

1. **Sync** — Fetch canonical pattern values from the API and reconcile them with the local SwiftData store.
2. **UI** — Add a Pattern autocomplete field to the item capture form.
3. **Pricing** — Include pattern-based adjustment in the local PricingEngine's exact-match calculation.
4. **Submission** — Include the pattern value in the item creation API payload.

The design follows existing patterns exactly: `SyncService.upsertCanonicalValues` for sync, `AutocompleteField` for the UI, the color-adjustment pattern in `PricingEngine.exactMatch` for pricing, and the existing `APIClient` request pattern for submission.

## Architecture

The feature fits entirely within the existing single-file-per-concern architecture:

```mermaid
graph LR
    subgraph Services
        API[APIClient]
        Sync[SyncService]
        PE[PricingEngine]
    end
    subgraph Models
        CV[CanonicalValue]
        PR[PricingRecord]
    end
    subgraph Views
        Form[ItemCaptureFormView]
        AF[AutocompleteField]
    end

    API -->|fetchCanonicalPatterns| Sync
    Sync -->|upsertCanonicalValues .pattern| CV
    CV -->|@Query kind=="pattern"| Form
    Form -->|candidates| AF
    Form -->|pattern changed| PE
    PR -->|filtered by pattern| PE
    Form -->|saveItem| API
```

No new files are created. All changes are additions to existing files.

## Components and Interfaces

### 1. CanonicalKind Enum Extension

Add a `.pattern` case to the existing `CanonicalKind` enum:

```swift
enum CanonicalKind: String, CaseIterable, Sendable {
    case brand
    case color
    case description
    case pattern  // NEW
}
```

### 2. APIClient — New Endpoint Method

Add `fetchCanonicalPatterns()` following the existing pattern of `fetchCanonicalColors()`:

```swift
func fetchCanonicalPatterns() async throws -> [String] {
    let data = try await request(path: "/pricing/canonical/patterns")
    let response = try decode(PatternsResponse.self, from: data)
    return response.patterns
}
```

With a corresponding response DTO:

```swift
struct PatternsResponse: Decodable {
    let patterns: [String]
}
```

### 3. SyncService — Pattern Sync Stage

Add a pattern sync step inside `syncCanonicalValues()`, following the exact pattern used for brands, colors, and descriptions:

```swift
await updateProgress("Syncing patterns...")
let patterns = try await apiClient.fetchCanonicalPatterns()
try upsertCanonicalValues(patterns, kind: .pattern)
```

The existing `upsertCanonicalValues(_:kind:)` handles insert/delete reconciliation generically — no new logic needed.

### 4. PricingRecord — Pattern Field

Add a `pattern` field to the `PricingRecord` SwiftData model:

```swift
var pattern: String  // Canonical pattern value from the pricing record
```

Update the initializer and the sync mapping in `SyncService.syncPricingRecords()` to persist the DTO's pattern field.

### 5. PricingRecordDTO — Pattern Field

Add `pattern` to the DTO so the JSON decoder captures it:

```swift
struct PricingRecordDTO: Decodable {
    // ... existing fields ...
    let pattern: String
}
```

### 6. PricingEngine — Pattern Adjustment

Add a pattern-based adjustment in `exactMatch()`, identical in structure to the existing color adjustment:

```swift
let patternMatches = records.filter { $0.pattern == pattern }
if !patternMatches.isEmpty && patternMatches.count != records.count {
    let patternMedian = medianValue(patternMatches.map(\.tagPrice))
    adjustment += (patternMedian - median) * 0.3
}
```

The `suggest()` method gains a `pattern` parameter:

```swift
func suggest(
    brand: String,
    categoryId: String,
    description: String,
    color: String,
    pattern: String,  // NEW
    size: String
) async -> PriceSuggestion?
```

### 7. ItemCaptureFormView — Pattern Field Wiring

The form already has a `@State private var pattern = ""` and a Pattern `LabeledContent` block. The changes needed:

1. Add a `@Query` for pattern canonical values (like the existing brand/color queries).
2. Wire the pattern candidates into the `AutocompleteField`.
3. Add `.onChange(of: pattern)` to trigger `notifyPriceFields()`.
4. Update `onPriceFieldsChanged` callback to include pattern.

### 8. ContentView — Updated Callback Signature

The `computeSuggestion` method and the `ItemCaptureFormView` callback gain a `pattern` parameter, passed through to `pricingEngine?.suggest(...)`.

### 9. Item Submission Payload

When saving an item, include `pattern` in the JSON body:
- If `pattern` is non-empty → `"pattern": "Gestreift"`
- If `pattern` is empty → omit the field or send `null`

## Data Models

### CanonicalValue (SwiftData) — No Schema Change

The existing `CanonicalValue` model already supports any kind via its `kind: String` field. Adding `.pattern` to the `CanonicalKind` enum is sufficient. Records will have:
- `compositeKey`: `"pattern:Gestreift"`
- `kind`: `"pattern"`
- `value`: `"Gestreift"`

### PricingRecord (SwiftData) — New Field

```swift
@Model
final class PricingRecord {
    // ... existing fields ...
    var pattern: String  // NEW — canonical pattern value, defaults to ""
}
```

Default value of `""` means existing records (migrated via SwiftData lightweight migration) get an empty pattern, which matches the semantics of "no pattern data available."

### API Request Payload (Item Creation)

```json
{
  "title": "Seidenbluse",
  "brand": "Zara",
  "categoryId": "uuid-here",
  "description": "Bluse",
  "color": "Blau",
  "pattern": "Gestreift",
  "size": "M",
  "tagPrice": 25.00
}
```

When pattern is empty, the field is omitted from the payload.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Sync reconciliation preserves exactly the API's pattern set

*For any* set of pattern values returned by the API and any pre-existing set of local pattern CanonicalValue records, after `upsertCanonicalValues` completes, the local store contains exactly the set of values from the API response (no stale values remain, no new values are missing).

**Validates: Requirements 1.2, 1.3, 1.4**

### Property 2: Pattern adjustment does not change suggestion when all records share the same pattern

*For any* non-empty set of PricingRecords where all records have the same pattern value, the pattern adjustment contribution to the suggested price is zero (the suggestion equals what it would be without a pattern adjustment).

**Validates: Requirements 3.3**

### Property 3: Pattern adjustment direction matches relative pricing

*For any* set of PricingRecords with at least two distinct pattern values, if the median tag price of records matching the query pattern is higher than the overall median, then the pattern adjustment is positive; if lower, then negative.

**Validates: Requirements 3.3**

### Property 4: Empty pattern is omitted from submission payload

*For any* item where the pattern field is an empty string, the serialized JSON payload does not contain a `"pattern"` key. For any item where pattern is non-empty, the payload contains `"pattern"` with the exact canonical value.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: Autocomplete filtering is case-insensitive prefix match

*For any* canonical pattern value and any query string that is a case-insensitive prefix of that value, the pattern appears in the filtered suggestions. For any query that is not a substring of the value, the pattern does not appear.

**Validates: Requirements 2.3**

## Error Handling

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| Pattern sync API request fails | Log error, continue with remaining sync stages | Matches existing sync error isolation (Req 1.5) |
| Pattern field in PricingRecordDTO is missing/null | Default to `""` | Backward-compatible with records that predate pattern |
| No pricing records match the given pattern | Pattern adjustment is 0, suggestion unaffected | Same as color adjustment when no matches |
| Network error during item save | Existing error handling in APIClient applies | No pattern-specific handling needed |

Error handling follows the existing patterns:
- `SyncService` wraps each stage in do/catch and logs failures without aborting the overall sync.
- `PricingEngine` treats missing data as "no adjustment" rather than an error.
- `APIClient` maps HTTP/network failures to `APIError` cases uniformly.

## Testing Strategy

### Unit Tests

- **Sync reconciliation**: Verify that calling `upsertCanonicalValues` with a new set correctly inserts new values and deletes stale ones. Use specific before/after examples.
- **Pricing engine with pattern**: Verify that `exactMatch` applies the pattern adjustment correctly with known record sets.
- **Payload serialization**: Verify that the item creation payload includes/omits pattern correctly.
- **Edge cases**: Empty pattern list from API, pattern field missing in DTO, single record in pricing set.

### Property-Based Tests

Property-based testing applies to the pure logic in this feature — specifically the sync reconciliation (set difference logic) and the pricing engine adjustment calculation. These are pure functions with clear inputs/outputs where input variation reveals edge cases.

- **Library**: swift-testing with custom generators (or SwiftCheck if available in the project)
- **Configuration**: Minimum 100 iterations per property test
- **Tag format**: `Feature: mac-pattern-capture, Property {N}: {description}`

Properties to implement:
1. Sync reconciliation (Property 1) — generate random before/after sets, verify final state equals API set
2. Pattern adjustment zero when uniform (Property 2) — generate records with uniform pattern, verify zero contribution
3. Pattern adjustment direction (Property 3) — generate records with known price distributions per pattern, verify sign
4. Payload serialization round-trip (Property 4) — generate items with/without pattern, verify JSON encoding
5. Autocomplete filtering (Property 5) — generate random query/candidate pairs, verify contains-match semantics

### Integration Tests

- Full sync cycle with mock API returning pattern data → verify SwiftData store state
- Form submission with pattern selected → verify HTTP request body
- Price recalculation triggered on pattern field change
