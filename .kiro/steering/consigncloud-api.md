---
inclusion: always
---

# ConsignCloud API Reference

## Base URL

`https://api.consigncloud.com/api/v1`

## Authentication

Bearer token via `Authorization: Bearer <api-key>` header. Key stored in AWS SSM at `/{project}/{environment}/consigncloud-api-key`.

## Query Parameter Formatting (CRITICAL)

The ConsignCloud API uses **repeated query parameters** for multi-value fields. Do NOT join values with commas.

**Correct** (repeated params):

```
GET /sales?include=cashier&include=memo&include=status&expand=cashier&expand=customer
```

**WRONG** (comma-joined — causes HTTP 400):

```
GET /sales?include=cashier,memo,status&expand=cashier,customer
```

In code, always use `url.searchParams.append()` in a loop:

```typescript
for (const value of INCLUDE_VALUES) {
  url.searchParams.append("include", value);
}
for (const value of EXPAND_VALUES) {
  url.searchParams.append("expand", value);
}
```

Never use `url.searchParams.set("include", values.join(","))`.

## List Items

`GET /items`

### Query Parameters

- `limit` (integer): Page size, max 100
- `cursor` (string): Pagination cursor from `next_cursor`
- `include` (repeated): Fields to include (e.g., `include=batches&include=tags`)
- `expand` (repeated): Fields to expand (e.g., `expand=account&expand=category`)
- `created:gt` (date-time): Items created after this timestamp
- `created:gte` (date-time): Items created at or after this timestamp
- `created:lt` (date-time): Items created before this timestamp
- `created:lte` (date-time): Items created at or before this timestamp

### Response Schema (200)

```json
{
  "count": 154,
  "data": [Item],
  "next_cursor": "base64string" | null
}
```

### Item Schema

All monetary values are in **cents** (smallest denomination).

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID string | Item identifier |
| `sku` | string (e.g. "000001") | Display SKU |
| `created` | date-time | Creation timestamp |
| `deleted` | date-time \| null | Deletion timestamp |
| `expires` | date \| null | Expiration date |
| `schedule_start` | date | Stock date for schedules |
| `title` | string \| null | Item title/name |
| `brand` | string \| null | Brand name |
| `size` | string \| null | Size |
| `color` | string \| null | Color |
| `tag_price` | integer (cents) | Tag price, can be negative |
| `details` | string \| null | Short description |
| `description` | string \| null | Long description (markdown) |
| `inventory_type` | "consignment" \| "buy_outright" \| "retail" | |
| `terms` | "return_to_consignor" \| "donate" \| null | |
| `split` | number 0-1 \| null | Consignor split fraction |
| `split_price` | integer (cents) | Calculated split amount |
| `cost_per` | integer (cents) \| null | Cost per item |
| `quantity` | integer \| null | Can be null (untracked) or negative (oversold) |
| `tax_exempt` | boolean | |
| `status` | object | Counts by status (active, sold, etc.) |

**Expandable fields (use `expand=` param):**

| Field | Unexpanded | Expanded |
|-------|-----------|----------|
| `account` | UUID \| null | `{ id, number, first_name, last_name, email, ... }` |
| `category` | UUID \| null | `{ id, name, default_split, default_expiration_days, deleted }` |
| `created_by` | UUID \| null | `{ id, name, user_type }` |
| `shelf` | UUID \| null | `{ id, name }` |
| `location` | UUID \| null | `{ id, name }` |
| `images` | UUID[] | `[{ id, url }]` |
| `batches` | UUID[] | `[{ id, number }]` |
| `surcharges` | UUID[] | `[{ id, name, amount, type, ... }]` |

**Include fields (use `include=` param):**

batches, created_by, days_on_shelf, historic_consignor_portions, historic_sale_prices, historic_store_portions, last_sold, last_viewed, list_on_shopify, list_on_square, location, printed, split_price, surcharges, tags, tax_exempt, images, quantity, weight, weight_unit

### Field Mapping to Shop_Table

| ConsignCloud | Shop_Table | Transformation |
|---|---|---|
| `title` | `title` | Truncate 200 chars |
| `tag_price` | `tagPrice` | Divide by 100 (cents → CHF) |
| `quantity` | `quantity` | Direct (null → 0) |
| `split` | `split` | Multiply by 100 (fraction → percentage) |
| `inventory_type` | `inventoryType` | consignment→Consignment, buy_outright/retail→Retail |
| `terms` | `terms` | return_to_consignor→Return To Consignor, donate→Donate, null→Donate |
| `account.number` | `accountId` | Resolved via GSI1 to internal UUID |
| `created_by.id` | `createdBy` | Resolved/created as Employee entity |
| `category.id` | `categoryId` | Resolved/created as Category entity |
| `brand` | `brand` | Direct |
| `color` | `color` | Direct |
| `size` | `size` | Direct |
| `shelf.name` / `location.name` | `shelf` | Prefer shelf over location |
| `description` | `description` | Truncate 2000 chars |
| `tags` | `tags` | Max 20 string items |
| `images[].url` | `imageKeys` | Array of URLs |
| `tax_exempt` | `taxExempt` | Direct (default false) |
| `id` | `sourceId` | Direct (for deduplication) |

## List Sales

`GET /sales`

### Query Parameters

- `limit` (integer): Page size, max 100
- `cursor` (string): Pagination cursor from `next_cursor`
- `include` (repeated): Fields to include
- `expand` (repeated): Fields to expand
- `created:gt` (date-time): Sales created after this timestamp

### Valid `include` values for sales

cashier, memo, status, consignor_portion, store_portion, refunded_amount, line_item_count, notes, cogs, register, gift_cards, customer, customer.email_notifications_enabled, customer.tax_exempt, customer.address_line_1, customer.address_line_2, customer.city, customer.state, customer.postal_code, customer.tags, register_report, pending_swipe

**NOT safe to include** (cause HTTP 500): `total_tendered`, `amounts_tendered`

### Valid `expand` values for sales

cashier, customer, register, pending_swipe

### Response Schema (200)

```json
{
  "data": [Sale],
  "next_cursor": "base64string" | null
}
```

## Get Sale Line Items

`GET /sales/{saleId}/line-items`

### Response Schema (200)

```json
{
  "data": [LineItem]
}
```
