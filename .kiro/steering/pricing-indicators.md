---
inclusion: manual
---

# Pricing Indicators Reference

## Overview

This document defines all signals used by the auto tag price model, their data sources, relative weights, and how they are calculated. Only **Consignment** items are priced by this system.

## Indicator Categories

### Tier 1: Primary Indicators (65% of price signal)

These are the dominant factors in determining a suggested tag price.

#### Brand (weight: 0.35)

- **Source**: `brand` field on Item entity
- **DynamoDB access**: Scan/query items, group by brand
- **Metric**: Median tag price of sold items per brand (excluding clearance sales)
- **Fallback**: If brand is empty or has < 5 sold items, redistribute weight to category
- **Depends on**: Brand normalisation (data cleanup) for accurate grouping
- **Notes**: Brand is the single strongest price predictor in consignment retail. A "Gucci" item has a fundamentally different price band than a "H&M" item regardless of category.

#### Category (weight: 0.30)

- **Source**: `categoryId` FK on Item → Category entity
- **DynamoDB access**: GSI3 (`CATEGORY#<categoryId>`) to query items by category
- **Metric**: Median tag price of sold items per category (excluding clearance sales)
- **Fallback**: If category is missing, use global consignment median with low-confidence flag
- **Notes**: Category defines the product type (dresses, shoes, accessories). Combined with brand, it creates the core comparable group (brand×category).

### Tier 2: Strong Secondary Indicators (20% of price signal)

#### Creator / Employee (weight: 0.20)

- **Source**: `createdBy` FK on Item → Employee entity
- **DynamoDB access**: Query items by creator, cross-reference with sale line items for those items
- **Metric**: Employee pricing accuracy — average ratio of `salePrice / tagPrice` for items created by this employee
- **Interpretation**:
  - Ratio ~1.0: Employee prices accurately (items sell at tag)
  - Ratio < 0.8: Employee tends to overprice (items require discounts to sell)
  - Ratio > 1.0: Employee tends to underprice (items sell at or above tag quickly)
- **Application**: Applied as a calibration multiplier. If an employee historically overprices by 15%, the model adjusts their suggested price down by that factor.
- **Decay**: This signal diminishes over time as AI-generated prices replace manual pricing. Apply a time-decay weighting — recent data (last 3 months) weighted more heavily than older data.
- **Fallback**: If employee has < 10 priced-and-sold items, do not apply creator adjustment (use weight 0, redistribute to brand/category)

### Tier 3: Moderate Indicators (15% of price signal)

#### Color (weight: 0.08)

- **Source**: `color` field on Item entity
- **DynamoDB access**: Group sold items by color within brand×category
- **Metric**: Price deviation from brand×category median for each colour
- **Interpretation**: Some colours command premiums (black, navy in fashion tends to hold value) while others sell at discount
- **Depends on**: Colour normalisation (data cleanup) for accurate grouping
- **Fallback**: If colour is empty or has < 5 data points in the group, apply no colour adjustment (multiplier = 1.0)
- **Notes**: Colour is a weak but consistent signal. It should never dominate but can nudge a price ±5%.

#### Size (weight: 0.07)

- **Source**: `size` field on Item entity
- **DynamoDB access**: Group sold items by size within brand×category
- **Metric**: Price deviation from brand×category median for each size, combined with sell-through rate per size
- **Interpretation**: Standard/common sizes (M, 38, 40) typically have broader demand and sell faster. Extreme sizes may need slight reduction to move.
- **Fallback**: If size is empty or has < 5 data points, apply no size adjustment (multiplier = 1.0)
- **Notes**: Size impact varies heavily by category. Shoes: size matters a lot. Scarves: size is irrelevant. Category-specific size logic may be needed in future iterations.

## Derived Metrics (used in velocity multiplier, not direct price signals)

These metrics don't directly set the price but determine whether to adjust it up or down from the reference.

### Sell-Through Rate

