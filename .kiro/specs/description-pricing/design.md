# Design: Description-Based Pricing

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Aggregator Lambda (scheduled)                                    │
│                                                                  │
│  1. Scan items + sale line items from Shop Table                 │
│  2. Group by brand × description (new)                          │
│  3. Group by brand × categoryId (existing, retained)            │
│  4. Compute stats for each group                                │
│  5. Write PRICING_REF records to Pricing Table                  │
│     - PRICING_REF#<brand>#DESC#<desc> (new)                     │
│     - PRICING_REF#<brand>#<categoryId> (existing)               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ suggest-price Route (GET /api/pricing/suggest)                   │
│                                                                  │
│  Input: brand, description, categoryId, color, size, createdBy  │
│                                                                  │
│  Fallback chain:                                                 │
│  ┌─── Tier 1 (sold) ───────────────────────────────────────┐    │
│  │ 1. GetItem PRICING_REF#<brand>#DESC#<desc>              │    │
│  │ 2. GetItem PRICING_REF#_NONE_#DESC#<desc>               │    │
│  │ 3. GetItem PRICING_REF#<brand>#<categoryId>             │    │
│  │ 4. GetItem PRICING_REF#_NONE_#<categoryId>              │    │
│  └──────────────────────────────────────────────────────────┘    │
│  ┌─── Tier 2 (unsold) ─────────────────────────────────────┐    │
│  │ 5. GetItem PRICING_REF#<brand>#DESC#<desc> → tagPrice   │    │
│  │ 6. GetItem PRICING_REF#_NONE_#DESC#<desc> → tagPrice    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Apply multipliers: velocity × creator × color × size           │
│  Swiss rounding (CHF 0.05)                                       │
│  Return response with source + confidence + warning             │
└─────────────────────────────────────────────────────────────────┘
```

### DynamoDB Key Design

#### New Description-Based Records

| Field | Value |
|-------|-------|
| PK | `PRICING_REF#<brand>#DESC#<description>` |
| SK | `METADATA` |
| GSI1PK | `PRICING_REFS` |
| GSI1SK | `PRICING_REF#<brand>#DESC#<description>` |

The `DESC#` infix prevents key collisions with category-based refs (category IDs are UUIDs, never "DESC#...").

#### Existing Category-Based Records (unchanged)

| Field | Value |
|-------|-------|
| PK | `PRICING_REF#<brand>#<categoryId>` |
| SK | `METADATA` |

### PRICING_REF Record Schema (updated)

```typescript
interface PricingRefRecord {
  // Keys
  PK: string;
  SK: "METADATA";
  GSI1PK: "PRICING_REFS";
  GSI1SK: string;

  // Grouping
  brand: string;              // canonical brand or "_NONE_"
  description?: string;       // present for description-based refs
  categoryId?: string;        // present for category-based refs
  categoryName?: string;      // display name

  // Pricing (from sold items)
  referencePrice: number;     // medianSalePrice (the suggestion basis)
  medianSalePrice: number;    // explicit median of sale prices
  medianTagPrice: number;     // median of tag prices (all items)

  // Stats
  sampleSize: number;         // count of SOLD items
  totalItems: number;         // count of ALL items in group
  unsoldCount: number;        // totalItems - sampleSize
  sellThroughRate: number;    // sampleSize / totalItems
  medianDaysOnShelf: number;
  discountFrequency: number;

  // Adjustments
  velocityMultiplier: number;
  colorAdjustments: Record<string, number>;
  sizeAdjustments: Record<string, number>;

  // Metadata
  lowConfidence: boolean;     // sampleSize < 5
  previousReferencePrice: number | null;
  originalBaseline: number;
  computedAt: string;
  updatedAt: string;
}
```

### Fallback Logic (suggest-price route)

```typescript
async function resolvePriceRef(
  brand: string | null,
  description: string | null,
  categoryId: string | null,
): Promise<{ ref: PricingRefRecord | null; level: number; source: "sold" | "unsold" }> {

  // Tier 1: sold items
  if (description) {
    if (brand) {
      const ref = await getRef(`PRICING_REF#${brand}#DESC#${description}`);
      if (ref && ref.sampleSize > 0) return { ref, level: 1, source: "sold" };
    }
    const ref = await getRef(`PRICING_REF#_NONE_#DESC#${description}`);
    if (ref && ref.sampleSize > 0) return { ref, level: 2, source: "sold" };
  }

  if (categoryId) {
    if (brand) {
      const ref = await getRef(`PRICING_REF#${brand}#${categoryId}`);
      if (ref && ref.sampleSize > 0) return { ref, level: 3, source: "sold" };
    }
    const ref = await getRef(`PRICING_REF#_NONE_#${categoryId}`);
    if (ref && ref.sampleSize > 0) return { ref, level: 4, source: "sold" };
  }

  // Tier 2: unsold items (use medianTagPrice × 0.90)
  if (description) {
    if (brand) {
      const ref = await getRef(`PRICING_REF#${brand}#DESC#${description}`);
      if (ref && ref.unsoldCount > 0) return { ref, level: 5, source: "unsold" };
    }
    const ref = await getRef(`PRICING_REF#_NONE_#DESC#${description}`);
    if (ref && ref.unsoldCount > 0) return { ref, level: 6, source: "unsold" };
  }

  return { ref: null, level: 0, source: "sold" };
}
```

### Tier 2 Price Calculation

```typescript
const UNSOLD_DISCOUNT_FACTOR = 0.90; // 10% below unsold median

if (source === "unsold") {
  referencePrice = ref.medianTagPrice * UNSOLD_DISCOUNT_FACTOR;
  // Then apply velocity, creator, color, size multipliers as normal
}
```

### Aggregator Changes

The aggregator handler is extended to:

1. **Build description-based groups** in addition to category-based groups
2. **Store `unsoldCount` and `totalItems`** on all PRICING_REF records
3. **Use normalized description values** (the canonical forms from the description cleanup)

The existing category-based grouping remains unchanged — both run in parallel and produce their respective PRICING_REF records.

## Migration

- No data migration needed — new records are additive
- First aggregator run after deployment populates description-based refs
- Items without descriptions still fall through to category-based refs
- The `suggest-price` route gracefully handles missing description refs (fallback chain)

## Testing Strategy

- Unit tests for fallback chain logic (mock GetItem calls)
- Unit tests for Tier 2 discount calculation
- Integration test: aggregator produces description-based refs
- Property test: suggested price is always ≥ 0 and properly rounded
