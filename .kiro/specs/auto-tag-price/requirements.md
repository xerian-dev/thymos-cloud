# Requirements Document

## Introduction

This feature adds AI-driven tag price suggestions for consignment items in the shop. The system analyses historical sales data, item attributes (brand, category, creator, color, size), and sales velocity to generate a recommended tag price when a new consignment item is being entered. The goal is to reduce pricing inconsistency across employees, improve sell-through rates, and surface systematic over- or under-pricing patterns.

The system is conservative by design: it reduces prices readily when data shows poor sales performance for an item type, but only increases prices when there is very strong evidence of systematic underpricing. All suggestions come with explanations, and operators can always override. When the model adjusts reference pricing from historical norms, the user is informed and a report is available showing all changes with reasoning.

Only consignment items are priced by this system — retail item prices are set by the seller and are never modified or suggested by the model.

A new standalone Item Capture UI (POC) is introduced for validating the pricing model and optimising the item entry workflow. At this stage, items are not created in the system — the UI is a prototype. Future work will integrate with the ConsignCloud API to create items.

Data cleanup (brand/colour normalisation) includes integration with the existing ConsignCloud import pipeline, so future imports automatically produce clean data without repeated manual cleanup.

## Glossary

- **Auto_Price_Model**: The pricing engine that computes a suggested tag price based on historical data and item attributes
- **Reference_Price**: The baseline price for a brand×category group, derived from median historical sale prices of comparable sold items
- **Pricing_Reference_Table**: A DynamoDB entity storing pre-computed pricing statistics per brand×category group, recalculated weekly
- **Brand_Category_Group**: The primary comparable unit — items sharing the same canonical brand AND category
- **Velocity_Multiplier**: An adjustment factor (0.90–1.10) applied to the reference price based on sell-through rate
- **Creator_Adjustment**: A calibration factor based on the item creator (employee) historical pricing accuracy
- **Sell_Through_Rate**: The ratio of sold items to total items in a brand×category group over a rolling 6-month window
- **Price_Ratio**: The ratio of median actual sale price to median tag price for a group — indicates systematic over/under-pricing
- **Clearance_Sale**: An end-of-season event where all remaining items are discounted; included in pricing calculations (not excluded)
- **Confidence_Level**: A classification (high/medium/low) indicating how much data backs a price suggestion
- **Adjustment_Report**: A report showing all brand×category groups where the model has changed reference pricing, with explanations
- **Data_Cleanup**: The process of normalising brand names and colours to canonical forms for accurate grouping
- **Canonical_Brand_List**: A reference table of approved brand name spellings used for normalisation and autocomplete
- **Canonical_Color_List**: A reference table of approved colour names (in English) used for normalisation and autocomplete
- **Pricing_Aggregator**: A scheduled Lambda that computes pricing statistics from item and sale data and writes the Pricing_Reference_Table; also runnable on demand
- **Price_Suggestion_Service**: A Lambda (or function within the shop-api) invoked at item creation to return a suggested tag price with explanation
- **Item_Capture_UI**: A new standalone UI optimised for rapid consignment item entry with AI price suggestions; does not create items in the system (POC stage — future integration will create items via the ConsignCloud API)
- **Import_Mapping**: The application of canonical brand/colour mappings during the ConsignCloud import process, ensuring newly imported items arrive with clean data

## Requirements

### Requirement 1: Data Cleanup — Brand Normalisation

**User Story:** As a shop operator, I want brand names to be consistently spelled, so that pricing data is accurately grouped and the AI can make reliable price suggestions.

#### Acceptance Criteria

1. THE system SHALL provide a mechanism to extract all distinct `brand` values from consignment items in the Shop_Table
2. THE system SHALL cluster similar brand names using fuzzy matching (Levenshtein distance or equivalent) and produce a proposed mapping of raw values to canonical forms
3. THE system SHALL present the proposed brand mappings for human review and approval before applying any changes
4. WHEN brand mappings are approved, THE system SHALL batch-update all affected item records in the Shop_Table to use the canonical brand name
5. WHEN a brand name is normalised on an item record, THE system SHALL preserve the original raw value in a `sourceBrand` attribute for traceability
6. THE batch update SHALL be idempotent — re-running it with the same mappings SHALL NOT create duplicate `sourceBrand` entries or overwrite previously preserved values
7. THE system SHALL store the canonical brand list as a queryable reference (DynamoDB entity or configuration) for use by autocomplete and validation

