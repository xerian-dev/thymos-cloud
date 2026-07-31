---
inclusion: manual
---

# Auto Tag Price Strategy

## Scope

- Auto pricing applies ONLY to **Consignment** items (`inventoryType: "Consignment"`)
- Retail items are priced by the seller — the system must never suggest or override retail pricing
- The system suggests a tag price at item creation time; the operator can always override

## Philosophy

- **Conservative by default** — prefer slightly underpricing over overpricing. Items that sell generate revenue; items that sit generate nothing.
- **Reduce readily, increase rarely** — if the model detects poor sales for an item type, reduce the suggested price marginally (5-10%). Only increase if there is very strong evidence of systematic underpricing (high sell-through AND sale prices consistently at or above tag price).
- **Transparency** — every price suggestion must come with an explanation. The operator should understand WHY the model suggests a particular price.
- **Inform on adjustment** — when the model adjusts reference pricing (up or down) from the historical norm, the user must be notified. A report must be available showing all adjustments with explanations.

## Pricing Model

### Reference Price Calculation

The suggested tag price is derived from the reference price of the best-matching group, with multipliers applied:

```
suggestedPrice = referencePrice × velocityMultiplier × creatorAdjustment × colorAdjustment × sizeAdjustment
```

The **primary grouping dimension** is `brand × description` — where descriptions are short canonical German item-type keywords (e.g., "Hose", "Sandalen", "Schlafsack"). Category is used as a fallback when no description-based data is available.

The suggest-price route follows a **6-level fallback chain** to find the reference price (first match with sold data wins):

1. `brand × description` — most specific, highest confidence
2. `description-only` — all brands combined for that item type
3. `brand × category` — category-level (backward compat)
4. `category-only` — broadest Tier 1 level
5. `brand × description (unsold)` — median tag price × 0.90
6. `description-only (unsold)` — median tag price × 0.90

If no match at any level, no suggestion is returned.

### Velocity Multiplier

Derived from sales performance of the matched group (applies to both description-based and category-based groups):

- Sell-through rate < 30%: multiply by 0.90–0.95 (marginal reduction)
- Sell-through rate 30–70%: no adjustment (multiplier = 1.0)
- Sell-through rate > 80% AND median(salePrice) >= median(tagPrice): multiply by 1.05–1.10 (slight increase, only with strong evidence)

### Minimum Sample Size

- A group (description-based or category-based) needs at least **5 sold items** to generate a confident suggestion
- Groups with fewer sold samples are still stored (flagged `lowConfidence: true`) and can participate in the fallback chain, but the response will indicate lower confidence
- The fallback chain traverses: brand×desc → desc-only → brand×cat → cat-only → unsold brand×desc → unsold desc-only
- If no level has data, return no suggestion

## Description-Based Grouping

- Items are grouped by `brand × description` as the **primary dimension** for pricing references
- Descriptions are canonical German item-type keywords (e.g., "Hose", "Sandalen", "Schlafsack", "Winterjacke")
- Items without a non-empty description fall through to category-based grouping (fallback levels 3-4)
- Items without a brand use the `_NONE_` sentinel as the brand component
- Description-based PRICING_REF records use the PK pattern: `PRICING_REF#<brand>#DESC#<description>`
- Category-based records are retained for backward compatibility: `PRICING_REF#<brand>#<categoryId>`

## Tier 2: Unsold Items Fallback

- When no sold-items data exists at any Tier 1 level (levels 1-4), the system falls back to unsold items (levels 5-6)
- The suggested price is `medianTagPrice × 0.90` (10% below the median tag price of unsold items in the group)
- Always returns `confidence: "low"` and includes a `warning` explaining the basis
- This is a **last-resort signal** — items in the group haven't sold, so pricing conservatively below their listing price is appropriate
- Only description-based groups are checked in Tier 2 (unsold category fallback is not used — too broad to be useful)

## Business Rules

### Reductions

- Maximum automatic reduction from historical reference: **15%** per recalculation cycle
- Cumulative maximum reduction: **30%** from original baseline (prevents race to bottom)
- Reduction reason must be one of: poor sell-through, high discount frequency, high days-on-shelf relative to category peers

### Increases

- Only triggered when ALL of the following are true:
  - Sell-through > 80% for the matched group (description-based or category-based)
  - Median sale price >= tag price (items selling at full price or above)
  - Median days-on-shelf < 14 days (items move fast)
- Maximum automatic increase: **10%** per cycle
- Increases require a higher confidence threshold (minimum 10 sold items in the group)

### Exclusions

- Items with `inventoryType: "Retail"` — never priced by the system
- Items where `terms` field is irrelevant to pricing decisions
- `expirationDate` is not used as an indicator (data quality insufficient)

## Creator (Employee) Signal

- Employee pricing accuracy is a strong indicator: some employees price well, others don't
- The model tracks per-employee: average deviation of their tag prices from actual sale prices
- This signal is used as a calibration adjustment, NOT an override
- This indicator is expected to diminish over time as AI-suggested prices replace manual pricing
- The creator signal should be recalculated periodically and have a decay factor applied to older data

## Discount Handling

- Most discounts occur during end-of-season clearance sales where ALL items are discounted
- All sales data (including clearance) is included in pricing calculations — no data is excluded
- Clearance sales represent real market behaviour and inform what customers will pay
- The velocity multiplier already accounts for poor-performing groups — excluding clearance would double-count the penalty
- Non-clearance discounts (individual markdowns during normal trading) are valid pricing signals and contribute to the model alongside clearance data

## Recalculation Frequency

- Reference prices are recalculated **weekly** (scheduled) AND can be triggered **on demand** via API endpoint
- Each recalculation produces **both** description-based and category-based PRICING_REF records
- Changes from the previous week's reference are logged as adjustments (the basis for the report)
- On-demand trigger is useful after data cleanup or import to immediately see updated suggestions

## Reporting

- A report must show all groups (description-based and category-based) where pricing has been adjusted
- Report columns: brand, description/category, previous reference price, new reference price, direction (↑/↓), magnitude, reason, supporting metrics (sell-through %, avg days-on-shelf, sample size)
- The report is historical — operators can view past adjustments to understand trends
- Adjustments should be reviewable before they take effect (operator approval for increases)
