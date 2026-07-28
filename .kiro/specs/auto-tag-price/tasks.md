# Implementation Plan: Auto Tag Price

## Overview

This plan implements AI-driven tag price suggestions for consignment items. It starts with core pricing pure functions, then data cleanup tooling (brand/colour normalisation), followed by import mapping integration, the pricing aggregation engine, backend API routes, and finally the frontend (Item Capture UI POC and Adjustment Report). All sales data is included in pricing calculations (no clearance exclusion).

## Tasks

- [x] 1. Implement core pricing pure functions
  - [x] 1.1 Create Swiss rounding utility
    - Create `projects/shop-api/src/pricing/swiss-rounding.ts`
    - Implement `roundToSwiss5(price: number): number` — rounds to nearest CHF 0.05
    - Formula: `Math.round(price * 20) / 20`
    - Export the function
    - _Requirements: 5.13_

  - [x] 1.2 Write property test for Swiss rounding (Property 1)
    - Create `projects/shop-api/tests/pricing/swiss-rounding.property.test.ts`
    - For any non-negative number, result is a multiple of 0.05 and differs from input by at most 0.025
    - **Validates: Requirement 5.13**

  - [x] 1.3 Create velocity multiplier function
    - Create `projects/shop-api/src/pricing/velocity-multiplier.ts`
    - Implement `computeVelocityMultiplier(sellThroughRate: number, priceRatio: number, medianDaysOnShelf: number, sampleSize: number): number`
    - Rules: sellThrough < 0.30 → 0.90-0.95 (linear interpolation); 0.30-0.70 → 1.0; > 0.80 → 1.05-1.10 only if priceRatio >= 1.0 AND medianDaysOnShelf < 14 AND sampleSize >= 10
    - Transitional band 0.70-0.80: multiplier = 1.0 (no adjustment in the gap)
    - _Requirements: 5.2, 7.4, 7.5, 7.6_

  - [x] 1.4 Write property test for velocity multiplier (Property 2)
    - Create `projects/shop-api/tests/pricing/velocity-multiplier.property.test.ts`
    - Output always in [0.90, 1.10], correct band for each sell-through range
    - **Validates: Requirements 5.2, 7.4, 7.5**

  - [x] 1.5 Create adjustment cap functions
    - Create `projects/shop-api/src/pricing/adjustment-caps.ts`
    - Implement `capDecrease(previousPrice: number, newPrice: number, originalBaseline: number): number`
    - Implement `capIncrease(previousPrice: number, newPrice: number): number`
    - Implement `shouldAllowIncrease(sellThrough: number, priceRatio: number, medianDaysOnShelf: number, sampleSize: number): boolean`
    - Decrease: max 15% per cycle, max 30% from original baseline
    - Increase: max 10% per cycle, only when all conditions met
    - _Requirements: 7.4, 7.5, 7.6, 7.7_

  - [x] 1.6 Write property tests for adjustment caps (Properties 3, 4)
    - Create `projects/shop-api/tests/pricing/adjustment-caps.property.test.ts`
    - Property 3: capped decrease >= prev _0.85 AND >= baseline_ 0.70
    - Property 4: capped increase <= prev * 1.10, only applied when conditions met
    - **Validates: Requirements 7.4, 7.5, 7.6, 7.7**

  - [x] 1.7 Create price calculator function
    - Create `projects/shop-api/src/pricing/price-calculator.ts`
    - Implement `calculateSuggestedPrice(params: PriceCalculationInput): PriceCalculationResult`
    - Compose: referencePrice × velocityMultiplier × creatorAdjustment × colorAdjustment × sizeAdjustment
    - Apply Swiss rounding to final result
    - Default all adjustments to 1.0 when not provided
    - _Requirements: 5.2, 5.7, 5.9, 5.10, 5.13_

  - [x] 1.8 Write property test for price calculator (Property 5)
    - Create `projects/shop-api/tests/pricing/price-calculator.property.test.ts`
    - Result equals composition formula rounded to 0.05
    - **Validates: Requirements 5.2, 5.7, 5.9, 5.10**

  - [x] 1.9 Create confidence level classifier
    - Create `projects/shop-api/src/pricing/confidence-level.ts`
    - Implement `classifyConfidence(sampleSize: number): "high" | "medium" | "low"`
    - >= 20 → high; 5-19 → medium; < 5 → low
    - _Requirements: 5.11_

  - [x] 1.10 Write property test for confidence level (Property 6)
    - Create `projects/shop-api/tests/pricing/confidence-level.property.test.ts`
    - Correct classification for all integer sample sizes >= 0
    - **Validates: Requirements 5.11, 5.6**

  - [x] 1.11 Create explanation builder
    - Create `projects/shop-api/src/pricing/explanation-builder.ts`
    - Implement `buildExplanation(params: ExplanationInput): string`
    - Include: reference source (brand×category or category-only), sample size, velocity adjustment description, creator adjustment description
    - Handle null/insufficient data case
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 2. Implement data cleanup scripts
  - [x] 2.1 Create brand extraction script
    - Create `projects/shop-api/scripts/data-cleanup/extract-brands.ts`
    - Query all distinct `brand` values from consignment items in the shop table
    - Output: JSON file with unique brand values and their item counts
    - _Requirements: 1.1_

  - [x] 2.2 Create brand clustering utility
    - Create `projects/shop-api/scripts/data-cleanup/cluster-brands.ts`
    - Implement Levenshtein distance comparison between all brand pairs
    - Group brands with distance <= 2 into clusters
    - Output: JSON mapping file `{ raw: string, canonical: string }[]` for human review
    - _Requirements: 1.2_

  - [x] 2.3 Create colour extraction and mapping script
    - Create `projects/shop-api/scripts/data-cleanup/extract-colors.ts`
    - Query all distinct `color` values from consignment items
    - Apply predefined English canonical colour mapping (German → English, misspellings → canonical)
    - Output: JSON mapping file for human review
    - _Requirements: 2.1, 2.2_

  - [x] 2.4 Create batch mapping application script
    - Create `projects/shop-api/scripts/data-cleanup/apply-mappings.ts`
    - Accept an approved mapping file (brand or colour)
    - Batch-update item records: set canonical value, preserve original in `sourceBrand`/`sourceColor`
    - Use conditional writes to avoid overwriting existing `sourceBrand`/`sourceColor`
    - Idempotent: re-running does not duplicate preservation fields
    - Log progress and errors
    - _Requirements: 1.4, 1.5, 1.6, 2.4, 2.5, 2.6_

  - [x] 2.5 Create canonical list seeding script
    - Create `projects/shop-api/scripts/data-cleanup/seed-canonical-lists.ts`
    - Write approved canonical brands to DynamoDB as `CANONICAL#BRANDS` / `BRAND#<name>` records
    - Write approved canonical colours to DynamoDB as `CANONICAL#COLORS` / `COLOR#<name>` records
    - Include aliases on each record
    - Idempotent (PutItem with overwrite)
    - _Requirements: 1.7, 2.7_

  - [x] 2.6 Write property test for brand fuzzy matching (Property 10)
    - Create `projects/shop-api/tests/pricing/brand-fuzzy-match.property.test.ts`
    - For any input and canonical brand: Levenshtein <= 2 → included in suggestions; > 2 → not included
    - **Validates: Requirement 11.3**

