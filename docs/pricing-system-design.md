# Pricing System Design

This document describes how the automated pricing system works: how pricing data is computed and stored, and how price suggestions are generated at item-creation time.

## Overview

The pricing system has two main components:

1. **Compute Prices** — a Lambda that runs on a weekly schedule, scans all items and sales data, applies canonical mappings to raw values, computes statistical pricing references grouped by brand × description, and writes the results to a dedicated pricing DynamoDB table.
2. **Suggest-Price API** — an endpoint that accepts item attributes (brand, description, color, size) and returns a suggested tag price by looking up the relevant pricing reference and applying multiplier adjustments.

### Data Immutability Principle

The shop table stores raw, immutable item data — exactly what was entered at capture or imported from ConsignCloud. The pricing system never mutates shop table records. Instead, canonical mappings (brand normalization, color normalization, description normalization) are applied at computation time within the pricing pipeline. This means:

- Item records reflect what was actually entered/imported (matches printed labels)
- Historical data is never retroactively altered
- Mappings are an input to pricing, not a side effect that modifies operational data
- Future corrections (user edits, tag reprinting) can be handled separately when needed

### Grouping Principle

The sole grouping dimension for pricing is **brand × description**. Category is not used for pricing grouping — it serves the operator's organizational needs but does not define comparable items for pricing purposes. Items sharing a description are genuinely comparable (e.g., "Jacke", "T-Shirt", "Handtasche"), while category is too broad to be meaningful.

- **Description is mandatory**: Items without a description are excluded from price computation entirely and cannot receive a price suggestion.
- **Brand may be `_NONE_`**: Items without a brand are grouped under the synthetic brand `_NONE_`. This handles unbranded goods (toys, generic items) that still have a meaningful description.
- Color, size, and pattern are refinement multipliers within a group — not grouping dimensions.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PRICING TABLE POPULATION                         │
│                                                                      │
│  EventBridge (weekly)         POST /api/pricing/compute             │
│        │                               │                             │
│        ▼                               ▼                             │
│  ┌────────────────────────────────────────────┐                      │
│  │          Compute Prices Lambda               │                     │
│  │          (2GB RAM, 15 min timeout)          │                     │
│  └──────────────┬─────────────────────────────┘                      │
│                 │                                                     │
│    ┌────────────┼────────────┬───────────────┐                       │
│    ▼            ▼            ▼               ▼                       │
│  Scan Items  Scan Sales   Read existing   Load Mappings              │
│  (Shop Table) (Line Items) PRICING_REFs   (S3 bucket)               │
│    │            │            │               │                       │
│    └────────────┼────────────┼───────────────┘                       │
│                 ▼            │                                        │
│    ┌───────────────────────┐ │                                       │
│    │  Apply Mappings →     │ │                                       │
│    │  Group by brand×desc  │◀┘                                       │
│    │  → Compute stats →    │                                         │
│    │  Detect Adjustments   │                                         │
│    │  → Write Records      │                                         │
│    └──────────┬────────────┘                                         │
│               ▼                                                       │
│     Pricing Table (thymos-{env}-pricing)                              │
│       • PRICING_REF records (brand × description)                    │
│       • ADJUSTMENT_EVENT records                                      │
└─────────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────┐
│                     PRICE SUGGESTION                          │
│                                                              │
│  GET /api/pricing/suggest-price?brand=...&description=...    │
│        │                                                     │
│        ▼                                                     │
│  ┌──────────────────────────────────────┐                    │
│  │     4-Level Fallback Chain            │                   │
│  │     (Tier 1: sold, Tier 2: unsold)    │                   │
│  └──────────────┬───────────────────────┘                    │
│                 ▼                                             │
│  referencePrice × velocity × color × size                    │
│                 │                                             │
│                 ▼                                             │
│  Round to nearest CHF 0.05 → suggestedPrice                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Canonical Mappings

Mapping files live in S3 and define how raw imported values map to canonical grouping values. They are consumed by the compute-prices Lambda at computation time — they do not modify item records in the shop table.

| Mapping Type | S3 Key | Purpose |
| -------------- | -------- | --------- |
| Brand | `brand-mappings/draft.json` | Normalize brand variants (e.g., "patagonia", "PATAGONIA", "Patagonia Inc." → "Patagonia") |
| Color | `color-mappings/draft.json` | Normalize color names and extract patterns (e.g., "blau gestreift" → color: "Blau", pattern: "Gestreift") |
| Description | `description-mappings/draft.json` | Normalize description keywords for grouping |

### Mapping Lifecycle

