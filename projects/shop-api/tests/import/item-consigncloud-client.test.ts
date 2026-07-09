import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchItemPage,
  ItemClientConfig,
} from "../../src/import/item-consigncloud-client";
import { RateLimiter } from "../../src/import/rate-limiter";

function createMockRateLimiter(): RateLimiter {
  return { acquire: vi.fn().mockResolvedValue(undefined) };
}

function createConfig(overrides?: Partial<ItemClientConfig>): ItemClientConfig {
  return {
    apiKey: "test-api-key",
    baseUrl: "https://api.consigncloud.com/api/v1",
    rateLimiter: createMockRateLimiter(),
    ...overrides,
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

describe("item-consigncloud-client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("URL construction", () => {
    it("constructs URL with /items path and limit=100", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchItemPage(createConfig(), null, 100);

      const url: string = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/items");
      expect(url).toContain("limit=100");
    });

    it("includes all 20 include parameter values", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchItemPage(createConfig(), null, 100);

      const url: string = mockFetch.mock.calls[0][0] as string;
      const parsedUrl = new URL(url);
      const includeValues: string[] = parsedUrl.searchParams.getAll("include");

      expect(includeValues).toHaveLength(20);
      expect(includeValues).toContain("batches");
      expect(includeValues).toContain("created_by");
      expect(includeValues).toContain("days_on_shelf");
      expect(includeValues).toContain("historic_consignor_portions");
      expect(includeValues).toContain("historic_sale_prices");
      expect(includeValues).toContain("historic_store_portions");
      expect(includeValues).toContain("last_sold");
      expect(includeValues).toContain("last_viewed");
      expect(includeValues).toContain("list_on_shopify");
      expect(includeValues).toContain("list_on_square");
      expect(includeValues).toContain("location");
      expect(includeValues).toContain("printed");
      expect(includeValues).toContain("split_price");
      expect(includeValues).toContain("surcharges");
      expect(includeValues).toContain("tags");
      expect(includeValues).toContain("tax_exempt");
      expect(includeValues).toContain("images");
      expect(includeValues).toContain("quantity");
      expect(includeValues).toContain("weight");
      expect(includeValues).toContain("weight_unit");
    });

    it("includes all 8 expand parameter values", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchItemPage(createConfig(), null, 100);

      const url: string = mockFetch.mock.calls[0][0] as string;
      const parsedUrl = new URL(url);
      const expandValues: string[] = parsedUrl.searchParams.getAll("expand");

      expect(expandValues).toHaveLength(8);
      expect(expandValues).toContain("account");
      expect(expandValues).toContain("category");
      expect(expandValues).toContain("created_by");
      expect(expandValues).toContain("surcharges");
      expect(expandValues).toContain("shelf");
      expect(expandValues).toContain("batches");
      expect(expandValues).toContain("images");
      expect(expandValues).toContain("location");
    });
  });

  describe("createdAfter forwarding", () => {
    it("includes created:gt param when createdAfter is configured", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      const config = createConfig({ createdAfter: "2026-01-01T00:00:00Z" });
      await fetchItemPage(config, null, 100);

      const url: string = mockFetch.mock.calls[0][0] as string;
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get("created:gt")).toBe(
        "2026-01-01T00:00:00Z",
      );
    });

    it("does not include created:gt param when createdAfter is not configured", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchItemPage(createConfig(), null, 100);

      const url: string = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain("created%3Agt");
      expect(url).not.toContain("created:gt");
    });
  });

  describe("cursor pagination", () => {
    it("includes cursor param when cursor is provided", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchItemPage(createConfig(), "abc123cursor", 100);

      const url: string = mockFetch.mock.calls[0][0] as string;
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get("cursor")).toBe("abc123cursor");
    });

    it("does not include cursor param when cursor is null", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchItemPage(createConfig(), null, 100);

      const url: string = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain("cursor=");
    });
  });

  describe("authentication header", () => {
    it("includes Authorization Bearer header with apiKey", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchItemPage(
        createConfig({ apiKey: "my-secret-token" }),
        null,
        100,
      );

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toEqual(
        expect.objectContaining({
          Authorization: "Bearer my-secret-token",
        }),
      );
    });
  });

  describe("30s timeout", () => {
    it("passes AbortSignal.timeout(30000) in fetch options", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      const timeoutSpy = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValue(new AbortController().signal);

      await fetchItemPage(createConfig(), null, 100);

      expect(timeoutSpy).toHaveBeenCalledWith(30000);
      const [, options] = mockFetch.mock.calls[0];
      expect(options?.signal).toBeDefined();
    });

    it("uses custom timeout from config.requestTimeoutMs", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      const timeoutSpy = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValue(new AbortController().signal);

      await fetchItemPage(createConfig({ requestTimeoutMs: 15000 }), null, 100);

      expect(timeoutSpy).toHaveBeenCalledWith(15000);
    });
  });

  describe("429 with Retry-After header", () => {
    it("retries after the duration specified in Retry-After header", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "3" }))
        .mockResolvedValueOnce(
          jsonResponse({ data: [{ id: "item1" }], next_cursor: null }),
        );

      const config = createConfig();
      const resultPromise = fetchItemPage(config, null, 100);

      // Advance past the 3-second Retry-After delay
      await vi.advanceTimersByTimeAsync(3000);

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.items).toHaveLength(1);
    });

    it("caps Retry-After delay at 60 seconds", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "120" }))
        .mockResolvedValueOnce(jsonResponse({ data: [], next_cursor: null }));

      const config = createConfig();
      const resultPromise = fetchItemPage(config, null, 100);

      // Advance past the 60-second max delay (capped from 120s)
      await vi.advanceTimersByTimeAsync(60000);

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.items).toEqual([]);
    });
  });

  describe("5xx retry exhaustion", () => {
    it("throws after exhausting 3 retries on 5xx responses", async () => {
      const mockFetch = vi.mocked(fetch);
      // Initial request + 3 retries = 4 total fetches, all 500
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({}, 500));

      const config = createConfig();
      const resultPromise = fetchItemPage(config, null, 100);

      // Attach the rejection handler before advancing timers to prevent
      // unhandled rejection warning
      const assertionPromise =
        expect(resultPromise).rejects.toThrow(/5xx after 3 retries/);

      // Advance through all exponential backoff delays at once: 1s + 2s + 4s = 7s
      await vi.advanceTimersByTimeAsync(7000);

      await assertionPromise;
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("succeeds if a retry returns 200", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 502))
        .mockResolvedValueOnce(jsonResponse({}, 503))
        .mockResolvedValueOnce(
          jsonResponse({ data: [{ id: "item1" }], next_cursor: "next" }),
        );

      const config = createConfig();
      const resultPromise = fetchItemPage(config, null, 100);

      // Advance through backoff delays: 1s + 2s = 3s
      await vi.advanceTimersByTimeAsync(3000);

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe("next");
    });
  });

  describe("successful response parsing", () => {
    it("parses items from data field and next_cursor", async () => {
      const mockFetch = vi.mocked(fetch);
      const items = [
        { id: "item-1", title: "Widget" },
        { id: "item-2", title: "Gadget" },
      ];
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: items, next_cursor: "cursor-xyz" }),
      );

      const result = await fetchItemPage(createConfig(), null, 100);

      expect(result.items).toEqual(items);
      expect(result.nextCursor).toBe("cursor-xyz");
    });

    it("returns null nextCursor when next_cursor is null", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [{ id: "item-1" }], next_cursor: null }),
      );

      const result = await fetchItemPage(createConfig(), null, 100);

      expect(result.nextCursor).toBeNull();
    });

    it("handles items field as fallback when data field is missing", async () => {
      const mockFetch = vi.mocked(fetch);
      const items = [{ id: "item-1", title: "Fallback" }];
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items, next_cursor: null }),
      );

      const result = await fetchItemPage(createConfig(), null, 100);

      expect(result.items).toEqual(items);
    });
  });

  describe("non-retryable 4xx", () => {
    it("throws immediately on 403 without retry", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse("Forbidden", 403));

      await expect(fetchItemPage(createConfig(), null, 100)).rejects.toThrow(
        /HTTP 403/,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("throws immediately on 401 without retry", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse("Unauthorized", 401));

      await expect(fetchItemPage(createConfig(), null, 100)).rejects.toThrow(
        /HTTP 401/,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });
});