- [x] 3. Implement import data mapping
  - [x] 3.1 Create canonical mapper module
    - Create `projects/shop-api/src/import/canonical-mapper.ts`
    - Implement `loadCanonicalMappings(): Promise<{ brands: Map<string, string>, colors: Map<string, string> }>`
    - Query `CANONICAL#BRANDS` and `CANONICAL#COLORS` from DynamoDB, build lookup maps (name + all aliases → canonical name)
    - Implement `mapBrand(raw: string, mappings: Map<string, string>): { canonical: string, source: string | null }`
    - Implement `mapColor(raw: string, mappings: Map<string, string>): { canonical: string, source: string | null }`
    - Case-insensitive lookup; if match found, return canonical + preserve original as source; if not, return original unchanged
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 3.2 Integrate canonical mapper into item import pipeline
    - Update `projects/shop-api/src/stream/item-mapper.ts` (or the appropriate import mapper)
    - Load canonical mappings once at job start, cache in memory
    - Apply `mapBrand` and `mapColor` during item mapping
    - Store `sourceBrand` / `sourceColor` attributes on the item when mapping is applied
    - Ensure import does not fail if mapping lookup fails — store as-is
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 3.3 Write property test for import mapping (Property 9)
    - Create `projects/shop-api/tests/pricing/import-mapping.property.test.ts`
    - Canonical match → stored as canonical + sourceBrand; no match → stored as-is
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x] 3.4 Write unit tests for canonical mapper
    - Create `projects/shop-api/tests/import/canonical-mapper.test.ts`
    - Test: exact match, alias match, case-insensitive match, no match, empty input

