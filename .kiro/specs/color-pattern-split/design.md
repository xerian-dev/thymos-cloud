# Design: Color/Pattern Split

## Data Model

### Item Record (updated)

```
PK: ITEM#<uuid>
SK: METADATA

color: "Blau"           ← actual color only (cleaned)
pattern: "Gestreift"    ← new field (nullable)
sourceColor: "blau gestreift"  ← original raw value (existing)
sourcePattern: "blau gestreift" ← what triggered pattern extraction (new)
```

### Pattern Detection Map

```typescript
const PATTERN_MAP: Record<string, string> = {
  // Direct pattern names
  gestreift: "Gestreift",
  stripes: "Gestreift",
  striped: "Gestreift",
  streifen: "Gestreift",
  geringelt: "Gestreift",

  punkte: "Punkte",
  dots: "Punkte",
  gepunktet: "Punkte",
  polka: "Punkte",
  tupfen: "Punkte",

  kariert: "Kariert",
  checked: "Kariert",
  karo: "Kariert",
  karos: "Kariert",
  plaid: "Kariert",

  bedruckt: "Bedruckt",
  print: "Bedruckt",
  motiv: "Bedruckt",
  muster: "Bedruckt",
  druck: "Bedruckt",

  blumen: "Blumen",
  floral: "Blumen",
  blümchen: "Blumen",
  geblümt: "Blumen",

  tiere: "Tiere",
  animal: "Tiere",
  tier: "Tiere",
  leopard: "Tiere",
  zebra: "Tiere",
  tiger: "Tiere",

  sterne: "Sterne",
  stars: "Sterne",
  stern: "Sterne",

  herzen: "Herzen",
  hearts: "Herzen",
  herz: "Herzen",

  camouflage: "Camouflage",
  camo: "Camouflage",
  tarn: "Camouflage",
  armee: "Camouflage",

  uni: "Uni",
  einfarbig: "Uni",
  solid: "Uni",
  plain: "Uni",
};
```

## Splitting Algorithm

```typescript
interface SplitResult {
  color: string | null;
  pattern: string | null;
}

function splitColorPattern(rawValue: string): SplitResult {
  const normalized = rawValue.trim().toLowerCase();

  // Step 1: Check if entire value is a pattern
  if (PATTERN_MAP[normalized]) {
    return { color: null, pattern: PATTERN_MAP[normalized] };
  }

  // Step 2: Check for compound (color + pattern)
  // Try splitting on space, /, -
  for (const sep of [" ", "/", "-"]) {
    if (normalized.includes(sep)) {
      const parts = normalized.split(sep).map(p => p.trim()).filter(p => p.length > 0);

      for (let i = 0; i < parts.length; i++) {
        if (PATTERN_MAP[parts[i]]) {
          const patternPart = PATTERN_MAP[parts[i]];
          const colorParts = parts.filter((_, idx) => idx !== i);
          const colorValue = colorParts.join(sep === " " ? "/" : sep);
          const resolvedColor = lookupCanonicalColor(colorValue);
          return {
            color: resolvedColor ?? (colorValue || null),
            pattern: patternPart,
          };
        }
      }
    }
  }

  // Step 3: Check if value contains a pattern word as substring
  for (const [key, canonical] of Object.entries(PATTERN_MAP)) {
    if (normalized.includes(key) && normalized !== key) {
      const remaining = normalized.replace(key, "").trim();
      if (remaining.length > 0) {
        const resolvedColor = lookupCanonicalColor(remaining);
        return {
          color: resolvedColor ?? remaining,
          pattern: canonical,
        };
      }
    }
  }

  // Step 4: Pure color (no pattern detected)
  return { color: rawValue, pattern: null };
}
```

## Implementation Architecture

### S3 Storage

```
s3://thymos-dev-items/pattern-mappings/
  draft.json      ← extracted patterns for review
  applied.json    ← last applied snapshot
  apply-status.json ← async status
```

### Mapping Format

```json
[
  { "raw": "gestreift", "color": null, "pattern": "Gestreift" },
  { "raw": "Blau Gestreift", "color": "Blau", "pattern": "Gestreift" },
  { "raw": "Rot/Punkte", "color": "Rot", "pattern": "Punkte" },
  { "raw": "Blumen", "color": null, "pattern": "Blumen" }
]
```

### Lambda Architecture

| Lambda | Purpose |
|--------|---------|
| `pattern-cluster` | Scans items, identifies patterns in color values, produces draft |
| `pattern-apply` | Applies approved splits: sets `color` and `pattern` on items |

### Apply Logic

For each mapping entry:
```typescript
await docClient.send(new UpdateCommand({
  TableName: TABLE_NAME,
  Key: { PK: item.PK, SK: item.SK },
  UpdateExpression: mapping.color
    ? "SET color = :color, pattern = :pattern, sourcePattern = if_not_exists(sourcePattern, :raw)"
    : "SET pattern = :pattern, sourcePattern = if_not_exists(sourcePattern, :raw) REMOVE color",
  ExpressionAttributeValues: {
    ":color": mapping.color,     // only if non-null
    ":pattern": mapping.pattern,
    ":raw": mapping.raw,
  },
}));
```

## Interaction with Color Management

After this spec is implemented:
- The color scan/cluster Lambda should be updated to exclude known pattern values
- Pure patterns won't appear in `color-mappings/draft.json`
- The color field will only contain actual colors

## UI Design

Pattern management page follows the same layout as brand/color/description:
- Scan & Cluster button → identifies patterns in color values
- Table shows: Raw Value | Color (extracted) | Pattern (extracted)
- User can edit both color and pattern columns
- Apply writes both fields

The table has 3 columns instead of 2:
```
| Raw Value         | Color  | Pattern    | × |
|-------------------|--------|------------|---|
| blau gestreift    | Blau   | Gestreift  | × |
| Punkte            |        | Punkte     | × |
| Rot/Kariert       | Rot    | Kariert    | × |
| Blumen            |        | Blumen     | × |
```
