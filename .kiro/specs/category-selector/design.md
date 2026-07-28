# Design Document

## Overview

The Category Selector feature adds a backend endpoint (`GET /api/categories`) that scans DynamoDB for category records, and a frontend `CategoryAutocomplete` component that provides a searchable dropdown. Unlike BrandAutocomplete/ColorAutocomplete which deal with plain strings, CategoryAutocomplete must handle `{id, name}` objects — displaying names to the operator while tracking UUIDs for the data model.

## Architecture

```
┌──────────────────────┐     GET /api/categories      ┌──────────────────────┐
│  CategoryAutocomplete │ ──────────────────────────►  │  API Gateway Route   │
│  (React component)    │                              │  + Cognito Auth      │
└──────────────────────┘                               └──────────┬───────────┘
         ▲                                                        │
         │ { categories: [{id, name}] }                           ▼
         │                                             ┌──────────────────────┐
         └──────────────────────────────────────────── │  listCategories      │
                                                       │  (route handler)     │
                                                       └──────────┬───────────┘
                                                                  │
                                                       ┌──────────▼───────────┐
                                                       │  Categories Cache    │
                                                       │  (5-min TTL)         │
                                                       └──────────┬───────────┘
                                                                  │ cache miss
                                                       ┌──────────▼───────────┐
                                                       │  DynamoDB Scan       │
                                                       │  PK begins_with      │
                                                       │  "CATEGORY#"         │
                                                       │  SK = "METADATA"     │
                                                       └──────────────────────┘
```

## Components

### Backend: `listCategories` Route Handler

**File:** `projects/shop-api/src/routes/list-categories.ts`

Follows the `canonical-lists.ts` pattern exactly — in-memory cache with 5-minute TTL, error logging, generic error response.

**Key difference from canonical-lists:** Category records have unique PKs (`CATEGORY#<uuid>`), so a Query on a single PK won't work. Instead, use a Scan with FilterExpression.

```typescript
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { jsonResponse, errorResponse } from "../response.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface Category {
  id: string;
  name: string;
}

interface CacheEntry {
  data: Category[];
  fetchedAt: number;
}

let categoriesCache: CacheEntry | null = null;

export function _resetCache(): void {
  categoriesCache = null;
}

function isFresh(entry: CacheEntry | null): entry is CacheEntry {
  if (entry === null) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

async function scanCategories(): Promise<Category[]> {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :sk",
        ExpressionAttributeValues: {
          ":prefix": "CATEGORY#",
          ":sk": "METADATA",
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as Record<string, unknown>[]));
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey !== undefined);

  return items
    .map((item) => ({
      id: (item.PK as string).replace("CATEGORY#", ""),
      name: item.name as string,
    }))
    .filter((cat) => typeof cat.name === "string")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCategories(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    if (isFresh(categoriesCache)) {
      return jsonResponse(200, { categories: categoriesCache.data });
    }

    const categories = await scanCategories();
    categoriesCache = { data: categories, fetchedAt: Date.now() };

    return jsonResponse(200, { categories });
  } catch (error: unknown) {
    console.error("listCategories error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
```

### Backend: Router Registration

**File:** `projects/shop-api/src/router.ts`

Add import and route entry:

```typescript
import { listCategories } from "./routes/list-categories.js";

// In routes record:
"GET /api/categories": listCategories,
```

### Infrastructure: API Gateway Route

**File:** `infrastructure/api-gateway.tf`

```hcl
resource "aws_apigatewayv2_route" "get_categories" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "GET /api/categories"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}
```

### Frontend: Categories API Function

**File:** `projects/shop/src/features/item-capture/categories-api.ts`

Follows the same pattern as `fetchCanonicalBrands` in `pricing-api.ts`.

```typescript
import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE = "/api";

export interface CategoryOption {
  id: string;
  name: string;
}

export interface CategoriesResult {
  success: true;
  categories: CategoryOption[];
} | {
  success: false;
  error: "server" | "network" | "timeout";
}

export async function fetchCategories(
  signal?: AbortSignal,
): Promise<CategoriesResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    const response = await fetch(`${API_BASE}/categories`, {
      headers,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: "server" };
    }

    const data: { categories: CategoryOption[] } = await response.json();
    return { success: true, categories: data.categories };
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

### Frontend: `CategoryAutocomplete` Component

**File:** `projects/shop/src/features/item-capture/category-autocomplete.tsx`

The key design challenge: `AutocompleteInput` works with `string[]` items, but categories are `{id, name}` objects. The component maintains an internal id→name mapping, passes only names to `AutocompleteInput`, and translates selections back to UUIDs.

```typescript
import * as React from "react";
import { AutocompleteInput } from "@/components/shared/autocomplete-input";
import { fetchCategories } from "./categories-api";
import type { CategoryOption } from "./categories-api";