- [x] 4. Checkpoint: Core functions, data cleanup, and import mapping
  - Ensure all property tests pass
  - Run data cleanup scripts against dev database (extract → cluster → review → apply)
  - Confirm canonical lists are seeded in DynamoDB
  - Verify import mapping works with a test item import
  - Ask user to review and approve brand/colour mappings before applying

- [x] 5. Implement pricing aggregator Lambda
  - [x] 5.1 Create aggregator statistics module
    - Create `projects/shop-api/src/aggregator/statistics.ts`
    - Implement `computeMedian(values: number[]): number`
    - Implement `computeSellThrough(soldCount: number, totalCount: number): number`
    - Implement `computeDiscountFrequency(discountedCount: number, totalSales: number): number`
    - _Requirements: 3.2_

  - [x] 5.2 Create aggregator grouping module
    - Create `projects/shop-api/src/aggregator/grouping.ts`
    - Implement `groupItemsByBrandCategory(items: AggregatorItem[]): Map<string, AggregatorItem[]>`
    - Group key: `<brand>#<categoryId>` (brand = `_NONE_` if empty)
    - Compute per-group: medianTagPrice, medianSalePrice, sellThrough, medianDaysOnShelf, discountFrequency, sampleSize
    - Compute per-group color adjustments: for each color, ratio of color-median to group-median
    - Compute per-group size adjustments: same as color
    - _Requirements: 3.2, 3.7_

  - [x] 5.3 Create employee accuracy module
    - Create `projects/shop-api/src/aggregator/employee-accuracy.ts`
    - Implement `computeEmployeeAccuracy(employeeItems: EmployeeSaleRecord[]): EmployeePricingResult`
    - Calculate median(salePrice / tagPrice) per employee
    - Apply time-decay: items from last 3 months weighted 3x vs items from 3-6 months ago
    - Compute creatorAdjustment: inverse of accuracy deviation (overprices by 15% → adjustment = 0.85)
    - _Requirements: 3.5_

  - [x] 5.4 Create adjustment detector module
    - Create `projects/shop-api/src/aggregator/adjustment-detector.ts`
    - Implement `detectAdjustment(previous: PricingRef | null, current: ComputedStats): AdjustmentEvent | null`
    - Create event if |change| > 2%
    - Apply caps via `capDecrease` / `capIncrease` from pricing/adjustment-caps
    - Enforce increase conditions via `shouldAllowIncrease`
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6, 7.7_

  - [x] 5.5 Write property test for adjustment detection (Property 8)
    - Create `projects/shop-api/tests/pricing/adjustment-detector.property.test.ts`
    - Event created iff |change| > 2%
    - **Validates: Requirement 7.1**

  - [x] 5.6 Create aggregator handler (Lambda entry point)
    - Create `projects/shop-api/src/aggregator/handler.ts`
    - Scan all consignment items with status data from shop table
    - Query sale line items from last 6 months (using createdAt on line items)
    - Include ALL sales (no clearance exclusion)
    - Group and compute statistics (using modules from 5.1-5.3)
    - Read existing pricing reference records (for change detection)
    - Write updated pricing reference records
    - Write employee pricing records
    - Detect and write adjustment events (using 5.4)
    - Log execution metrics to CloudWatch
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 7.1, 7.2, 7.3_

  - [x] 5.7 Write unit tests for aggregator modules
    - Create `projects/shop-api/tests/aggregator/statistics.test.ts` — median with odd/even/empty arrays
    - Create `projects/shop-api/tests/aggregator/grouping.test.ts` — correct grouping, missing brand handling
    - Create `projects/shop-api/tests/aggregator/employee-accuracy.test.ts` — accuracy ratio, time decay
    - Create `projects/shop-api/tests/aggregator/adjustment-detector.test.ts` — threshold, caps, conditions

- [x] 6. Checkpoint: Aggregator complete
  - Ensure all aggregator unit tests and property tests pass
  - Run aggregator locally against dev database to verify output
  - Inspect generated pricing reference records in DynamoDB
  - Ask user to review output quality

