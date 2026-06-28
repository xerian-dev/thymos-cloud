import { RateLimiter } from "./rate-limiter";
import { ConsignCloudAccount } from "./field-mapper";

export type { ConsignCloudAccount } from "./field-mapper";

export interface FetchPageResult {
  accounts: ConsignCloudAccount[];
  nextCursor: string | null;
}

export interface ConsignCloudClientConfig {
  apiKey: string;
  baseUrl: string;
  rateLimiter: RateLimiter;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

function isRetryableStatus(status: number, config: RetryConfig): boolean {
  return config.retryableStatuses.includes(status);
}

function calculateDelay(
  attempt: number,
  response: Response | null,
  config: RetryConfig,
): number {
  if (response?.status === 429) {
    const retryAfter: string | null = response.headers.get("Retry-After");
    if (retryAfter) {
      const retryAfterMs: number = Number(retryAfter) * 1000;
      if (!Number.isNaN(retryAfterMs) && retryAfterMs > 0) {
        return Math.min(retryAfterMs, config.maxDelayMs);
      }
    }
  }

  return Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function fetchAccountPage(
  config: ConsignCloudClientConfig,
  cursor: string | null,
  limit: number,
): Promise<FetchPageResult> {
  const retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG;

  const url: URL = new URL(`${config.baseUrl}/accounts`);
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  let lastError: Error | null = null;

  for (let attempt: number = 0; attempt <= retryConfig.maxRetries; attempt++) {
    await config.rateLimiter.acquire();

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
        },
      });
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retryConfig.maxRetries) {
        const delay: number = calculateDelay(attempt, null, retryConfig);
        await sleep(delay);
        continue;
      }
      throw lastError;
    }

    if (response.ok) {
      const body = (await response.json()) as {
        data?: ConsignCloudAccount[];
        accounts?: ConsignCloudAccount[];
        count?: number;
        next_cursor?: string | null;
      };

      const accounts: ConsignCloudAccount[] = body.data ?? body.accounts ?? [];
      const nextCursor: string | null = body.next_cursor ?? null;

      return {
        accounts,
        nextCursor,
      };
    }

    if (!isRetryableStatus(response.status, retryConfig)) {
      const body: string = await response.text();
      throw new Error(
        `ConsignCloud API returned HTTP ${response.status}: ${body}`,
      );
    }

    lastError = new Error(`ConsignCloud API returned HTTP ${response.status}`);

    if (attempt < retryConfig.maxRetries) {
      const delay: number = calculateDelay(attempt, response, retryConfig);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Request failed after retries");
}

export async function fetchAllAccounts(
  config: ConsignCloudClientConfig,
): Promise<{ accounts: ConsignCloudAccount[]; skipped: number }> {
  const accounts: ConsignCloudAccount[] = [];
  let skipped: number = 0;
  let cursor: string | null = null;

  do {
    const page: FetchPageResult = await fetchAccountPage(config, cursor, 100);

    for (const account of page.accounts) {
      if (account.deleted != null) {
        skipped++;
      } else {
        accounts.push(account);
      }
    }

    cursor = page.nextCursor;
  } while (cursor !== null);

  return { accounts, skipped };
}
