---
inclusion: manual
---

# Data Cleanup: Brand & Color Normalisation

## Why This Matters

Brand and color are key pricing indicators. Dirty data fragments the pricing model — misspellings, casing differences, and multilingual entries create tiny groups with insufficient sample sizes, reducing pricing confidence and accuracy.

## Brand Normalisation

### Problem

Brand names arrive from ConsignCloud as free-text strings entered by employees. Common issues:

- Misspellings: "Gucchi", "Zaraa", "Lululemmon"
- Casing inconsistency: "GUCCI", "gucci", "Gucci"
- Abbreviations: "R.Lauren" vs "Ralph Lauren"
- Punctuation variants: "Levi's" vs "Levis"
- Trailing/leading whitespace

### Approach

1. **Extract** — Query all distinct `brand` values from items in the shop table
2. **Cluster** — Group similar brand names using fuzzy matching (Levenshtein distance, phonetic similarity)
3. **Map** — Produce a mapping table: `{ raw: string, canonical: string }`
4. **Review** — Human approval of all mappings before application (never auto-merge without review)
5. **Apply** — Batch update items in DynamoDB to use canonical brand names
6. **Preserve** — Store the original raw value in a `sourceBrand` field for traceability

### Canonical Form Rules

- Use title case: "Ralph Lauren", "Tommy Hilfiger"
- Use the brand's official stylisation where known: "lululemon" (lowercase), "H&M" (with ampersand)
- When uncertain, prefer the most common spelling in the dataset
- Maintain a canonical brand list as a reference table (DynamoDB or config file)

### Ongoing Enforcement

- At item entry time, suggest from the canonical list (autocomplete)
- If a new brand is entered that fuzzy-matches an existing canonical brand, prompt: "Did you mean X?"
- New brands that don't match anything are added to a review queue for periodic human approval

## Color Normalisation

### Problem

Colors are entered in mixed German/English and with misspellings:

- Language mixing: "rot" / "red", "blau" / "blue", "schwarz" / "black"
- Misspellings: "gruen" vs "grün", "weiss" vs "weiß"
- Compound colors: "dunkelblau" / "dark blue" / "navy"
- Vague entries: "multi", "bunt", "various"

### Approach

1. **Choose canonical language** — English (consistent with international brand naming and broader team accessibility)
2. **Build mapping table** — Map German equivalents and common misspellings to canonical English colour names
3. **Handle compound colours** — Define a canonical set of compound colours (e.g., "Dark Blue", "Light Grey")
4. **Review** — Human approval before batch application
5. **Apply** — Batch update items
6. **Preserve** — Store original in `sourceColor` field

### Canonical Colour List (starter)

| Canonical (EN) | Common variants mapped |
|----------------|----------------------|
| Black | schwarz, schwrz, shwarz |
| White | weiss, weiß |
| Red | rot, roth |
| Blue | blau |
| Green | grün, gruen |
| Yellow | gelb |
| Pink | rosa |
| Orange | orange |
| Brown | braun |
| Grey | grau, gray |
| Beige | beige, creme, cream |
| Navy | dunkelblau, dark blue |
| Light Blue | hellblau |
| Multicolor | multi, mehrfarbig, bunt, various |

This list will grow as the actual data is analysed.

### Ongoing Enforcement

- At item entry, provide a colour picker/dropdown from the canonical list
- Allow free-text only with a "custom" flag that queues for review
- Periodic scan for new colour values that haven't been mapped

## Implementation Priority

1. **Brand cleanup first** — higher pricing weight, bigger impact
2. **Color cleanup second** — lower weight but still fragments groups
3. **Import mapping** — integrate canonical mappings into the CC import pipeline so future imports arrive clean
4. **Ongoing validation** — implement autocomplete/suggestion in the Item Capture UI to prevent future drift

## Technical Considerations

- Batch updates must use DynamoDB conditional writes to avoid overwriting concurrent changes
- The cleanup script should be idempotent (safe to re-run)
- Track cleanup provenance: who approved the mapping, when it was applied
- The cleanup can run as a one-off Lambda or local script — it doesn't need to be a permanent service
- Category names should also be audited but are likely clean since they come from a structured entity (not free-text)
- **Import mapping**: canonical lists must be loaded once at import job start and cached in memory for performance. Mapping is applied during the item import pipeline so newly imported items arrive with canonical brand/colour values. If no mapping exists, the value is stored as-is (import never fails due to missing mapping).
