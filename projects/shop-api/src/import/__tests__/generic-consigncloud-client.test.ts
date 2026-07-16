import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWithRetry,
  ConsignCloudClientConfig,
} from "../generic-consigncloud-client";
import { RateLimiter } from "../rate-limiter";

function createMockRateLimiter(): RateLimiter {
  return { acquire: () => Promise.resolve() };
}

function createConfig(
  overrides?: Partial<ConsignCloudClientConfig>,
): ConsignCloudClientConfig {
  return {
    apiKey: "test-api-key",
    baseUrl: "https://api.consigncloud.com/api/v1",
    rateLimiter: createMockRateLimiter(),
    ...overrides,
  };
}

function createMockResponse(
  status: number,
  body?: string,
  headers?: Record<string, string>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: () => Promise.resolve(body ?? ""),
    json: () => Promise.resolve(JSON.parse(body ?? "{}")),
  } as unknown as Response;
}

describe("generic-consigncloud-client fetchWithRetry", () => {
  const mockFetch = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockFetch.mockReset();
  });

  it("returns the Response when fetch returns ok", async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse(200, '{"data": []}'));

    const response: Response = await fetchWithRetry(
      "https://api.example.com/resource",
      createConfig(),
    );

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("retries on 429 with Retry-After header and succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse(429, "", { "Retry-After": "3" }),
      )
      .mockResolvedValueOnce(createMockResponse(200, '{"data": []}'));

    const resultPromise = fetchWithRetry(
      "https://api.example.com/resource",
      createConfig(),
    );

    // Advance past the Retry-After delay (3 seconds = 3000ms)
    await vi.advanceTimersByTimeAsync(3000);

    const response: Response = await resultPromise;

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("uses exponential backoff on 429 without Retry-After header", async () => {
    mockFetch
      .mockResolvedValueOnce(createMockResponse(429))
      .mockResolvedValueOnce(createMockResponse(429))
      .mockResolvedValueOnce(createMockResponse(200, '{"ok": true}'));

    const resultPromise = fetchWithRetry(
      "https://api.example.com/resource",
      createConfig(),
    );

    // First 429: backoff = 1000 * 2^(1-1) = 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // Second 429: backoff = 1000 * 2^(2-1) = 2000ms
    await vi.advanceTimersByTimeAsync(2000);

    const response: Response = await resultPromise;

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws rate-limit error after 5 consecutive 429 responses", async () => {
    mockFetch.mockResolvedValue(createMockResponse(429));

    const resultPromise = fetchWithRetry(
      "https://api.example.com/resource",
      createConfig(),
    );
    // Prevent unhandled rejection warning while timers advance
    const caughtPromise = resultPromise.catch((e: unknown) => e);

    // Advance through all backoff delays for 4 retries (5th triggers throw)
    // consecutive 1: delay = 1000 * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // consecutive 2: delay = 1000 * 2^1 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    // consecutive 3: delay = 1000 * 2^2 = 4000ms
    await vi.advanceTimersByTimeAsync(4000);
    // consecutive 4: delay = 1000 * 2^3 = 8000ms
    await vi.advanceTimersByTimeAsync(8000);

    const error = await caughtPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/5 consecutive 429 responses/);
  });

  it("retries on 5xx and succeeds on second attempt", async () => {
    mockFetch
      .mockResolvedValueOnce(createMockResponse(500, "Internal Server Error"))
      .mockResolvedValueOnce(createMockResponse(200, '{"data": []}'));

    const resultPromise = fetchWithRetry(
      "https://api.example.com/resource",
      createConfig(),
    );

    // 5xx retry delay: 1000 * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(1000);

    const response: Response = await resultPromise;

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after 3 failed 5xx retries", async () => {
    mockFetch.mockResolvedValue(createMockResponse(502, "Bad Gateway"));

    const resultPromise = fetchWithRetry(
      "https://api.example.com/resource",
      createConfig(),
    );
    // Prevent unhandled rejection warning while timers advance
    const caughtPromise = resultPromise.catch((e: unknown) => e);

    // Initial 5xx, then 3 retries:
    // retry 0: delay = 1000 * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // retry 1: delay = 1000 * 2^1 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    // retry 2: delay = 1000 * 2^2 = 4000ms
    await vi.advanceTimersByTimeAsync(4000);

    const error = await caughtPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/HTTP 5xx after 3 retries/);
  });

  it("follows exponential backoff pattern for 5xx retries", async () => {
    mockFetch
      .mockResolvedValueOnce(createMockResponse(503))
      .mockResolvedValueOnce(createMockResponse(503))
      .mockResolvedValueOnce(createMockResponse(503))
      .mockResolvedValueOnce(createMockResponse(200, '{"ok": true}'));

    const resultPromise = fetchWithRetry(
      "https://api.example.com/resource",
      createConfig(),
    );

    // After initial 503, retries begin:
    // retry 0 delay: 1000 * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(999);
    // Should not have retried yet
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    // Now retry 0 fires

    // retry 1 delay: 1000 * 2^1 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);

    // retry 2 delay: 1000 * 2^2 = 4000ms
    await vi.advanceTimersByTimeAsync(4000);

    const response: Response = await resultPromise;

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("throws timeout error when fetch times out", async () => {
    const timeoutError = new Error("The operation was aborted due to timeout");
    timeoutError.name = "TimeoutError";
    mockFetch.mockRejectedValueOnce(timeoutError);

    await expect(
      fetchWithRetry(
        "https://api.example.com/resource",
        createConfig({ requestTimeoutMs: 5000 }),
      ),
    ).rejects.toThrow(/timed out after 5000ms/);

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("throws immediately on non-retryable 4xx with status and body", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse(403, "Forbidden: invalid API key"),
    );

    await expect(
      fetchWithRetry("https://api.example.com/resource", createConfig()),
    ).rejects.toThrow(/HTTP 403: Forbidden: invalid API key/);

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("handles 429 during 5xx retry loop correctly", async () => {
    mockFetch
      // Initial request: 500
      .mockResolvedValueOnce(createMockResponse(500))
      // 5xx retry 0: delay 1000ms, then returns 429
      .mockResolvedValueOnce(
        createMockResponse(429, "", { "Retry-After": "1" }),
      )
      // After 429 backoff (1000ms) + continue in for-loop advances attempt to 1
      // 5xx retry 1: delay 1000 * 2^1 = 2000ms, then returns 200
      .mockResolvedValueOnce(createMockResponse(200, '{"data": []}'));

    const resultPromise = fetchWithRetry(
      "https://api.example.com/resource",
      createConfig(),
    );

    // 5xx retry 0 delay: 1000 * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // 429 Retry-After: 1 second = 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // continue advances to attempt 1, delay: 1000 * 2^1 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);

    const response: Response = await resultPromise;

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
