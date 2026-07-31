y# Tasks: Description-Based Pricing

## Phase 1: Aggregator Updates

- [x] 1. Add description-based grouping to the aggregator handler
  - Group items by `brand × description` (in addition to existing brand × category)
  - Produce PRICING_REF records with PK `PRICING_REF#<brand>#DESC#<description>`
  - Store `unsoldCount`, `totalItems`, `medianTagPrice` on all records
  - Only items with non-empty normalized descriptions contribute to description groups

- [x] 2. Update PRICING_REF record schema
  - Add `description` field (optional, present on description-based refs)
  - Add `unsoldCount` field
  - Add `totalItems` field
  - Ensure `medianTagPrice` is computed from ALL items (not just sold)

## Phase 2: Suggest-Price Route Updates

- [x] 3. Implement fallback chain in suggest-price route
  - Accept `description` as a new query parameter
  - Implement 6-level fallback: brand×desc → desc → brand×cat → cat → unsold brand×desc → unsold desc
  - Return `fallbackLevel` in response

- [x] 4. Implement Tier 2 unsold fallback
  - When all Tier 1 levels miss, check Tier 2 (unsoldCount > 0)
  - Apply 10% discount to medianTagPrice
  - Set `source: "unsold"`, `confidence: "low"`
  - Add `warning` field to response

- [x] 5. Update response shape
  - Add `source` field ("sold" | "unsold" | null)
  - Add `warning` field (string | null)
  - Add `fallbackLevel` to groupInfo
  - Add `description` to groupInfo

## Phase 3: Explanation & Confidence

- [x] 6. Update explanation builder for description-based lookups
  - Include description in explanation text
  - Different explanation templates for each fallback level
  - Specific warning text for Tier 2 unsold fallback

- [x] 7. Update confidence classification
  - Tier 1 with sampleSize ≥ 10: "high"
  - Tier 1 with sampleSize 5-9: "medium"
  - Tier 1 with sampleSize < 5: "low"
  - Tier 2 (unsold): always "low"

## Phase 4: Testing

- [x] 8. Unit tests for fallback chain
  - Test each of the 6 levels independently
  - Test that higher-priority levels take precedence
  - Test null response when all levels miss

- [x] 9. Unit tests for Tier 2 behavior
  - Test 10% discount is applied to medianTagPrice
  - Test warning and source fields are set correctly
  - Test that Tier 2 is only reached when all Tier 1 levels miss

- [x] 10. Run aggregator and verify description-based refs are created
  - Verify PK pattern `PRICING_REF#<brand>#DESC#<description>`
  - Verify unsoldCount and totalItems are populated
  - Verify category-based refs still exist (backward compat)

## Phase 5: Documentation

- [x] 11. Update data-model.md with new PRICING_REF key pattern
- [x] 12. Update auto-pricing-strategy.md steering with description-based approach
