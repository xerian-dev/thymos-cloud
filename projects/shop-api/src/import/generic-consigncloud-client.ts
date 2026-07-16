import { RateLimiter } from "./rate-limiter";

export interface ConsignCloudClientConfig {
  apiKey: string;
  baseUrl: string;
  rateLimiter: RateLimiter;
  requestTimeoutMs?: number;
}

export interface FetchPageResult<T> {
  data: T[];
  nextCursor: string | null;
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

/**
 * Executes a GET request with full retry logic:
 * - 429: exponential backoff, respects Retry-After, max 5 consecutive
 * - 5xx: up to 3 retries with exponential backoff
 * - Timeout: AbortSignal.timeout, default 30s
 * - Other 4xx: throws immediately with status + body
 */
export async function fetchWithRetry(
  url: string,
  config: ConsignCloudClientConfig,
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
