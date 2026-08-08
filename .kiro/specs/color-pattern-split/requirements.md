# Requirements: Color/Pattern Split

## Overview

The `color` field on items currently contains a mix of actual colors ("Blau", "Rot") and patterns ("Gestreift", "Punkte", "Kariert"). These should be separated into distinct fields: `color` for the actual color and `pattern` for the visual pattern/print. This improves data quality for pricing (color and pattern have different effects on price) and for search/filtering.

## Context

Current state of the `color` field includes:
- Pure colors: "Blau", "Rot", "Schwarz", "Dunkelblau"
- Pure patterns: "Gestreift", "Punkte", "Kariert"
- Color + pattern compounds: "Blau Gestreift", "Rot/Punkte", "Schwarz Kariert"
- Image/print descriptions: "Blumen", "Tiere", "Sterne", "Herzen", "Motiv"

## Functional Requirements

### FR-1: Pattern Field on Items

- Items MUST support an optional `pattern` field (string, nullable)
- The pattern field stores the canonical German pattern name
- Items can have both a color and a pattern, or either alone, or neither

### FR-2: Canonical Pattern Values

The following are the recognized canonical patterns (German):

| Canonical | Description | Known Variants |
|-----------|-------------|----------------|
| `Gestreift` | Striped | gestreift, stripes, striped, streifen, geringelt |
| `Punkte` | Dots/Polka | punkte, dots, gepunktet, polka, tupfen |
| `Kariert` | Checked/Plaid | kariert, checked, karo, karos, plaid |
| `Bedruckt` | Printed/Image | bedruckt, print, motiv, muster, druck |
| `Blumen` | Floral | blumen, floral, blümchen, geblümt |
| `Tiere` | Animal print | tiere, animal, tier, leopard, zebra, tiger |
| `Sterne` | Stars | sterne, stars, stern |
| `Herzen` | Hearts | herzen, hearts, herz |
| `Camouflage` | Camo | camouflage, camo, tarn, armee |
| `Uni` | Solid/Plain (no pattern) | uni, einfarbig, solid, plain |

### FR-3: Splitting Logic

When processing a color value:

1. **Pure pattern** (value is only a pattern, e.g., "Gestreift"):
   - Set `color` to null/remove
   - Set `pattern` to the canonical pattern name

2. **Color + pattern compound** (e.g., "Blau Gestreift", "Rot/Punkte"):
   - Extract the color portion → set `color` to canonical color
   - Extract the pattern portion → set `pattern` to canonical pattern

3. **Pure color** (e.g., "Blau", "Dunkelrot"):
   - Keep `color` as-is
   - Leave `pattern` null

4. **Image/print descriptions** (e.g., "Blumen", "Tiere", "Sterne"):
   - Set `color` to null/remove
   - Set `pattern` to the canonical pattern name

### FR-4: Color Management UI Update

- The color scan/cluster Lambda MUST exclude pattern-only values from color mappings
- Pattern values detected during color clustering should be flagged for pattern assignment instead
- The color draft.json should only contain actual color mappings

### FR-5: Pattern Management UI

- A pattern management page (same pattern as brand/color/description) for reviewing and applying pattern mappings
- Scan & cluster extracts values that are patterns (or contain patterns)
- Human review confirms correct pattern assignment
- Apply writes the `pattern` field on items

### FR-6: Data Preservation

- The original raw value MUST be preserved in `sourceColor` (already done by color apply)
- A new `sourcePattern` field preserves the original value that led to the pattern assignment
- Splitting is idempotent — re-running on already-split items doesn't change them

### FR-7: Pricing Integration (Future)

- The pricing calculator MAY use `pattern` as an adjustment multiplier (similar to color)
- This is out of scope for this spec but the data model should support it
- The PRICING_REF record schema can add `patternAdjustments: Record<string, number>` later

## Non-Functional Requirements

### NFR-1: Ordering

This spec MUST be implemented before the description-based pricing spec, because:
- Clean color data (without patterns mixed in) improves color adjustment accuracy
- Pattern data may be used as a pricing signal in the future

### NFR-2: Backward Compatibility

- Items without a `pattern` field continue to work normally
- The color field on items remains optional
- Existing color adjustments in pricing refs may be less accurate until the aggregator re-runs after the split

### NFR-3: Item Capture

- The item capture form should show a pattern selector (autocomplete from canonical list)
- This is a follow-up task, not blocking the data cleanup

## Out of Scope

- Adding pattern as a pricing adjustment multiplier (future)
- Updating the item capture form with a pattern selector (follow-up)
- Modifying the import pipeline (ConsignCloud doesn't have pattern)
