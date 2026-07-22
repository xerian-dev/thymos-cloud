import { RateLimiter } from "./rate-limiter";
import { fetchWithRetry } from "./generic-consigncloud-client";

export interface ConsignCloudSale {
  id: string;
  number: string;
  status: string; // "open" | "finalized" | "voided"
  subtotal: number; // cents
  total: number; // cents
  store_portion: number; // cents
  consignor_portion: number; // cents
  cogs: number; // cents
  change: number; // cents
  memo: string | null;
  cashier: { id: string; name: string } | null;
  created: string; // ISO 8601
  finalized: string | null; // ISO 8601
  voided: string | null; // ISO 8601
  parked: string | null; // ISO 8601
  refunded_amount: number; // cents
  cash_rounding_adjustment: number; // cents
  line_item_count: number;
  notes: unknown[]; // not mapped, but fetched for completeness
  gift_cards: unknown[]; // not mapped
  customer: unknown | null; // not mapped
  register: unknown | null; // not mapped
  register_report: unknown | null; // not mapped
  pending_swipe: unknown | null; // not mapped
}

export interface ConsignCloudLineItem {
  id: string;
  item: {
    id: string;
    image?: string | null;
    quantity?: number | null;
    title?: string;
    sku?: string;
  };
  unit_price: number;
  consignor_portion: number;
  store_portion: number;
  split_price: number;
  split: number;
  quantity: number;
  cost: number;
  taxed_price: number;
  tax_exempt: boolean;
  days_on_shelf: number;
  refunded_quantity: number;
  sale: string;
  created: string;
  discounts: string[];
  surcharges: string[];
  taxes: string[];
  applied_discounts: Array<{
    id: string;
    amount: number;
    level: string;
    discount: string;
  }>;
  applied_surcharges: Array<{ id: string; amount: number; surcharge: string }>;
  applied_taxes: Array<{
    id: string;
    amount: number;
    level: string;
    snapshot?: {
      name: string;
      percentage: number;
      tax_type: string;
      type: string;
    };
    tax: string;
  }>;
}

const INCLUDE_VALUES: string[] = [
  "cashier",
  "memo",
  "status",
  "consignor_portion",
  "store_portion",
  "refunded_amount",
  "line_item_count",
  "notes",
  "cogs",
  "register",
  "gift_cards",
  "customer",
  "customer.email_notifications_enabled",
  "customer.tax_exempt",
  "customer.address_line_1",
  "customer.address_line_2",
  "customer.city",
  "customer.state",
  "customer.postal_code",
  "customer.tags",
  "register_report",
  "pending_swipe",
  // NOT included: total_tendered, amounts_tendered (cause 500 errors)
];

const EXPAND_VALUES: string[] = [
  "cashier",
  "customer",
  "register",
  "pending_swipe",
];

export interface FetchSalePageResult {
  sales: ConsignCloudSale[];
  nextCursor: string | null;
}

export interface FetchLineItemsResult {
  lineItems: ConsignCloudLineItem[];
}

export interface SaleClientConfig {
  apiKey: string;
  baseUrl: string;
  rateLimiter: RateLimiter;
  createdAfter?: string;
  requestTimeoutMs?: number;
}

export async function fetchSalePage(
  config: SaleClientConfig,
  cursor: string | null,
  limit: number,
): Promise<FetchSalePageResult> {
  const url: URL = new URL(`${config.baseUrl}/sales`);
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

  const response: Response = await fetchWithRetry(url.toString(), {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    rateLimiter: config.rateLimiter,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  const body = (await response.json()) as {
    data?: ConsignCloudSale[];
    sales?: ConsignCloudSale[];
    next_cursor?: string | null;
  };

  const sales: ConsignCloudSale[] = body.data ?? body.sales ?? [];
  const nextCursor: string | null = body.next_cursor ?? null;

  return { sales, nextCursor };
}

export async function fetchSaleLineItems(
  config: SaleClientConfig,
  saleId: string,
): Promise<FetchLineItemsResult> {
  const url: URL = new URL(`${config.baseUrl}/sales/${saleId}/line-items`);

  const response: Response = await fetchWithRetry(url.toString(), {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    rateLimiter: config.rateLimiter,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  const body = (await response.json()) as {
    data?: ConsignCloudLineItem[];
    line_items?: ConsignCloudLineItem[];
  };

  const lineItems: ConsignCloudLineItem[] = body.data ?? body.line_items ?? [];

  return { lineItems };
}
