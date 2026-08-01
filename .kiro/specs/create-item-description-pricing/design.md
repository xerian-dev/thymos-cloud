# Design Document: Create Item Description & Pricing

## Architecture Overview

This feature adds a description autocomplete field to the item capture form and wires it into the pricing suggestion flow. The architecture spans two layers:

1. **Backend (shop-api)**: A new `GET /api/pricing/canonical/descriptions` endpoint that queries distinct description values from the pricing table's `PRICING_REF` records.
2. **Frontend (shop)**: A `DescriptionAutocomplete` component, updates to `PriceSuggestionPanel` trigger logic, and additions to the pricing API client.

The design follows the existing `BrandAutocomplete` → `fetchCanonicalBrands` → `listCanonicalBrands` pattern exactly.

---

## Component Design

### 1. Backend: Canonical Descriptions Endpoint

**File:** `projects/shop-api/src/routes/canonical-lists.ts` (extend existing file)

The endpoint follows the same pattern as `listCanonicalBrands` and `listCanonicalColors`:

```typescript
let descriptionsCache: CacheEntry | null = null;

export async function listCanonicalDescriptions(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    if (isFresh(descriptionsCache)) {
      return jsonResponse(200, { descriptions: descriptionsCache.data });
    }

    const descriptions = await queryCanonicalNames("CANONICAL#DESCRIPTIONS");
    descriptionsCache = { data: descriptions, fetchedAt: Date.now() };

    return jsonResponse(200, { descriptions });
  } catch (error: unknown) {
    console.error("listCanonicalDescriptions error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
```

**Route registration in `router.ts`:**

```typescript
import {
  listCanonicalBrands,
  listCanonicalColors,
  listCanonicalDescriptions,
} from "./routes/canonical-lists.js";

// In routes map:
"GET /api/pricing/canonical/descriptions": listCanonicalDescriptions,
```

**Data source:** The canonical descriptions are queried from the shop table using PK `CANONICAL#DESCRIPTIONS`. These records are populated by the description clustering/management pipeline (already exists at `description-management.ts`). Each record has a `name` attribute containing the canonical description string.

**Caching:** In-memory cache with 5-minute TTL, identical to brands and colors caching.

**Response shape:**
```json
{
  "descriptions": ["Jeans", "T-Shirt", "Dress", "Jacket", ...]
}
```

### 2. Frontend: Pricing API Client Updates

**File:** `projects/shop/src/features/pricing/pricing-api.ts`

#### 2a. Add `fetchCanonicalDescriptions`

Follows the exact same pattern as `fetchCanonicalBrands`:

```typescript
export async function fetchCanonicalDescriptions(
  signal?: AbortSignal,
): Promise<CanonicalListResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/pricing/canonical/descriptions`, {
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: "server" };
    }

    const data: { descriptions: string[] } = await response.json();
    return { success: true, values: data.descriptions };
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) {
        throw error;
      }
      return { success: false, error: "timeout" };
    }

    if (error instanceof TypeError) {
      return { success: false, error: "network" };
    }

    return { success: false, error: "server" };
  }
}
```

#### 2b. Add `description` parameter to `fetchPriceSuggestion`

```typescript
export async function fetchPriceSuggestion(
  params: {
    brand?: string;
    categoryId?: string;
    description?: string;  // NEW
    color?: string;
    size?: string;
    createdBy?: string;
  },
  signal?: AbortSignal,
): Promise<PriceSuggestionResult> {
  // ... existing logic ...
  
  // Add after categoryId param handling:
  if (params.description) {
    url.searchParams.set("description", params.description);
  }
  
  // ... rest unchanged ...
}
```

### 3. Frontend: DescriptionAutocomplete Component

**File:** `projects/shop/src/features/item-capture/description-autocomplete.tsx`

Follows the `BrandAutocomplete` pattern — loads canonical descriptions on mount, provides substring filtering via the `AutocompleteInput` shared component, and adds fuzzy matching with Levenshtein distance.

```typescript
import * as React from "react";
import { AutocompleteInput } from "@/components/shared/autocomplete-input";
import { fetchCanonicalDescriptions } from "../pricing/pricing-api";