- [x] 7. Implement backend API routes
  - [x] 7.1 Create price suggestion route
    - Create `projects/shop-api/src/routes/suggest-price.ts`
    - Accept query params: brand, categoryId, color, size, createdBy
    - Look up `PRICING_REF#<brand>#<categoryId>` — if not found, try `PRICING_REF#_NONE_#<categoryId>`
    - Look up `EMPLOYEE_PRICING#<createdBy>` if provided
    - Call `calculateSuggestedPrice` with reference data + adjustments
    - Call `buildExplanation` to generate explanation
    - Call `classifyConfidence` for confidence level
    - Return `PriceSuggestionResponse`
    - Handle null/no-data case gracefully (200 with null price)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.2 Write property test for fallback chain (Property 7)
    - Create `projects/shop-api/tests/pricing/fallback-chain.property.test.ts`
    - Brand×category → category-only → null, never skips a level
    - **Validates: Requirements 5.4, 5.5, 5.6**

  - [x] 7.3 Create trigger aggregation route
    - Create `projects/shop-api/src/routes/trigger-aggregation.ts`
    - `POST /api/pricing/aggregate`
    - Invoke the aggregator Lambda asynchronously (InvocationType: Event)
    - Return 200 with `{ success: true, message: "Aggregation triggered" }` immediately
    - _Requirements: 3.11_

  - [x] 7.4 Create adjustment list route
    - Create `projects/shop-api/src/routes/list-adjustments.ts`
    - `GET /api/pricing/adjustments`
    - Query GSI1 (`ADJUSTMENTS` partition, sorted by timestamp descending)
    - Accept filters: direction, brand, category, fromDate, toDate
    - Cursor-based pagination (pageSize 20/50/100, default 20)
    - Return `AdjustmentListResponse`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.5 Create canonical lists route
    - Create `projects/shop-api/src/routes/canonical-lists.ts`
    - `GET /api/pricing/canonical/brands` — query `CANONICAL#BRANDS` PK, return sorted brand names
    - `GET /api/pricing/canonical/colors` — query `CANONICAL#COLORS` PK, return sorted colour names
    - Cache results in Lambda memory (canonical lists change rarely)
    - _Requirements: 1.7, 2.7, 11.1, 11.2_

  - [x] 7.6 Register pricing routes in router
    - Update `projects/shop-api/src/router.ts` to add all pricing routes:
      - `GET /api/pricing/suggest` → suggestPrice
      - `POST /api/pricing/aggregate` → triggerAggregation
      - `GET /api/pricing/adjustments` → listAdjustments
      - `GET /api/pricing/canonical/brands` → listCanonicalBrands
      - `GET /api/pricing/canonical/colors` → listCanonicalColors

  - [x] 7.7 Write unit tests for pricing API routes
    - Create `projects/shop-api/tests/routes/suggest-price.test.ts`
    - Create `projects/shop-api/tests/routes/trigger-aggregation.test.ts`
    - Create `projects/shop-api/tests/routes/list-adjustments.test.ts`
    - Create `projects/shop-api/tests/routes/canonical-lists.test.ts`
    - Cover: happy paths, error cases, authentication, pagination, validation

- [x] 8. Checkpoint: Backend API complete
  - Ensure all route tests pass
  - Test endpoints manually against dev environment
  - Verify suggestion returns correct data with seeded pricing references
  - Ask user if questions arise

- [x] 9. Implement infrastructure
  - [x] 9.1 Add pricing API routes to API Gateway Terraform
    - Update `infrastructure/api-gateway.tf` to add routes:
      - `GET /api/pricing/suggest`
      - `POST /api/pricing/aggregate`
      - `GET /api/pricing/adjustments`
      - `GET /api/pricing/canonical/brands`
      - `GET /api/pricing/canonical/colors`
    - All routes use Cognito authorizer
    - _Requirements: 8.6, 3.11_

  - [x] 9.2 Add Pricing Aggregator Lambda to Terraform
    - Update `infrastructure/lambda.tf` to define the pricing aggregator Lambda
    - Runtime: Node.js (same as shop-api)
    - Memory: 512 MB (needs to process potentially large scans)
    - Timeout: 300 seconds (5 minutes — aggregation may take time)
    - IAM permissions: DynamoDB read/write on shop table, CloudWatch Logs
    - Environment variables: TABLE_NAME, REGION
    - _Requirements: 3.1, 3.10_

  - [x] 9.3 Add EventBridge schedule for aggregator
    - Add EventBridge rule to trigger the aggregator Lambda weekly (every Sunday at 02:00 UTC)
    - Make schedule expression configurable via Terraform variable
    - Add DLQ for failed invocations
    - _Requirements: 3.1_

  - [x] 9.4 Add Lambda invoke permission for on-demand trigger
    - Grant the shop-api Lambda permission to invoke the aggregator Lambda asynchronously
    - _Requirements: 3.11_