1. **Scan & Cluster** — A Lambda scans item values from the shop table, clusters similar raw values, and writes a proposed mapping draft to S3.
2. **Operator Review** — The frontend loads the draft for review/editing via API.
3. **Save** — Operator approves or modifies the mappings, saves back to S3.
4. **Consumed at Computation** — The compute-prices Lambda loads these mappings and applies them in-memory when building groups. Raw shop table data is unchanged.

### Why Mappings Don't Mutate the Shop Table

- The tag is printed at capture time with the raw value. Changing the stored value after the fact makes the database disagree with the physical label.
- Items may have already been sold under the original value. Altering historical records is confusing for auditing.
- The only current consumer of canonical groupings is the pricing pipeline. If a future use case (search, filtering) needs canonical values in the shop table, it can be designed for that use case when it arrives.
- Once the ticket capture app is operational, it will validate data at entry — making the mapping problem a legacy import concern only.

---

## Part 1: Table Population (Compute Prices)

### Trigger Mechanism

The compute-prices Lambda runs via two paths:

| Trigger | Mechanism | Frequency |
|---------|-----------|-----------|
| Scheduled | EventBridge rule `cron(0 2 ? * SUN *)` | Every Sunday at 02:00 UTC |
| Manual | `POST /api/pricing/compute` API route | On-demand (async invocation) |

Both invoke the same Lambda (`thymos-{env}-compute-prices`) with `InvocationType: "Event"` (fire-and-forget). The Lambda has 2048 MB memory and a 900-second (15 min) timeout.

A dead-letter queue (`thymos-{env}-compute-prices-dlq`) captures failed EventBridge invocations with 14-day retention.

### Data Sources

The compute-prices Lambda reads from three sources:

| Source | Data | Method |
| -------- | ------ | -------- |
| Shop Table | All items | Full scan: `PK begins_with "ITEM#" AND SK = "METADATA"` |
| Shop Table | Sale line items (6-month window) | Full scan: `PK begins_with "SALE#" AND SK begins_with "LINE_ITEM#" AND createdAt >= sixMonthsAgo` |
| Pricing Table | Existing pricing refs | GSI1 query: `GSI1PK = "PRICING_REFS"` |
| S3 Bucket | Mapping files | `brand-mappings/draft.json`, `color-mappings/draft.json`, `size-mappings/draft.json`, `description-mappings/draft.json` |

### Processing Pipeline

#### Step 1: Scan All Items

Retrieves every item record from the shop table. Each item provides: `brand`, `description`, `tagPrice`, `status`, `color`, `size`, `lastSold`, `daysOnShelf`.

#### Step 2: Scan Sale Line Items (6-Month Window)

Retrieves all sale line items created within the last 6 months. Builds a lookup map of `itemId → most recent line item` (keyed by `createdAt` to resolve duplicates). Each line item provides `salePrice` and `discount`.

#### Step 3: Load Canonical Mappings from S3

Loads the four mapping files from S3. Each file is an array of entries defining raw → canonical mappings. Builds in-memory lookup maps: `rawValue → canonicalValue` for brand, description, color, and size.

#### Step 4: Filter Items to Window

- **Sold items**: Only included if `lastSold >= sixMonthsAgo`
- **Non-sold items**: Always included (they contribute to total count for sell-through calculation)

#### Step 5: Build Items for Computation (Apply Mappings)

For each item, applies mappings in-memory and determines eligibility:

- `brand` → looked up in brand mapping; falls through to raw value if no mapping exists; if still empty/null, becomes `_NONE_`
- `description` → looked up in description mapping; **if empty/null after mapping, item is excluded entirely**
- `color` → looked up in color mapping (for color adjustment calculations)
- `pattern` → extracted from color mapping (for pattern adjustment calculations)
- `size` → looked up in size mapping (for size adjustment calculations)
- `salePrice` = line item's `salePrice / 100` (cents → CHF), only if item status is `"sold"`
- `discounted` = true if the line item has `discount > 0`

The shop table records are never modified. The canonical values exist only within the Lambda's working memory.

#### Step 6: Group by Brand × Description

Items are grouped by `canonicalBrand#canonicalDescription`. For each group, the following statistics are computed:

| Statistic | Computation |
| ----------- | ------------- |
| `medianTagPrice` | Median of ALL items' tag prices in the group |
| `medianSalePrice` | Median of SOLD items' sale prices |
| `sellThroughRate` | `soldCount / totalCount` |
| `medianDaysOnShelf` | Median of sold items' `daysOnShelf` values |
| `discountFrequency` | `discountedSoldCount / soldCount` |
| `sampleSize` | Count of sold items |
| `totalItems` | Count of all items |
| `unsoldCount` | `totalItems - sampleSize` |
| `colorAdjustments` | Per-color median sale price ÷ group median sale price |
| `patternAdjustments` | Per-pattern median sale price ÷ group median sale price |
| `sizeAdjustments` | Per-size median sale price ÷ group median sale price |

