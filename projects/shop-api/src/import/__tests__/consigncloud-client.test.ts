import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAccountPage,
  fetchAllAccounts,
  ConsignCloudClientConfig,
} from "../consigncloud-client";
import { RateLimiter } from "../rate-limiter";

function createMockRateLimiter(): RateLimiter {
  return { acquire: () => Promise.resolve() };
}

function createConfig(
  apiKey: string = "test-api-key",
): ConsignCloudClientConfig {
  return {
    apiKey,
    baseUrl: "https://api.consigncloud.com/api/v1",
    rateLimiter: createMockRateLimiter(),
  };
}

function jsonResponse(
  body: unknown,
  status: number = 200,
  headers?: Record<string, string>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe("consigncloud-client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sets Bearer token in request headers", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ accounts: [], next_cursor: null }),
    );

    await fetchAccountPage(createConfig("my-secret-token"), null, 100);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0];
    expect(options?.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer my-secret-token" }),
    );
  });

  it("sets limit=100 query parameter", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ accounts: [], next_cursor: null }),
    );

    await fetchAccountPage(createConfig(), null, 100);

    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("limit=100");
  });

  it("retries on HTTP 429 with backoff", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "2" }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [], next_cursor: null }));

    const resultPromise = fetchAccountPage(createConfig(), null, 100);

    // Advance past the backoff delay (Retry-After: 2 seconds)
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.accounts).toEqual([]);
  });

  it("retries HTTP 5xx up to 3 times with exponential backoff", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 502))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ accounts: [], next_cursor: null }));

    const resultPromise = fetchAccountPage(createConfig(), null, 100);

    // Advance through exponential backoff delays: 1s, 2s, 4s
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    const result = await resultPromise;

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(result.accounts).toEqual([]);
  });

  it("fails immediately on HTTP 4xx (non-429) without retry", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(jsonResponse("Bad Request", 400));

    await expect(fetchAccountPage(createConfig(), null, 100)).rejects.toThrow(
      /HTTP 400/,
    );

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns empty result when accounts array is empty", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ accounts: [], next_cursor: null }),
    );

    const result = await fetchAllAccounts(createConfig());

    expect(result.accounts).toEqual([]);
    expect(result.skipped).toBe(0);
  });
});