- [x] 10. Implement frontend types and API client
  - [x] 10.1 Create pricing types module
    - Create `projects/shop/src/features/pricing/pricing-types.ts`
    - Define all TypeScript interfaces: PriceSuggestionResponse, AdjustmentEvent, AdjustmentListResponse, etc.
    - Define frontend result types (discriminated unions)
    - _Requirements: 8.3, 5.11_

  - [x] 10.2 Create pricing API client
    - Create `projects/shop/src/features/pricing/pricing-api.ts`
    - Implement: fetchPriceSuggestion, triggerAggregation, fetchAdjustments, fetchCanonicalBrands, fetchCanonicalColors
    - Follow patterns from existing API clients (auth headers, timeout, abort signal, discriminated union results)
    - _Requirements: 5.1, 3.11, 8.1, 11.1, 11.2_

- [x] 11. Implement frontend: Item Capture UI (POC)
  - [x] 11.1 Create shared Autocomplete component
    - Create `projects/shop/src/components/shared/autocomplete-input.tsx`
    - Generic typed component accepting: items list, filterFn, onSelect, value, onChange, placeholder, aria-label
    - Keyboard accessible: arrow keys navigate, Enter selects, Escape dismisses
    - Display dropdown below input when focused and items match
    - _Requirements: 11.7_

  - [x] 11.2 Create BrandAutocomplete component
    - Create `projects/shop/src/features/item-capture/brand-autocomplete.tsx`
    - Fetch canonical brands on mount, cache for session
    - Filter by input text (case-insensitive prefix match)
    - If input fuzzy-matches a canonical brand (Levenshtein <= 2) but doesn't exact-match, show "Did you mean [X]?" suggestion
    - Allow free-text entry (not restricted to list)
    - _Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 11.3 Create ColorAutocomplete component
    - Create `projects/shop/src/features/item-capture/color-autocomplete.tsx`
    - Fetch canonical colours on mount, cache for session
    - Filter by input text
    - Allow free-text entry
    - _Requirements: 11.2, 11.4, 11.6, 11.7_

  - [x] 11.4 Create PriceSuggestionPanel component
    - Create `projects/shop/src/features/item-capture/price-suggestion-panel.tsx`
    - Accept props: brand, categoryId, color, size, createdBy
    - Debounce input changes (300ms) before requesting suggestion
    - Display: suggested price (CHF formatted), confidence badge (high=green, medium=amber, low=grey), explanation text
    - Provide "Use Suggestion" button that calls onUseSuggestion(suggestedPrice)
    - Show loading skeleton while fetching
    - Show "No pricing data available" when suggestion is null
    - Non-blocking: never prevents any user action
    - _Requirements: 10.4, 10.5, 10.6, 10.7, 10.10_

  - [x] 11.5 Create Item Capture page
    - Create `projects/shop/src/features/item-capture/item-capture-page.tsx`
    - Standalone page optimised for rapid data entry with minimal focused layout
    - Fields: brand (BrandAutocomplete), category (dropdown), color (ColorAutocomplete), size (text), title (text), tag price (manual entry)
    - Integrate PriceSuggestionPanel — updates as brand/category/color/size change
    - "Use Suggestion" button populates tag price field
    - Display prominent "Preview Mode — items will not be created" indicator
    - Does NOT create items or call any create API
    - Accessible: ARIA labels, keyboard navigation, visible focus indicators
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11_

  - [x] 11.6 Write unit tests for Item Capture UI
    - Create `projects/shop/src/features/item-capture/item-capture-page.test.tsx`
    - Create `projects/shop/src/features/item-capture/price-suggestion-panel.test.tsx`
    - Create `projects/shop/src/features/item-capture/brand-autocomplete.test.tsx`
    - Create `projects/shop/src/features/item-capture/color-autocomplete.test.tsx`
    - Test: suggestion display, confidence badge, "Use Suggestion", loading/error/no-data states, debounce, autocomplete filtering/keyboard, "Preview Mode" indicator, no creation calls
    - _Requirements: 10.1-10.11, 11.1-11.7_