**Brand canonicalization**: Items with `null` or empty brand (after mapping) are grouped under the synthetic brand `_NONE_`.

**Description requirement**: Items with `null` or empty description (after mapping) are excluded from grouping entirely. They do not contribute to any statistics.

**Median computation**: Standard median — sort values, take middle value (or average of two middle values for even-length arrays). Returns 0 for empty arrays.

**Adjustment ratio computation**: For color, pattern, and size, the adjustment ratio is computed as `median sale price of items with that attribute value ÷ group median sale price`. Only sold items contribute to these ratios.

#### Step 7: Read Existing Pricing References

Queries all existing `PRICING_REF` records from the pricing table via GSI1. These are needed for:

- Comparing previous reference prices to detect adjustments
- Preserving `originalBaseline` for cumulative drift caps

#### Step 8: Compute Velocity Multiplier

For each group, a velocity multiplier (0.90–1.10) is computed based on sell-through dynamics:

| Sell-Through Rate | Multiplier | Logic |
| ------------------- | ------------ | ------- |
| 0.00–0.30 | 0.90–0.95 | Linear interpolation (lower sell-through → bigger discount) |
| 0.30–0.80 | 1.00 | Neutral band — no adjustment |
| > 0.80 | 1.05–1.10 | Premium, ONLY if ALL conditions met |

**Premium conditions** (all must be true):

- `priceRatio >= 1.0` (items selling at or above tag price)
- `medianDaysOnShelf < 14` (fast movement)
- `sampleSize >= 10` (sufficient data)

If any condition fails at sell-through > 0.80, the multiplier remains 1.0.

#### Step 9: Detect Adjustments

For each group, the adjustment detector compares the new `medianSalePrice` against the previous `referencePrice`:

```
                    │ change │ > 2%?
                         │
              ┌──────────┼──────────┐
              ▼                      ▼
         No (≤ 2%)               Yes (> 2%)
              │                      │
              ▼                      ▼
     Keep previous price     Determine direction
                                     │
                          ┌──────────┼──────────┐
                          ▼                      ▼
                      DECREASE                INCREASE
                          │                      │
                          ▼                      ▼
                    Apply caps            Check conditions
                          │                (sellThrough > 0.80
                          │                 priceRatio >= 1.0
                          │                 medianDays < 14
                          │                 sampleSize >= 10)
                          │                      │
                          │              ┌───────┼───────┐
                          │              ▼               ▼
                          │         Conditions      Conditions
                          │            MET           NOT MET
                          │              │               │
                          │              ▼               ▼
                          │         Cap at +10%    Keep previous
                          │              │          (no event)
                          ▼              ▼
                    Write ADJUSTMENT_EVENT
```

**Decrease caps**:

- Per-cycle cap: new price cannot fall below 85% of previous price
- Cumulative cap: new price cannot fall below 70% of `originalBaseline`
- Final price = `max(newPrice, previousPrice × 0.85, originalBaseline × 0.70)`

**Increase caps**:

- Per-cycle cap: new price cannot exceed 110% of previous price
- Final price = `min(newPrice, previousPrice × 1.10)`

**First-time groups** (no previous reference): No adjustment detected; `medianSalePrice` is used directly as the initial reference price and becomes the `originalBaseline`.

#### Step 10: Write PRICING_REF Records

Each group produces one `PRICING_REF` record with key `PK: PRICING_REF#<brand>#<description>`:

| Field | Value |
| ------- | ------- |
| `brand` | Canonical brand (or `_NONE_`) |
| `description` | Canonical description |
| `referencePrice` | Output of adjustment detection (capped median sale price) |
| `previousReferencePrice` | Previous cycle's reference price (null if new) |
| `originalBaseline` | First-ever reference price for drift cap |
| `medianTagPrice` | Median tag price of all items in group |
| `medianSalePrice` | Median sale price of sold items |
| `sellThroughRate` | Sold / total ratio |
| `medianDaysOnShelf` | Median days before sale |
| `discountFrequency` | Proportion sold at a discount |
| `sampleSize` | Count of sold items |
| `totalItems` | Count of all items |
| `unsoldCount` | Total - sold |
| `velocityMultiplier` | Computed velocity multiplier |
| `lowConfidence` | `true` if `sampleSize < 5` |
| `colorAdjustments` | Per-color price ratios |
| `patternAdjustments` | Per-pattern price ratios |
| `sizeAdjustments` | Per-size price ratios |
| `computedAt` | ISO 8601 timestamp |
| `updatedAt` | ISO 8601 timestamp |

