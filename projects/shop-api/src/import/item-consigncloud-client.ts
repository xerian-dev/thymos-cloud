import { RateLimiter } from "./rate-limiter";

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

  const timeoutMs: number = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  let consecutive429s: number = 0;

  for (;;) {
    await config.rateLimiter.acquire();

    let response: Response;
    try {
      response = await fetch(url.toString(), {
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
      const body = (await response.json()) as {
        data?: ConsignCloudItem[];
        items?: ConsignCloudItem[];
        next_cursor?: string | null;
      };

      const items: ConsignCloudItem[] = body.data ?? body.items ?? [];
      const nextCursor: string | null = body.next_cursor ?? null;

      return { items, nextCursor };
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
          retryResponse = await fetch(url.toString(), {
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
          const body = (await retryResponse.json()) as {
            data?: ConsignCloudItem[];
            items?: ConsignCloudItem[];
            next_cursor?: string | null;
          };

          const items: ConsignCloudItem[] = body.data ?? body.items ?? [];
          const nextCursor: string | null = body.next_cursor ?? null;

          return { items, nextCursor };
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