- [x] 12. Implement frontend: Adjustment Report
  - [x] 12.1 Create adjustment report page
    - Create `projects/shop/src/features/pricing/adjustment-report-page.tsx`
    - Compose: filters, summary banner, table with pagination
    - Accessible from navigation under "Pricing" section
    - _Requirements: 9.1, 9.6_

  - [x] 12.2 Create adjustment report filters
    - Create `projects/shop/src/features/pricing/adjustment-report-filters.tsx`
    - Filters: direction dropdown (all/increase/decrease), brand searchable dropdown, category dropdown, date range (from/to date pickers)
    - On filter change, reset pagination and refetch
    - _Requirements: 9.2_

  - [x] 12.3 Create adjustment report table
    - Create `projects/shop/src/features/pricing/adjustment-report-table.tsx`
    - Columns: Date, Brand, Category, Previous Price (CHF), New Price (CHF), Change (%), Direction (↑/↓ icon), Reason
    - Expandable rows showing supporting metrics (sell-through, days-on-shelf, sample size, discount frequency)
    - Use shared DataTable and PaginationControls
    - _Requirements: 9.1, 9.3, 9.4_

  - [x] 12.4 Create summary banner component
    - Create `projects/shop/src/features/pricing/adjustment-summary-banner.tsx`
    - Display: total adjustments in view, increases count, decreases count, average magnitude
    - _Requirements: 9.5_

  - [x] 12.5 Create useAdjustments pagination hook
    - Create `projects/shop/src/features/pricing/use-adjustments.ts`
    - Cursor-based pagination hook (analogous to usePaginatedItems)
    - Accept filter params, refetch on filter change
    - _Requirements: 9.3_

  - [x] 12.6 Write unit tests for adjustment report
    - Create `projects/shop/src/features/pricing/adjustment-report-page.test.tsx`
    - Test: table rendering, filter interaction, expandable rows, pagination, loading state, error state with retry, summary banner
    - _Requirements: 9.1, 9.7, 9.8_

- [x] 13. Navigation and routing
  - [x] 13.1 Add Pricing section to navigation
    - Update `projects/shop/src/components/layout/navigation-menu.tsx`
    - Add "Pricing" section with sub-items: "Item Capture", "Adjustment Report"
    - _Requirements: 9.6, 10.1_

  - [x] 13.2 Add pricing and item-capture routes to app router
    - Update app router to register:
      - `/item-capture` → ItemCapturePage
      - `/pricing/adjustments` → AdjustmentReportPage
    - _Requirements: 9.6, 10.1_

- [x] 14. Final checkpoint
  - Ensure all tests pass (property, unit)
  - Deploy aggregator Lambda to dev
  - Run aggregator (via on-demand trigger) to generate initial pricing references
  - Test full flow: open Item Capture UI → enter brand/category → see price suggestion
  - Verify adjustment report shows pricing changes
  - Verify brand/colour autocomplete works with canonical lists
  - Verify import mapping applies to new CC imports
  - Ask user to review overall behaviour

## Notes

- Data cleanup (tasks 2.x) requires human review between extraction and application — this is an interactive step
- The aggregator (tasks 5.x) should be tested locally before deploying infrastructure
- The Item Capture UI is a POC — it does NOT create items in any system. Future work will add CC API integration.
- All sales data (including clearance) is included in pricing calculations — no exclusion logic needed
- Frontend tasks (10-12) can be partially parallelised once API routes are available
- Property tests accompany their related implementation for immediate validation
- The aggregator Lambda is separate from the shop-api Lambda — different timeout and memory requirements
- Import mapping (task 3) ensures ongoing data cleanliness without repeated manual cleanup

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.5", "1.9", "1.11"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.6", "1.7", "1.10", "2.1", "2.3"] },
    { "id": 2, "tasks": ["1.8", "2.2", "2.4", "2.5", "2.6"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "3.4", "4"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 5, "tasks": ["5.4", "5.5", "5.6"] },
    { "id": 6, "tasks": ["5.7", "6"] },
    { "id": 7, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 8, "tasks": ["7.6", "7.7", "8", "9.1", "9.2", "9.3", "9.4"] },
    { "id": 9, "tasks": ["10.1", "10.2"] },
    { "id": 10, "tasks": ["11.1", "11.2", "11.3", "11.4"] },
    { "id": 11, "tasks": ["11.5", "11.6"] },
    { "id": 12, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5"] },
    { "id": 13, "tasks": ["12.6", "13.1", "13.2"] },
    { "id": 14, "tasks": ["14"] }
  ]
}
```