All records get `GSI1PK: "PRICING_REFS"` and `GSI1SK: "PRICING_REF#<brand>#<description>"` for listing.

The `brand` and `description` values stored on pricing refs are the canonical (mapped) values, not the raw shop table values.

#### Step 11: Write ADJUSTMENT_EVENT Records

When an adjustment is detected (price change > 2%):

| Field | Value |
| ------- | ------- |
| `PK` | `ADJUSTMENT#<uuid>` |
| `GSI1PK` / `GSI1SK` | `ADJUSTMENTS` / `ADJUSTMENT#<timestamp>` |
| `brand` | Canonical brand for the affected group |
| `description` | Canonical description for the affected group |
| `previousPrice` | Old reference price |
| `newPrice` | Capped new reference price |
| `direction` | `"increase"` or `"decrease"` |
| `percentageChange` | Percentage change after caps |
| `reason` | Human-readable explanation (e.g., "Price decreased due to low sell-through rate (25%), items selling well below tag price (ratio 0.72)") |
| `metrics` | Snapshot: `sellThroughRate`, `medianDaysOnShelf`, `sampleSize`, `discountFrequency`, `priceRatio` |

---

## Part 2: Price Suggestions (Suggest-Price API)

### Endpoint

```
GET /api/pricing/suggest-price
```

### Request Parameters

All parameters are query string values:

| Parameter | Required | Description |
| ----------- | ---------- | ------------- |
| `description` | Yes | Item description (canonical value) |
| `brand` | No | Item brand; if omitted, looks up `_NONE_` brand group |
| `color` | No | Item color (for color adjustment) |
| `pattern` | No | Item pattern (for pattern adjustment) |
| `size` | No | Item size (for size adjustment) |

If `description` is missing, the endpoint returns a 400 validation error.

### 4-Level Fallback Chain

The route resolves the most relevant pricing reference by trying keys in priority order:

| Level | Tier | Key Pattern | Qualification |
| ------- | ------ | ------------- | --------------- |
| 1 | Tier 1 (sold) | `PRICING_REF#<brand>#<description>` | `sampleSize > 0` |
| 2 | Tier 1 (sold) | `PRICING_REF#_NONE_#<description>` | `sampleSize > 0` |
| 3 | Tier 2 (unsold) | `PRICING_REF#<brand>#<description>` | `unsoldCount > 0` |
| 4 | Tier 2 (unsold) | `PRICING_REF#_NONE_#<description>` | `unsoldCount > 0` |

**Logic**:

- Level 1 tries the brand-specific group first (strongest signal: same brand, same description, sold items)
- Level 2 falls back to the description group across all brands (when the specific brand has insufficient data)
- Levels 3–4 repeat the same pattern for unsold items (weak signal, used when nothing in the group has sold)
- If brand is not provided, only levels 2 and 4 are attempted (using `_NONE_`)
- If no level matches, the response returns `suggestedPrice: null`

Note: The `brand` and `description` values passed to this endpoint should be the canonical values (as the pricing refs are keyed by canonical values). The ticket capture app will enforce validated input, so values will already be canonical at the point of entry.

### Reference Price Determination

| Source | Reference Price |
|--------|-----------------|
| Tier 1 (sold) | `pricingRef.referencePrice` (the adjusted/capped median sale price from compute-prices) |
| Tier 2 (unsold) | `pricingRef.medianTagPrice × 0.90` (10% discount applied to median tag price of unsold items) |

### Adjustment Multipliers

Four multipliers are composed on the reference price:

#### 1. Velocity Multiplier (pre-computed, stored on the pricing ref)

Range: 0.90–1.10. Reflects how quickly items in this group sell relative to the norm.

#### 2. Color Adjustment

From `pricingRef.colorAdjustments[color]`. Represents how items of this color sell relative to the group median. For example, if black jackets in "Patagonia × Jacke" sell at 1.12× the group median, the color adjustment is 1.12.

#### 3. Pattern Adjustment

From `pricingRef.patternAdjustments[pattern]`. Represents how items with this pattern sell relative to the group median. For example, if striped items sell at 0.95× the group median, the pattern adjustment is 0.95.

#### 4. Size Adjustment

From `pricingRef.sizeAdjustments[size]`. Same concept as color — represents how items of this size sell relative to the group median.

If any multiplier is unavailable, it defaults to 1.0 (no effect).

### Price Calculation Formula

```
rawPrice = referencePrice × velocityMultiplier × colorAdjustment × patternAdjustment × sizeAdjustment
suggestedPrice = roundToSwiss5(rawPrice)
```