export interface DescriptionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function DescriptionAutocomplete({
  value,
  onChange,
  disabled = false,
  className,
}: DescriptionAutocompleteProps): React.ReactNode {
  const [descriptions, setDescriptions] = React.useState<string[]>([]);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [fuzzySuggestion, setFuzzySuggestion] = React.useState<string | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    fetchCanonicalDescriptions(controller.signal).then((result) => {
      if (result.success) {
        setDescriptions(result.values);
      } else {
        setLoadFailed(true);
      }
    });

    return () => { controller.abort(); };
  }, []);

  // Fuzzy match logic (debounced)
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim() || descriptions.length === 0) {
      setFuzzySuggestion(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const match = findFuzzyMatch(value, descriptions);
      setFuzzySuggestion(match);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, descriptions]);

  function handleChange(newValue: string): void {
    onChange(newValue);
  }

  function handleUseSuggestion(): void {
    if (fuzzySuggestion) {
      onChange(fuzzySuggestion);
      setFuzzySuggestion(null);
    }
  }

  // Fallback to plain input on load failure
  if (loadFailed) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Description"
        aria-label="Description"
        disabled={disabled}
        className="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    );
  }

  return (
    <div className={className}>
      <AutocompleteInput
        items={descriptions}
        value={value}
        onChange={handleChange}
        filterFn={substringFilter}
        placeholder="Description"
        disabled={disabled}
        aria-label="Description"
      />
      {fuzzySuggestion && (
        <p className="mt-1 text-sm text-muted-foreground">
          Did you mean{" "}
          <button
            type="button"
            onClick={handleUseSuggestion}
            className="cursor-pointer font-medium text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {fuzzySuggestion}
          </button>
          ?
        </p>
      )}
    </div>
  );
}
```

**Key design decisions:**

- **Substring filter** (`filterFn`): The `AutocompleteInput` defaults to `startsWith` filtering. For descriptions, case-insensitive substring matching is more useful since operators may type middle words. A custom `filterFn` is passed:

```typescript
function substringFilter(item: string, query: string): boolean {
  return item.toLowerCase().includes(query.toLowerCase());
}
```

- **Fuzzy matching**: Reuses the same `levenshteinDistance` function from `brand-autocomplete.tsx`. This function should be extracted to a shared utility (e.g., `projects/shop/src/lib/levenshtein.ts`) and imported by both components.

- **Error fallback**: If `fetchCanonicalDescriptions` fails, the component renders a plain `<input>` element without autocomplete, allowing the operator to still type a free-text description.

### 4. Frontend: Item Capture Page Integration

**File:** `projects/shop/src/features/item-capture/item-capture-page.tsx`

Changes:
1. Add `description` state variable
2. Import and render `DescriptionAutocomplete` between category and color fields
3. Pass `description` prop to `PriceSuggestionPanel`

```typescript
// New state
const [description, setDescription] = React.useState("");

// New field (between Category and Color)
<div className="space-y-1.5">
  <Label htmlFor="description-field">Description</Label>
  <DescriptionAutocomplete value={description} onChange={setDescription} />
</div>

// Updated PriceSuggestionPanel
<PriceSuggestionPanel
  brand={brand}
  categoryId={categoryId}
  description={description}
  color={color}
  size={size}
  onUseSuggestion={handleUseSuggestion}
/>
```

### 5. Frontend: PriceSuggestionPanel Trigger Update

**File:** `projects/shop/src/features/item-capture/price-suggestion-panel.tsx`

Changes to the component:

1. **Add `description` to props interface:**

```typescript
export interface PriceSuggestionPanelProps {
  brand: string;
  categoryId: string;
  description: string;  // NEW
  color: string;
  size: string;
  createdBy?: string;
  onUseSuggestion: (price: number) => void;
}
```

2. **Update trigger condition** — fire when at least one of `description` or `categoryId` is provided:

```typescript
React.useEffect(() => {
  // Changed from: if (!categoryId)
  if (!categoryId && !description) {
    setState({ status: "idle" });
    return;
  }

  setState({ status: "loading" });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    fetchPriceSuggestion(
      {
        brand: brand || undefined,
        categoryId: categoryId || undefined,
        description: description || undefined,  // NEW
        color: color || undefined,
        size: size || undefined,
        createdBy,
      },
      controller.signal,
    )
      .then(/* ... existing logic ... */)
      .catch(/* ... existing logic ... */);
  }, 300);

  return () => {
    clearTimeout(timeoutId);
    controller.abort();
  };
}, [brand, categoryId, description, color, size, createdBy]);  // description added to deps
```

---

## Data Flow

```
┌─────────────────────────┐
│   Item Capture Page     │
│                         │
│  [Brand]                │
│  [Category]             │
│  [Description] ←────── new field
│  [Color]                │
│  [Size]                 │
│  [Title]                │
│  [Tag Price]            │
└────────────┬────────────┘
             │ description, categoryId, brand, color, size
             ▼
