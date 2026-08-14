# Requirements Document

## Introduction

Add pattern data capture to the Mac item-capture application. The pattern field stores the visual pattern/print of an item (e.g., Striped, Dotted, Checked) as a canonical German value. Pattern is used alongside color data during price matching. The Mac app must allow operators to select a pattern when creating items, sync canonical pattern values from the API, and include pattern data in price suggestion calculations.

## Glossary

- **Item_Capture_App**: The macOS application used by operators to create new items, capture pricing data, and print labels.
- **Pattern_Selector**: The UI component within the item capture form that allows selection of a canonical pattern value.
- **Sync_Service**: The service responsible for syncing remote data (categories, canonical values, pricing records) into the local SwiftData store.
- **API_Client**: The HTTP client that communicates with the shop API to fetch and send data.
- **Pricing_Engine**: The local engine that computes price suggestions based on synced pricing records.
- **Canonical_Pattern**: A normalized German pattern name from the fixed set: Gestreift, Punkte, Kariert, Bedruckt, Camouflage, Uni.
- **Pricing_Record**: A local data record representing historical item pricing data used for price suggestions.

## Requirements

### Requirement 1: Sync Canonical Pattern Values

**User Story:** As an operator, I want the app to sync the list of canonical pattern values from the API, so that I can select from up-to-date pattern options when creating items.

#### Acceptance Criteria

1. WHEN the Sync_Service performs a full sync, THE Sync_Service SHALL fetch canonical pattern values from the `/pricing/canonical/patterns` API endpoint.
2. WHEN canonical pattern values are fetched successfully, THE Sync_Service SHALL store each value as a CanonicalValue record with kind `pattern` in the local SwiftData store.
3. WHEN a previously-synced pattern value is no longer returned by the API, THE Sync_Service SHALL delete the stale record from the local store.
4. WHEN a new pattern value is returned by the API that does not exist locally, THE Sync_Service SHALL insert a new CanonicalValue record for that value.
5. IF the pattern sync request fails, THEN THE Sync_Service SHALL log the error and continue with the remaining sync stages without interrupting the overall sync process.

### Requirement 2: Pattern Selection in Item Capture Form

**User Story:** As an operator, I want to select a pattern from the canonical list when creating an item, so that pattern data is captured consistently for price matching.

#### Acceptance Criteria

1. THE Item_Capture_App SHALL display the Pattern_Selector field in the item capture form, positioned between the Color field and the Brand field.
2. THE Pattern_Selector SHALL present the synced canonical pattern values as autocomplete candidates.
3. WHEN the operator types into the Pattern_Selector, THE Pattern_Selector SHALL filter the canonical pattern candidates using case-insensitive prefix matching.
4. WHEN the operator selects a pattern value, THE Item_Capture_App SHALL store the selected value in the item's `pattern` field.
5. THE Pattern_Selector SHALL allow the field to remain empty, treating pattern as an optional attribute.
6. WHEN the operator clears the Pattern_Selector, THE Item_Capture_App SHALL set the item's `pattern` field to an empty string.

### Requirement 3: Include Pattern in Pricing Engine

**User Story:** As an operator, I want the price suggestion to account for pattern data, so that suggestions are more accurate for items with distinct patterns.

#### Acceptance Criteria

1. THE Pricing_Record model SHALL include a `pattern` field that stores the canonical pattern value associated with the historical pricing data point.
2. WHEN the Sync_Service syncs pricing records, THE Sync_Service SHALL persist the `pattern` field from each pricing record DTO into the local Pricing_Record.
3. WHEN the Pricing_Engine performs an exact-match price lookup, THE Pricing_Engine SHALL include a pattern-based adjustment similar to the existing color adjustment (filtering records by matching pattern and weighting the median difference).
4. WHEN the operator changes the pattern field in the form, THE Item_Capture_App SHALL trigger a price suggestion recalculation using the updated pattern value.

### Requirement 4: Include Pattern in Item Submission

**User Story:** As an operator, I want the captured pattern to be sent to the API when saving an item, so that pattern data is persisted in the backend.

#### Acceptance Criteria

1. WHEN the operator saves an item with a pattern selected, THE API_Client SHALL include the `pattern` field in the item creation request payload.
2. WHEN the operator saves an item without a pattern selected, THE API_Client SHALL omit the `pattern` field from the request payload or send it as null.
3. THE Item_Capture_App SHALL send the canonical pattern value (not a translated or display variant) in the API request.

### Requirement 5: Add Pattern Kind to Canonical Value Model

**User Story:** As a developer, I want the CanonicalKind enum to include a `pattern` case, so that pattern values are stored and queried consistently with brands, colors, and descriptions.

#### Acceptance Criteria

1. THE Item_Capture_App SHALL define a `pattern` case in the CanonicalKind enum with raw value `"pattern"`.
2. WHEN querying canonical values for the pattern field, THE Item_Capture_App SHALL use a SwiftData predicate filtering CanonicalValue records where `kind == "pattern"`.
