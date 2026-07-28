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

The suggested tag price is a weighted composite of comparable signals:

```
suggestedPrice = (
  brandMedian      × 0.35 +
  categoryMedian   × 0.30 +
  creatorAdjustment × 0.20 +
  colorAdjustment  × 0.08 +
  sizeAdjustment   × 0.07
) × velocityMultiplier
```

### Velocity Multiplier

Derived from sales performance of the brand×category group:

- Sell-through rate < 30%: multiply by 0.90–0.95 (marginal reduction)
- Sell-through rate 30–70%: no adjustment (multiplier = 1.0)
- Sell-through rate > 80% AND median(salePrice) >= median(tagPrice): multiply by 1.05–1.10 (slight increase, only with strong evidence)

### Minimum Sample Size

- A brand×category group needs at least **5 sold items** to generate a confident suggestion
- Groups with fewer samples fall back to category-only pricing (brand weight redistributed to category)
- If category also has < 5 items, fall back to the global median for consignment items with a low-confidence flag

## Business Rules

### Reductions

- Maximum automatic reduction from historical reference: **15%** per recalculation cycle
- Cumulative maximum reduction: **30%** from original baseline (prevents race to bottom)
- Reduction reason must be one of: poor sell-through, high discount frequency, high days-on-shelf relative to category peers

### Increases

- Only triggered when ALL of the following are true:
  - Sell-through > 80% for the brand×category
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
- The recalculation produces a pricing reference table with per-group statistics
- Changes from the previous week's reference are logged as adjustments (the basis for the report)
- On-demand trigger is useful after data cleanup or import to immediately see updated suggestions

## Reporting

- A report must show all brand×category groups where pricing has been adjusted
- Report columns: brand, category, previous reference price, new reference price, direction (↑/↓), magnitude, reason, supporting metrics (sell-through %, avg days-on-shelf, sample size)
- The report is historical — operators can view past adjustments to understand trends
- Adjustments should be reviewable before they take effect (operator approval for increases)
