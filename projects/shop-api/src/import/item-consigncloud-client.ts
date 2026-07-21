import { RateLimiter } from "./rate-limiter";
import {
  fetchWithRetry,
  ConsignCloudClientConfig,
} from "./generic-consigncloud-client";

export interface ConsignCloudItem {
  id: string;
  title?: string;
  tag_price?: number;
  price?: number;
  quantity: number;
  split?: number;
  consignor_split?: number;
  inventory_type?: string;
  terms?: string;
  account_id?: string;
  account?: { id: string; number: string } | null;
  created_by?: { id: string; name: string; user_type?: string } | null;
  category?: { id: string; name: string } | null;
  tags?: string[] | Array<unknown>;
  description?: string;
  details?: string | null;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: { name: string } | null;
  location?: { name: string } | null;
  tax_exempt?: boolean;
  images?: Array<{ url: string }>;
  created: string;
  deleted?: string | null;
  sku?: string;
  // New fields for expanded import
  schedule_start?: string | null;
  expires?: string | null;
  status?: Record<string, number> | null;
  last_sold?: string | null;
  last_viewed?: string | null;
  printed?: string | null;
  days_on_shelf?: number | null;
}

export interface FetchItemPageResult {
  items: ConsignCloudItem[];
  nextCursor: string | null;
}

export interface ItemClientConfig {
  apiKey: string;
  baseUrl: string;
  rateLimiter: RateLimiter;
  createdAfter?: string;
  requestTimeoutMs?: number;
}

const INCLUDE_VALUES: string[] = [
  "batches",
  "created_by",
  "days_on_shelf",
  "historic_consignor_portions",
  "historic_sale_prices",
  "historic_store_portions",
  "last_sold",
  "last_viewed",
  "list_on_shopify",
  "list_on_square",
  "location",
  "printed",
  "split_price",
  "surcharges",
  "tags",
  "tax_exempt",
  "images",
  "quantity",
  "weight",
  "weight_unit",
];

const EXPAND_VALUES: string[] = [
  "account",
  "category",
  "created_by",
  "surcharges",
  "shelf",
  "batches",
  "images",
  "location",
];

export async function fetchItemPage(
  config: ItemClientConfig,
  cursor: string | null,
  limit: number,
): Promise<FetchItemPageResult> {
  const url: URL = new URL(`${config.baseUrl}/items`);
  url.searchParams.set("limit", String(limit));
  for (const value of INCLUDE_VALUES) {
    url.searchParams.append("include", value);
  }
  for (const value of EXPAND_VALUES) {
    url.searchParams.append("expand", value);
  }

  if (config.createdAfter) {
    url.searchParams.set("created:gt", config.createdAfter);
  }

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const clientConfig: ConsignCloudClientConfig = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    rateLimiter: config.rateLimiter,
    requestTimeoutMs: config.requestTimeoutMs,
  };

  const response: Response = await fetchWithRetry(url.toString(), clientConfig);

  const body = (await response.json()) as {
    data?: ConsignCloudItem[];
    items?: ConsignCloudItem[];
    next_cursor?: string | null;
  };

  const items: ConsignCloudItem[] = body.data ?? body.items ?? [];
  const nextCursor: string | null = body.next_cursor ?? null;

  return { items, nextCursor };
}
