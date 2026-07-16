import { RateLimiter } from "./rate-limiter";
import { fetchWithRetry } from "./generic-consigncloud-client";

export interface ConsignCloudAccount {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  default_split?: number | null;
  last_settlement?: string | null;
  number_of_purchases?: number | null;
  default_inventory_type?: string | null;
  default_terms?: string | null;
  last_item_entered?: string | null;
  number_of_items?: number | null;
  created_by?: { id: string; name: string } | null;
  last_activity?: string | null;
  locations?: Array<{ id: string; name: string }> | null;
  recurring_fees?: Array<{ id: string; amount: number; description: string }> | null;
  tags?: string[] | null;
  is_vendor?: boolean | null;
  has_pending_invite?: boolean | null;
  created: string;
  updated?: string | null;
  [key: string]: unknown;
}

export interface FetchAccountPageResult {
  accounts: ConsignCloudAccount[];
  nextCursor: string | null;
}

export interface AccountClientConfig {
  apiKey: string;
  baseUrl: string;
  rateLimiter: RateLimiter;
  updatedAfter?: string;
  requestTimeoutMs?: number;
}

const INCLUDE_VALUES: string[] = [
  "default_split",
  "last_settlement",
  "number_of_purchases",
  "default_inventory_type",
  "default_terms",
  "last_item_entered",
  "number_of_items",
  "created_by",
  "last_activity",
  "locations",
  "recurring_fees",
  "tags",
  "is_vendor",
  "has_pending_invite",
];

const EXPAND_VALUES: string[] = [
  "created_by",
  "locations",
  "recurring_fees",
];

export async function fetchAccountPage(
  config: AccountClientConfig,
  cursor: string | null,
  limit: number,
): Promise<FetchAccountPageResult> {
  const url: URL = new URL(`${config.baseUrl}/accounts`);
  url.searchParams.set("limit", String(limit));

  for (const value of INCLUDE_VALUES) {
    url.searchParams.append("include", value);
  }
  for (const value of EXPAND_VALUES) {
    url.searchParams.append("expand", value);
  }

  if (config.updatedAfter) {
    url.searchParams.set("updated:gt", config.updatedAfter);
  }

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const response: Response = await fetchWithRetry(url.toString(), {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    rateLimiter: config.rateLimiter,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  const body = (await response.json()) as {
    data?: ConsignCloudAccount[];
    accounts?: ConsignCloudAccount[];
    next_cursor?: string | null;
  };

  const accounts: ConsignCloudAccount[] = body.data ?? body.accounts ?? [];
  const nextCursor: string | null = body.next_cursor ?? null;

  return { accounts, nextCursor };
}