### Requirement 2: Data Cleanup — Color Normalisation

**User Story:** As a shop operator, I want colour values to be consistently named in English, so that colour-based pricing adjustments are accurate.

#### Acceptance Criteria

1. THE system SHALL provide a mechanism to extract all distinct `color` values from consignment items in the Shop_Table
2. THE system SHALL map colour values to canonical English colour names using a predefined mapping table that handles German equivalents, misspellings, and compound colours
3. THE system SHALL present the proposed colour mappings for human review and approval before applying any changes
4. WHEN colour mappings are approved, THE system SHALL batch-update all affected item records in the Shop_Table to use the canonical colour name
5. WHEN a colour is normalised on an item record, THE system SHALL preserve the original raw value in a `sourceColor` attribute for traceability
6. THE batch update SHALL be idempotent
7. THE system SHALL store the canonical colour list as a queryable reference for use by autocomplete and validation

### Requirement 3: Pricing Statistics Aggregation

**User Story:** As a shop owner, I want the system to automatically compute pricing statistics from historical data, so that price suggestions are based on current market behaviour.

#### Acceptance Criteria

1. THE Pricing_Aggregator SHALL run on a weekly schedule (configurable via environment variable) AND SHALL also be invocable on demand via an API endpoint or manual Lambda invocation
2. THE Pricing_Aggregator SHALL compute the following metrics per brand×category group using only consignment items with status `sold`: median tag price, median sale price, sell-through rate, median days-on-shelf, discount frequency, sample size (number of sold items)
3. THE Pricing_Aggregator SHALL use a rolling 6-month window of sale data for all calculations
4. THE Pricing_Aggregator SHALL include ALL sales data in its calculations, including end-of-season clearance sales (no sales data is excluded)
5. THE Pricing_Aggregator SHALL compute per-employee pricing accuracy: the median ratio of `salePrice / tagPrice` for items created by each employee, using finalized sales only
6. THE Pricing_Aggregator SHALL write computed statistics to the Pricing_Reference_Table in DynamoDB, one record per brand×category group
7. THE Pricing_Aggregator SHALL compute colour and size adjustment factors per brand×category group: the median price deviation from the group median for each colour and size value
8. WHEN the Pricing_Aggregator writes a new record for a brand×category group, IT SHALL preserve the previous record's reference price as `previousReferencePrice` for change detection
9. IF a brand×category group has fewer than 5 sold items in the window, THE Pricing_Aggregator SHALL mark it as `lowConfidence: true` and fall back to category-only statistics for the reference price
10. THE Pricing_Aggregator SHALL log execution metrics (groups processed, records written, duration) to CloudWatch
11. THE system SHALL expose a `POST /api/pricing/aggregate` endpoint that triggers the Pricing_Aggregator on demand (authenticated, returns immediately with acknowledgment while aggregation runs asynchronously)

### Requirement 4: Import Data Mapping

**User Story:** As a shop owner, I want future ConsignCloud imports to automatically apply canonical brand and colour mappings, so that newly imported items arrive with clean data without requiring repeated manual cleanup.

#### Acceptance Criteria

1. WHEN the item import process maps a ConsignCloud item, IT SHALL look up the item's `brand` value against the canonical brand mapping table
2. IF a mapping exists for the imported brand value (exact match or known alias), THE import mapper SHALL store the canonical brand name on the item record and preserve the original CC value in `sourceBrand`
3. IF no mapping exists for the imported brand value, THE import mapper SHALL store the brand value as-is (no transformation) and flag it for future cleanup review
4. WHEN the item import process maps a ConsignCloud item, IT SHALL look up the item's `color` value against the canonical colour mapping table
5. IF a mapping exists for the imported colour value (exact match or known alias), THE import mapper SHALL store the canonical colour name on the item record and preserve the original CC value in `sourceColor`
6. IF no mapping exists for the imported colour value, THE import mapper SHALL store the colour value as-is and flag it for future cleanup review
7. THE import mapping lookup SHALL be performant — canonical lists SHALL be loaded once at import job start and cached in memory for the duration of the import
8. THE import mapping SHALL NOT fail the item import if a brand or colour cannot be mapped — unmapped values are stored as-is

### Requirement 5: Price Suggestion at Item Creation

**User Story:** As a shop operator creating a new consignment item, I want the system to suggest a tag price based on comparable items, so that pricing is consistent and data-driven.

#### Acceptance Criteria