┌─────────────────────────┐
│  PriceSuggestionPanel   │
│                         │
│  Trigger: description   │
│     OR categoryId       │
└────────────┬────────────┘
             │ GET /api/pricing/suggest?description=X&categoryId=Y&...
             ▼
┌─────────────────────────┐
│  suggest-price handler  │
│  (fallback chain uses   │
│   description for       │
│   levels 1,2,5,6)       │
└─────────────────────────┘
```

```
┌─────────────────────────────┐
│  DescriptionAutocomplete    │
│  (on mount)                 │
└────────────┬────────────────┘
             │ GET /api/pricing/canonical/descriptions
             ▼
┌─────────────────────────────┐
│  canonical-lists handler    │
│  Query: PK = CANONICAL#     │
│         DESCRIPTIONS        │
│  Returns: sorted name list  │
└─────────────────────────────┘
```

---

## Shared Utility: Levenshtein Distance

**File:** `projects/shop/src/lib/levenshtein.ts`

The `levenshteinDistance` function is currently defined in `brand-autocomplete.tsx`. Both `BrandAutocomplete` and `DescriptionAutocomplete` need it. Extract to a shared module:

```typescript
/**
 * Compute the Levenshtein distance between two strings (case-insensitive).
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 0;
  if (aLower.length === 0) return bLower.length;
  if (bLower.length === 0) return aLower.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= aLower.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= aLower.length; i++) {
    for (let j = 1; j <= bLower.length; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[aLower.length][bLower.length];
}

/**
 * Find the closest fuzzy match from a list of canonical values.
 * Returns the canonical value if Levenshtein distance <= 2 and the input
 * doesn't already exactly match (case-insensitive).
 */
export function findFuzzyMatch(
  input: string,
  canonicalValues: string[],
): string | null {
  if (!input.trim()) return null;

  const inputLower = input.toLowerCase();

  const hasExactMatch = canonicalValues.some(
    (v) => v.toLowerCase() === inputLower,
  );
  if (hasExactMatch) return null;

  let bestMatch: string | null = null;
  let bestDistance = 3; // threshold: <= 2

  for (const value of canonicalValues) {
    const distance = levenshteinDistance(input, value);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = value;
    }
  }

  return bestMatch;
}
```

Both `BrandAutocomplete` and `DescriptionAutocomplete` import from this shared module.

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| `fetchCanonicalDescriptions` network failure | Component sets `loadFailed=true`, renders plain text input |
| `fetchCanonicalDescriptions` timeout (30s) | Same as network failure |
| `fetchPriceSuggestion` fails with description | Panel shows "Unable to load suggestion" (existing behavior) |
| Backend returns 400 (neither categoryId nor description) | Frontend prevents this — trigger guard ensures at least one is provided |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Substring filter returns only matching items

*For any* query string `q` and any list of canonical descriptions, every item returned by the substring filter function must contain `q` as a case-insensitive substring. Conversely, every item in the canonical list that contains `q` as a case-insensitive substring must appear in the filtered results.

**Validates: Requirements 1.2**

### Property 2: Fuzzy match correctness within Levenshtein distance

*For any* input string and canonical descriptions list, if `findFuzzyMatch` returns a suggestion, then: (a) the Levenshtein distance between the input and the suggestion is at most 2, (b) the input does not exactly match any canonical description (case-insensitive), and (c) no other canonical description has a smaller Levenshtein distance to the input.

**Validates: Requirements 1.4**

### Property 3: Price suggestion trigger fires when at least one identifier is present

*For any* combination of `description` and `categoryId` values where at least one is a non-empty string, the PriceSuggestionPanel trigger condition evaluates to true (initiating a fetch). When both are empty strings, the trigger condition evaluates to false (remaining idle).

**Validates: Requirements 4.1, 4.2**

### Property 4: Description parameter inclusion in URL

*For any* non-empty description string passed to `fetchPriceSuggestion`, the constructed request URL must include `description` as a query parameter with that exact value. For any empty or undefined description, the URL must not contain a `description` query parameter.

**Validates: Requirements 5.2, 5.3**
