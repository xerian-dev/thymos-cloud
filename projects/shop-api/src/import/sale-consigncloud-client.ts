import { RateLimiter } from "./rate-limiter";
import { fetchWithRetry } from "./generic-consigncloud-client";

export interface ConsignCloudSale {
  id: string;
  number: string;
  status: string;
  subtotal: number;
  total: number;
  store_portion: number;
  consignor_portion: number;
  change: number;
  memo: string | null;
  cashier: { id: string; name: string } | null;
  created: string;
  finalized: string | null;
  voided: string | null;
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
    tax: string;
  }>;
}

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
  url.searchParams.set("expand", "cashier");

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
