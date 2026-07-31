# Requirements: Description-Based Pricing

## Overview

Refactor the pricing engine to use `brand × description` as the primary grouping dimension instead of `brand × categoryId`. Descriptions are short German item-type keywords (e.g., "Hose", "Sandalen", "Schlafsack") that provide more specific pricing groups than broad categories.

## Functional Requirements

### FR-1: Primary Grouping by Brand × Description

- The aggregator MUST group items by `brand × description` (normalized, canonical values)
- Each group produces a PRICING_REF record with PK: `PRICING_REF#<brand>#DESC#<description>`
- The `_NONE_` sentinel is used for items without a brand
- Groups with fewer than 2 sold items are still stored but flagged `lowConfidence: true`

### FR-2: Fallback Chain for Price Suggestions

When suggesting a price, the system MUST follow this fallback chain (stop at first match with data):

**Tier 1 — Sold Items (strong signal):**
1. `brand × description` — median sale price of sold items in this exact group
2. `_NONE_ × description` — description-only (all brands combined)
3. `brand × categoryId` — category-level (existing behavior, backward compat)
4. `_NONE_ × categoryId` — category-only

**Tier 2 — Unsold Items (weak signal):**
5. `brand × description` — median tag price of unsold items, discounted by 10%
6. `_NONE_ × description` — description-only unsold items, discounted by 10%

If no match at any tier, return `suggestedPrice: null`.

### FR-3: Tier 2 Unsold Fallback Behavior

- When Tier 2 is used, the response MUST include:
  - `source: "unsold"` (vs `source: "sold"` for Tier 1)
  - `confidence: "low"`
  - A `warning` field explaining that the price is based on unsold items
  - The suggested price is the median tag price of unsold items × 0.90 (10% discount)
- The explanation MUST inform the user that similar items haven't sold and suggest pricing below the unsold median

### FR-4: Color Adjustment

- Color remains a multiplier within each group (not a grouping dimension)
- The `colorAdjustments` map on each PRICING_REF contains per-color price ratios
- Applied after reference price lookup, same as today

### FR-5: Response Shape

```typescript
interface PriceSuggestionResponse {
  suggestedPrice: number | null;
  confidence: "high" | "medium" | "low" | null;
  source: "sold" | "unsold" | null;
  explanation: string;
  warning: string | null;
  adjustments: {
    referencePrice: number;
    velocityMultiplier: number;
    creatorAdjustment: number;
    colorAdjustment: number;
    sizeAdjustment: number;
  } | null;
  groupInfo: {
    brand: string | null;
    description: string | null;
    category: string | null;
    sampleSize: number;
    sellThroughRate: number;
    medianDaysOnShelf: number;
    fallbackLevel: number; // 1-6, which tier/level was used
  } | null;
}
```

### FR-6: Aggregator Changes

- The aggregator MUST produce PRICING_REF records keyed by brand × description
- Existing brand × category records are retained for backward compatibility (fallback levels 3-4)
- Each PRICING_REF record stores:
  - `medianSalePrice` — from sold items (null if none sold)
  - `medianTagPrice` — from all items (sold and unsold)
  - `sampleSize` — count of sold items
  - `totalItems` — count of all items (for sell-through)
  - `unsoldCount` — count of unsold items (for Tier 2)
  - `colorAdjustments` — per-color price ratios (from sold items)
  - `sizeAdjustments` — per-size price ratios (from sold items)

### FR-7: PK Pattern for Description-Based Refs

- Description-based: `PRICING_REF#<brand>#DESC#<description>`
- Category-based (existing): `PRICING_REF#<brand>#<categoryId>`
- The `DESC#` infix distinguishes description refs from category refs in the same table

## Non-Functional Requirements

### NFR-1: Performance

- The suggest-price route MUST respond within 500ms (series of GetItem calls, not scans)
- The fallback chain does at most 6 point reads (worst case: all miss until Tier 2)

### NFR-2: Backward Compatibility

- Items without cleaned descriptions still get suggestions via category fallback (levels 3-4)
- The existing category-based PRICING_REF records are not removed
- The API response is backward compatible (new fields `source`, `warning`, `fallbackLevel` are additive)

### NFR-3: Data Quality

- Only items with non-empty, normalized `description` values contribute to description-based groups
- Items with `description` but no `brand` use `_NONE_` as the brand component

## Out of Scope

- Removing category-based pricing refs (kept for fallback)
- Changing the aggregator scheduling
- UI changes to the price suggestion panel (it already displays explanation text)