**Swiss rounding**: `Math.round(price * 20) / 20` — rounds to the nearest CHF 0.05 (Switzerland has no 1- or 2-centime coins).

### Confidence Classification

| Source | Confidence |
| -------- | ------------ |
| Tier 2 (unsold) | Always `"low"` |
| Tier 1, sampleSize >= 10 | `"high"` |
| Tier 1, sampleSize 5–9 | `"medium"` |
| Tier 1, sampleSize < 5 | `"low"` |

### Response Format

```json
{
  "suggestedPrice": 24.95,
  "confidence": "high",
  "source": "sold",
  "explanation": "Based on 42 sold items in Patagonia × Jacke. Reduced 5% due to poor sell-through in this group.",
  "warning": null,
  "adjustments": {
    "referencePrice": 26.30,
    "velocityMultiplier": 0.95,
    "colorAdjustment": 1.0,
    "patternAdjustment": 1.0,
    "sizeAdjustment": 1.0
  },
  "groupInfo": {
    "brand": "Patagonia",
    "description": "Jacke",
    "sampleSize": 42,
    "sellThroughRate": 0.65,
    "medianDaysOnShelf": 18,
    "fallbackLevel": 1
  }
}
```

**When no data exists** (all levels fail):

```json
{
  "suggestedPrice": null,
  "confidence": null,
  "source": null,
  "explanation": "No pricing data available for this description",
  "warning": null,
  "adjustments": null,
  "groupInfo": null
}
```

**Tier 2 warning** (when suggestion is based on unsold items):

```
"warning": "Price based on unsold items. Similar items in this group haven't sold yet — consider pricing below CHF 28.00 (median tag price of unsold items)."
```

### Explanation Text

The explanation builder generates human-readable text describing what data the suggestion is based on and which adjustments were applied:

| Fallback Level | Opening Template |
| ---------------- | ------------------ |
| 1 | "Based on N sold items in Brand × Description" |
| 2 | "Based on N sold items matching description 'X' (insufficient brand-specific data)" |
| 3 | "Based on N unsold items in Brand × Description. No items in this group have sold yet" |
| 4 | "Based on N unsold items matching description 'X'. No items in this group have sold yet" |

Additional sentences are appended for non-1.0 adjustments:

- Velocity: "Reduced 5% due to poor sell-through in this group" / "Increased 8% due to strong sell-through"
- Color: "Color adjustment applied"
- Pattern: "Pattern adjustment applied"
- Size: "Size adjustment applied"

---

## Key Design Decisions

1. **Shop table is immutable**: Item records are never modified after creation. Raw values are preserved exactly as entered or imported. Canonical mappings are applied only within the pricing pipeline at computation time.

2. **Mappings are a pricing input, not a data mutation**: The mapping files (brand, color, description) exist to help the compute-prices Lambda group messy historical import data into coherent pricing cohorts. They don't alter the source of truth. Once the ticket capture app validates data at entry, mappings become unnecessary for new items.

3. **Brand × description is the sole grouping key**: Category is not used for pricing. Description identifies what an item actually is (comparable goods), while category is an organizational convenience. Descriptions are maintained to be unique and not duplicated across categories.

4. **Description is mandatory for pricing**: Items without a description are noise — they cannot be meaningfully grouped or compared. They are excluded from computation and receive no price suggestion.

5. **Color, pattern, and size are refinements, not grouping dimensions**: Using them as grouping dimensions would fragment data into groups too small for statistical significance. Instead, they're computed as adjustment ratios within a brand×description group.

6. **Separate pricing table**: Isolates batch-write bursts from operational shop traffic. The compute-prices Lambda does a full table scan + hundreds of writes — this should not contend with item CRUD.

7. **6-month rolling window**: Balances having enough data for statistical significance with reflecting current market conditions. Sales older than 6 months are excluded.

8. **Conservative adjustment caps**: Prevents pricing volatility from wild swings in small sample sizes. Maximum 15% decrease or 10% increase per weekly cycle, with a hard floor at 70% of the original baseline.

9. **Asymmetric increase/decrease policy**: Decreases are always applied (with caps). Increases require strong evidence (high sell-through, items selling above tag price, fast movement, sufficient data). This protects against pricing items out of the market.

10. **Two-tier fallback (sold → unsold)**: Tier 1 (sold items) provides strong signal. Tier 2 (unsold items at a 10% discount) provides a conservative starting point when no sales data exists. Tier 2 always gets "low" confidence to signal uncertainty.

11. **Swiss rounding**: All final prices are rounded to CHF 0.05 to match physical currency constraints.
