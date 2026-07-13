import { RateLimiter } from "./rate-limiter";

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

const DEFAULT_TIMEOUT_MS: number = 30_000;
const MAX_CONSECUTIVE_429S: number = 5;
const MAX_5XX_RETRIES: number = 3;
const BACKOFF_BASE_MS: number = 1000;
const BACKOFF_MAX_MS: number = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function calculate429Delay(
  consecutiveCount: number,
  response: Response,
): number {
  const retryAfter: string | null = response.headers.get("Retry-After");
  if (retryAfter) {
    const retryAfterMs: number = Number(retryAfter) * 1000;
    if (!Number.isNaN(retryAfterMs) && retryAfterMs > 0) {
      return Math.min(retryAfterMs, BACKOFF_MAX_MS);
    }
  }

  return Math.min(
    BACKOFF_BASE_MS * Math.pow(2, consecutiveCount - 1),
    BACKOFF_MAX_MS,
  );
}

function calculate5xxDelay(attempt: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, attempt);
}

async function fetchWithRetry(
  url: string,
  config: SaleClientConfig,
): Promise<Response> {
  const timeoutMs: number = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  let consecutive429s: number = 0;

  for (;;) {
    await config.rateLimiter.acquire();

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(
          `ConsignCloud API request timed out after ${timeoutMs}ms`,
        );
      }
      throw error;
    }

    if (response.ok) {
      return response;
    }

    if (response.status === 429) {
      consecutive429s++;

      if (consecutive429s >= MAX_CONSECUTIVE_429S) {
        throw new Error(
          `ConsignCloud API rate limit: ${MAX_CONSECUTIVE_429S} consecutive 429 responses, pausing`,
        );
      }

      const delay: number = calculate429Delay(consecutive429s, response);
      await sleep(delay);
      continue;
    }

    if (response.status >= 500 && response.status < 600) {
      let lastError: Error = new Error(
        `ConsignCloud API returned HTTP ${response.status}`,
      );

      for (let attempt: number = 0; attempt < MAX_5XX_RETRIES; attempt++) {
        const delay: number = calculate5xxDelay(attempt);
        await sleep(delay);

        await config.rateLimiter.acquire();

        let retryResponse: Response;
        try {
          retryResponse = await fetch(url, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (error: unknown) {
          if (error instanceof Error && error.name === "TimeoutError") {
            throw new Error(
              `ConsignCloud API request timed out after ${timeoutMs}ms`,
            );
          }
          throw error;
        }

        if (retryResponse.ok) {
          return retryResponse;
        }

        if (retryResponse.status === 429) {
          consecutive429s++;
          if (consecutive429s >= MAX_CONSECUTIVE_429S) {
            throw new Error(
              `ConsignCloud API rate limit: ${MAX_CONSECUTIVE_429S} consecutive 429 responses, pausing`,
            );
          }
          const retryDelay: number = calculate429Delay(
            consecutive429s,
            retryResponse,
          );
          await sleep(retryDelay);
          continue;
        }

        if (retryResponse.status >= 500 && retryResponse.status < 600) {
          lastError = new Error(
            `ConsignCloud API returned HTTP ${retryResponse.status}`,
          );
          continue;
        }

        // Non-retryable response during 5xx retry
        const retryBody: string = await retryResponse.text();
        throw new Error(
          `ConsignCloud API returned HTTP ${retryResponse.status}: ${retryBody}`,
        );
      }

      throw new Error(
        `ConsignCloud API returned HTTP 5xx after ${MAX_5XX_RETRIES} retries: ${lastError.message}`,
      );
    }

    // Non-retryable 4xx (not 429)
    const body: string = await response.text();
    throw new Error(
      `ConsignCloud API returned HTTP ${response.status}: ${body}`,
    );
  }
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

  const response: Response = await fetchWithRetry(url.toString(), config);

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

  const response: Response = await fetchWithRetry(url.toString(), config);

  const body = (await response.json()) as {
    data?: ConsignCloudLineItem[];
    line_items?: ConsignCloudLineItem[];
  };

  const lineItems: ConsignCloudLineItem[] = body.data ?? body.line_items ?? [];

  return { lineItems };
}