1. WHEN a new item is created with `inventoryType: "Consignment"`, THE Price_Suggestion_Service SHALL return a suggested tag price along with the item creation response
2. THE suggested price SHALL be computed as: `referencePrice × velocityMultiplier × creatorAdjustment × colorAdjustment × sizeAdjustment`
3. THE Price_Suggestion_Service SHALL look up the brand×category group in the Pricing_Reference_Table to obtain the reference price and velocity multiplier
4. IF the item's brand×category group exists in the Pricing_Reference_Table, THE service SHALL use that group's reference price
5. IF the item's brand×category group does NOT exist (brand unknown or insufficient data), THE service SHALL fall back to category-only reference price
6. IF neither brand×category nor category-only data exists, THE service SHALL return no suggestion (null) with a reason indicating insufficient data
7. THE Price_Suggestion_Service SHALL apply the creator adjustment based on the item creator's historical pricing accuracy from the Pricing_Reference_Table
8. IF the creator has fewer than 10 priced-and-sold items in the reference data, THE service SHALL NOT apply a creator adjustment (factor = 1.0)
9. THE Price_Suggestion_Service SHALL apply colour and size adjustments if the item's colour/size values have adjustment factors in the Pricing_Reference_Table for that brand×category group
10. IF the item's colour or size has no adjustment factor (insufficient data or value not present), THE service SHALL use a neutral adjustment (factor = 1.0)
11. THE Price_Suggestion_Service SHALL return a confidence level: high (>= 20 sold items in group), medium (5-19 sold items), or low (fallback/insufficient data)
12. THE Price_Suggestion_Service SHALL NOT generate suggestions for items with `inventoryType: "Retail"`
13. THE suggested price SHALL be rounded to the nearest CHF 0.05 (Swiss rounding convention)

### Requirement 6: Price Suggestion Explanation

**User Story:** As a shop operator, I want to understand why the AI suggests a particular price, so that I can make an informed decision to accept or override it.

#### Acceptance Criteria

1. WHEN a price suggestion is returned, IT SHALL include a human-readable explanation string describing the basis for the suggestion
2. THE explanation SHALL include: the reference price source (brand×category group name), the sample size, and any adjustments applied (velocity, creator, colour, size)
3. IF the velocity multiplier differs from 1.0, THE explanation SHALL state whether the group has poor sell-through (reduced) or strong sell-through (increased) and by what percentage
4. IF a creator adjustment is applied, THE explanation SHALL state that the creator's historical pricing tendency was factored in and the direction of adjustment
5. IF the model falls back to category-only pricing, THE explanation SHALL state that insufficient brand-specific data was available
6. IF no suggestion can be made, THE explanation SHALL state the reason (e.g., "No pricing data available for this category")

### Requirement 7: Reference Price Adjustment Notification

**User Story:** As a shop owner, I want to be informed when the AI adjusts reference pricing for item groups, so that I understand how the system's pricing behaviour is changing over time.

#### Acceptance Criteria

1. WHEN the Pricing_Aggregator computes a new reference price that differs from the previous reference price for a brand×category group by more than 2%, THE system SHALL record an adjustment event
2. THE adjustment event SHALL include: brand, category, previous reference price, new reference price, direction (increase/decrease), percentage change, and the reason (sell-through rate change, new sales data, etc.)
3. THE system SHALL store adjustment events in DynamoDB for retrieval by the adjustment report
4. THE system SHALL limit automatic reference price decreases to a maximum of 15% per recalculation cycle
5. THE system SHALL limit cumulative reference price decreases to a maximum of 30% from the original baseline for any group
6. THE system SHALL only increase a reference price when ALL of the following are true: sell-through > 80%, median sale price >= median tag price, median days-on-shelf < 14 days, AND sample size >= 10 items
7. THE system SHALL limit automatic reference price increases to a maximum of 10% per cycle

### Requirement 8: Adjustment Report API

**User Story:** As a shop owner, I want an API endpoint to retrieve pricing adjustment history, so that I can review how the AI's pricing has changed over time.

#### Acceptance Criteria

1. THE Shop_API SHALL expose a `GET /api/pricing/adjustments` endpoint that returns a paginated list of adjustment events
2. THE endpoint SHALL accept optional query parameters: `direction` (increase/decrease), `brand`, `category`, `fromDate`, `toDate`
3. THE response SHALL include for each adjustment: brand, category, previousPrice, newPrice, direction, percentageChange, reason, supporting metrics (sellThroughRate, medianDaysOnShelf, sampleSize), and timestamp
4. THE endpoint SHALL return results ordered by timestamp descending (most recent first)
5. THE endpoint SHALL support cursor-based pagination with configurable page size (20/50/100, default 20)
6. WHEN the caller is not authenticated via the Cognito authorizer, THE endpoint SHALL return a 401 response