- **Calculation**: `count(sold items) / count(all items)` per brand×category over a rolling 6-month window
- **Source data**: Item `status` field + sale line items
- **Used for**: Velocity multiplier in the pricing formula
- **Thresholds**: < 30% = poor (reduce), 30-70% = normal (hold), > 80% = strong (potential increase)

### Sale Price vs Tag Price Ratio

- **Calculation**: `median(salePrice) / median(tagPrice)` per brand×category
- **Source data**: Sale line item `salePrice` cross-referenced with item `tagPrice`
- **Used for**: Detecting systematic over/under-pricing. Ratio < 0.85 = consistent overpricing. Ratio > 1.0 = underpricing.
- **Important**: Exclude clearance sale data (see Discount Handling below)

### Days on Shelf (sold items)

- **Calculation**: Median `daysOnShelf` for sold items per brand×category
- **Source data**: `daysOnShelf` on sale line items (captured at time of sale)
- **Used for**: Supporting evidence for velocity assessment. High days-on-shelf + low sell-through = strong signal to reduce.
- **Benchmark**: Compare group median against overall store median to identify underperformers

### Discount Frequency

- **Calculation**: `count(line items with discount > 0) / count(all line items)` per brand×category
- **Source data**: Sale line item `discount` field
- **Used for**: If items in a group frequently require discounts to sell, the suggested price should be lower from the start
- **Critical caveat**: Most discounts occur in end-of-season clearance sales. These must be excluded (see below).

## Discount / Clearance Sale Handling

### The Problem

End-of-season clearance sales discount ALL remaining items. This is a business decision, not a pricing signal. Including clearance data would incorrectly drive all prices down.

### Identification Heuristic

A sale event is likely a clearance if:
- More than 60% of line items in a single day have discounts applied
- OR a manual "clearance period" flag/date-range is set by the operator

### Treatment

- **Clearance sales**: EXCLUDED from all pricing calculations (sell-through, sale price ratio, discount frequency, days-on-shelf)
- **Non-clearance discounts**: INCLUDED — these represent genuine pricing feedback during normal trading
- **Until automated detection is reliable**: Provide a manual mechanism to mark date ranges as clearance periods

## Indicators NOT Used

| Field | Reason for exclusion |
|-------|---------------------|
| `terms` | Business/contractual decision, not a pricing signal |
| `expirationDate` | Data quality insufficient — not well maintained in the shop |
| `taxExempt` | Affects final customer cost but not the tag price itself |
| `quantity` | Multi-quantity items are rare in consignment; insufficient data to model |
| `lastViewed` | Interesting but not currently captured with enough granularity to be useful |
| `tags` | Too unstructured — may be useful in future with NLP but not for initial model |

## Data Source Summary

| Indicator | DynamoDB Entity | Key Fields | Access Pattern |
|-----------|----------------|------------|----------------|
| Brand | Item | `brand` | Scan with filter or dedicated analytics export |
| Category | Item + Category | `categoryId`, `category` | GSI3 query |
| Creator | Item + Employee | `createdBy` | Query items by creator, join with sales |
| Color | Item | `color` | Group within brand×category results |
| Size | Item | `size` | Group within brand×category results |
| Sale price | Sale Line Item | `salePrice` | Query sale line items, resolve to items |
| Days on shelf | Sale Line Item | `daysOnShelf` | Available on line items at sale time |
| Discount | Sale Line Item | `discount` | Filter line items with discount > 0 |
| Status | Item | `status` | Determine sold vs active vs other |

## Confidence Levels

The model should output a confidence level with each suggestion:

| Level | Criteria | User display |
|-------|----------|--------------|
| **High** | Brand×category has >= 20 sold items, creator has >= 10 items | Show suggested price prominently |
| **Medium** | Brand×category has 5-19 sold items | Show suggestion with "limited data" note |
| **Low** | Falling back to category-only or global median | Show suggestion with "insufficient data — manual review recommended" |