export interface CategoryAutocompleteProps {
  value: string;
  onChange: (uuid: string) => void;
  disabled?: boolean;
  className?: string;
}

export function CategoryAutocomplete({
  value,
  onChange,
  disabled = false,
  className,
}: CategoryAutocompleteProps): React.ReactNode {
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);

  // Derived lookups
  const nameToId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.name, cat.id);
    }
    return map;
  }, [categories]);

  const idToName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  const names = React.useMemo(
    () => categories.map((c) => c.name),
    [categories],
  );

  // Display value: show name for the current UUID, or empty string
  const displayValue = value ? (idToName.get(value) ?? "") : "";

  React.useEffect(() => {
    const controller = new AbortController();

    fetchCategories(controller.signal).then((result) => {
      if (result.success) {
        setCategories(result.categories);
      }
    });

    return () => {
      controller.abort();
    };
  }, []);

  function handleChange(name: string): void {
    const id = nameToId.get(name);
    if (id) {
      onChange(id);
    } else {
      // User is typing / filtering — don't update parent until a valid selection
    }
  }

  function handleSelect(name: string): void {
    const id = nameToId.get(name);
    if (id) {
      onChange(id);
    }
  }

  return (
    <AutocompleteInput
      items={names}
      value={displayValue}
      onChange={handleChange}
      onSelect={handleSelect}
      placeholder="Select category"
      disabled={disabled}
      className={className}
      aria-label="Category"
    />
  );
}
```

### Frontend: Item Capture Page Integration

**File:** `projects/shop/src/features/item-capture/item-capture-page.tsx`

Replace the plain `<Input>` for Category with `<CategoryAutocomplete>`:

```typescript
// Replace:
<Input
  id="category-field"
  type="text"
  value={categoryId}
  onChange={(e) => setCategoryId(e.target.value)}
  placeholder="Category ID"
  aria-label="Category"
/>

// With:
<CategoryAutocomplete value={categoryId} onChange={setCategoryId} />
```

## Interfaces

### API Response Schema

```typescript
// GET /api/categories — 200 OK
interface CategoriesResponse {
  categories: Array<{
    id: string;   // UUID
    name: string; // Category display name
  }>;
}

// GET /api/categories — 500 Error
interface ErrorResponse {
  error: "internal_error";
}
```

### Component Props

```typescript
interface CategoryAutocompleteProps {
  /** Currently selected category UUID */
  value: string;
  /** Callback fired with the selected category UUID */
  onChange: (uuid: string) => void;
  /** Disables the input */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}
```

## Data Model

Category records already exist in DynamoDB per the data model:

| Field | PK Pattern | SK | Attributes |
|-------|-----------|-----|------------|
| Category | `CATEGORY#<uuid>` | `METADATA` | `name`, `sourceId`, `createdAt`, `updatedAt` |

The `listCategories` handler extracts the UUID from the PK (`CATEGORY#<uuid>` → `<uuid>`) and the `name` attribute, discarding other fields.

## Error Handling

| Layer | Error Condition | Behavior |
|-------|----------------|----------|
| Backend | DynamoDB Scan fails | Log error, return HTTP 500 `{ error: "internal_error" }` |
| Backend | Paginated Scan incomplete | Continue scanning until `LastEvaluatedKey` is undefined |
| Frontend | Fetch returns non-200 | Set categories to empty array, render autocomplete with no options |
| Frontend | Network error / timeout | Same as above — silent degradation |
| Frontend | Component unmounts during fetch | AbortController aborts the request |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Response shape integrity

*For any* set of DynamoDB category items (with PK matching `CATEGORY#<uuid>` and SK `METADATA`), the `scanCategories` function SHALL return an array where every element has exactly two string properties: `id` (a valid UUID extracted from PK) and `name`.

**Validates: Requirements 1.2**

### Property 2: Alphabetical sort order

*For any* array of categories returned by `listCategories`, for every adjacent pair `(categories[i], categories[i+1])`, `categories[i].name.localeCompare(categories[i+1].name) <= 0` SHALL hold.

**Validates: Requirements 1.3**

### Property 3: Bidirectional id↔name mapping consistency

*For any* category list fetched by CategoryAutocomplete, selecting a category by name in the dropdown SHALL fire `onChange` with the UUID corresponding to that name, AND setting the `value` prop to any valid UUID SHALL display the name corresponding to that UUID in the input field.

**Validates: Requirements 3.2, 3.3, 3.4**