### Requirement 9: Adjustment Report UI

**User Story:** As a shop owner, I want a page in the application showing pricing adjustments, so that I can visually review what the AI has changed and why.

#### Acceptance Criteria

1. THE Adjustment_Report page SHALL display a table of pricing adjustments with columns: Date, Brand, Category, Previous Price (CHF), New Price (CHF), Change (%), Direction (↑/↓), Reason
2. THE Adjustment_Report page SHALL provide filters for: direction (all/increase/decrease), brand (searchable dropdown), category (dropdown), and date range
3. THE Adjustment_Report page SHALL use cursor-based pagination with the shared PaginationControls component
4. WHEN a row is expanded or clicked, THE Adjustment_Report page SHALL display supporting metrics: sell-through rate, median days-on-shelf, sample size, discount frequency
5. THE Adjustment_Report page SHALL display a summary banner showing: total adjustments in current view, number of increases vs decreases, average change magnitude
6. THE Adjustment_Report page SHALL be accessible from the main navigation under a "Pricing" section
7. WHILE data is loading, THE page SHALL display a loading indicator
8. IF the data fetch fails, THE page SHALL display an error message with a Retry button

### Requirement 10: Item Capture UI (POC)

**User Story:** As a shop operator, I want a dedicated item capture interface optimised for rapid consignment item entry, so that I can quickly enter item details and see AI price suggestions without the overhead of the full item management form.

#### Acceptance Criteria

1. THE system SHALL provide a new standalone Item_Capture_UI page, separate from the existing item creation form, accessible from the main navigation
2. THE Item_Capture_UI SHALL be optimised for speed of data entry with a minimal, focused layout
3. THE Item_Capture_UI SHALL include fields for: brand (with autocomplete), category (dropdown), color (with autocomplete), size, title, and any other attributes needed for price suggestion
4. WHEN the operator has entered sufficient data (at minimum brand or category), THE Item_Capture_UI SHALL request and display a price suggestion from the Price_Suggestion_Service
5. THE Item_Capture_UI SHALL display the suggested price prominently with confidence level and explanation
6. THE Item_Capture_UI SHALL provide a one-click "Use Suggestion" button that populates the tag price field
7. THE operator SHALL always be able to manually enter any tag price regardless of the suggestion
8. THE Item_Capture_UI SHALL NOT create items in the shop system at this POC stage — it is a prototype for validating the pricing model and capture workflow
9. THE Item_Capture_UI SHALL display a clear indicator that items are not being saved (e.g., "Preview Mode — items will not be created")
10. THE price suggestion SHALL update in real-time as the operator changes brand, category, color, or size fields (debounced)
11. THE Item_Capture_UI SHALL be accessible with proper ARIA labels, keyboard navigation, and visible focus indicators
12. IN FUTURE (out of scope for POC), the Item_Capture_UI will create items via the ConsignCloud API

### Requirement 11: Brand and Color Autocomplete in Item Capture UI

**User Story:** As a shop operator entering a new item, I want brand and colour fields to suggest canonical values, so that data stays clean and the pricing model can group items accurately.

#### Acceptance Criteria

1. WHEN the operator types in the brand field, THE Item_Capture_UI SHALL display autocomplete suggestions from the Canonical_Brand_List filtered by the input text
2. WHEN the operator types in the color field, THE Item_Capture_UI SHALL display autocomplete suggestions from the Canonical_Color_List filtered by the input text
3. IF the operator enters a brand value that fuzzy-matches an existing canonical brand (Levenshtein distance ≤ 2), THE form SHALL display a suggestion: "Did you mean [canonical brand]?"
4. THE operator SHALL always be able to enter a free-text value that is not in the canonical list (the field is not restricted to list values only)
5. WHEN a free-text brand value is entered that does not match any canonical brand, THE system SHALL flag it for periodic review (stored as-is, queued for cleanup review)
6. THE autocomplete SHALL load canonical lists on page mount and cache them for the session duration
7. THE autocomplete dropdowns SHALL be accessible with keyboard navigation (arrow keys to navigate, Enter to select, Escape to dismiss)
