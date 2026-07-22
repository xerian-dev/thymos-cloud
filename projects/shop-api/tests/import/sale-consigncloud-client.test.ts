import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchSalePage,
  fetchSaleLineItems,
  SaleClientConfig,
} from "../../src/import/sale-consigncloud-client";
import { RateLimiter } from "../../src/import/rate-limiter";

function createMockRateLimiter(): RateLimiter {
  return { acquire: vi.fn().mockResolvedValue(undefined) };
}

function createConfig(overrides?: Partial<SaleClientConfig>): SaleClientConfig {
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

describe("sale-consigncloud-client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("fetchSalePage URL construction", () => {
    it("constructs URL with /sales path and limit param", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchSalePage(createConfig(), null, 100);

      const url: string = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/sales");
      expect(url).toContain("limit=100");
    });

    it("includes all expand params", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchSalePage(createConfig(), null, 50);

      const url: string = mockFetch.mock.calls[0][0] as string;
      const parsedUrl = new URL(url);
      const expandValues = parsedUrl.searchParams.getAll("expand");
      expect(expandValues).toEqual([
        "cashier",
        "customer",
        "register",
        "pending_swipe",
      ]);
    });

    it("includes all include params", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchSalePage(createConfig(), null, 50);

      const url: string = mockFetch.mock.calls[0][0] as string;
      const parsedUrl = new URL(url);
      const includeValues = parsedUrl.searchParams.getAll("include");
      expect(includeValues).toContain("cashier");
      expect(includeValues).toContain("cogs");
      expect(includeValues).toContain("refunded_amount");
      expect(includeValues).toContain("line_item_count");
      expect(includeValues).toContain("register_report");
      expect(includeValues).toContain("pending_swipe");
      expect(includeValues).toContain("customer");
      expect(includeValues).toContain("customer.email_notifications_enabled");
      expect(includeValues).toContain("customer.tax_exempt");
      expect(includeValues).not.toContain("total_tendered");
      expect(includeValues).not.toContain("amounts_tendered");
    });

    it("uses the specified limit value", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchSalePage(createConfig(), null, 25);

      const url: string = mockFetch.mock.calls[0][0] as string;
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get("limit")).toBe("25");
    });
  });

  describe("createdAfter forwarding", () => {
    it("includes created:gt param when createdAfter is configured", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      const config = createConfig({ createdAfter: "2026-01-01T00:00:00Z" });
      await fetchSalePage(config, null, 100);

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

      await fetchSalePage(createConfig(), null, 100);

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

      await fetchSalePage(createConfig(), "abc123cursor", 100);

      const url: string = mockFetch.mock.calls[0][0] as string;
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get("cursor")).toBe("abc123cursor");
    });

    it("does not include cursor param when cursor is null", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      await fetchSalePage(createConfig(), null, 100);

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

      await fetchSalePage(
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

      await fetchSalePage(createConfig(), null, 100);

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

      await fetchSalePage(createConfig({ requestTimeoutMs: 15000 }), null, 100);

      expect(timeoutSpy).toHaveBeenCalledWith(15000);
    });
  });

  describe("429 with Retry-After header", () => {
    it("retries after the duration specified in Retry-After header", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "3" }))
        .mockResolvedValueOnce(
          jsonResponse({ data: [{ id: "sale1" }], next_cursor: null }),
        );

      const config = createConfig();
      const resultPromise = fetchSalePage(config, null, 100);

      // Advance past the 3-second Retry-After delay
      await vi.advanceTimersByTimeAsync(3000);

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.sales).toHaveLength(1);
    });

    it("caps Retry-After delay at 60 seconds", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "120" }))
        .mockResolvedValueOnce(jsonResponse({ data: [], next_cursor: null }));

      const config = createConfig();
      const resultPromise = fetchSalePage(config, null, 100);

      // Advance past the 60-second max delay (capped from 120s)
      await vi.advanceTimersByTimeAsync(60000);

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.sales).toEqual([]);
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
      const resultPromise = fetchSalePage(config, null, 100);

      const assertionPromise =
        expect(resultPromise).rejects.toThrow(/5xx after 3 retries/);

      // Advance through all exponential backoff delays: 1s + 2s + 4s = 7s
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
          jsonResponse({ data: [{ id: "sale1" }], next_cursor: "next" }),
        );

      const config = createConfig();
      const resultPromise = fetchSalePage(config, null, 100);

      // Advance through backoff delays: 1s + 2s = 3s
      await vi.advanceTimersByTimeAsync(3000);

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.sales).toHaveLength(1);
      expect(result.nextCursor).toBe("next");
    });
  });

  describe("fetchSaleLineItems", () => {
    it("fetches from correct URL /sales/{saleId}/line-items", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [{ id: "li1", unit_price: 1000 }] }),
      );

      const config = createConfig();
      await fetchSaleLineItems(config, "sale-uuid-123");

      const url: string = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/sales/sale-uuid-123/line-items");
    });

    it("returns parsed line items from data field", async () => {
      const mockFetch = vi.mocked(fetch);
      const lineItems = [
        { id: "li1", price: 1000, discount: 0, quantity: 1 },
        { id: "li2", price: 2500, discount: 100, quantity: 2 },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: lineItems }));

      const config = createConfig();
      const result = await fetchSaleLineItems(config, "sale-uuid-123");

      expect(result.lineItems).toEqual(lineItems);
    });

    it("uses Bearer auth header for line item requests", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      const config = createConfig({ apiKey: "line-item-key" });
      await fetchSaleLineItems(config, "sale-uuid-123");

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toEqual(
        expect.objectContaining({
          Authorization: "Bearer line-item-key",
        }),
      );
    });
  });

  describe("rate limiter", () => {
    it("calls rateLimiter.acquire() before each request", async () => {
      const rateLimiter = createMockRateLimiter();
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], next_cursor: null }),
      );

      const config = createConfig({ rateLimiter });
      await fetchSalePage(config, null, 100);

      expect(rateLimiter.acquire).toHaveBeenCalled();
    });

    it("calls rateLimiter.acquire() before retry requests on 5xx", async () => {
      const rateLimiter = createMockRateLimiter();
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({ data: [], next_cursor: null }));

      const config = createConfig({ rateLimiter });
      const resultPromise = fetchSalePage(config, null, 100);

      // Advance through 1s backoff
      await vi.advanceTimersByTimeAsync(1000);

      await resultPromise;

      // Initial acquire + retry acquire = 2 calls
      expect(rateLimiter.acquire).toHaveBeenCalledTimes(2);
    });
  });

  describe("successful response parsing", () => {
    it("parses sales from data field and next_cursor", async () => {
      const mockFetch = vi.mocked(fetch);
      const sales = [
        { id: "sale-1", status: "finalized" },
        { id: "sale-2", status: "finalized" },
      ];
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: sales, next_cursor: "cursor-xyz" }),
      );

      const result = await fetchSalePage(createConfig(), null, 100);

      expect(result.sales).toEqual(sales);
      expect(result.nextCursor).toBe("cursor-xyz");
    });

    it("returns null nextCursor when next_cursor is null", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [{ id: "sale-1" }], next_cursor: null }),
      );

      const result = await fetchSalePage(createConfig(), null, 100);

      expect(result.nextCursor).toBeNull();
    });

    it("handles sales field as fallback when data field is missing", async () => {
      const mockFetch = vi.mocked(fetch);
      const sales = [{ id: "sale-1", status: "finalized" }];
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ sales, next_cursor: null }),
      );

      const result = await fetchSalePage(createConfig(), null, 100);

      expect(result.sales).toEqual(sales);
    });
  });

  describe("non-retryable 4xx", () => {
    it("throws immediately on 403 without retry", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse("Forbidden", 403));

      await expect(fetchSalePage(createConfig(), null, 100)).rejects.toThrow(
        /HTTP 403/,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("throws immediately on 401 without retry", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse("Unauthorized", 401));

      await expect(fetchSalePage(createConfig(), null, 100)).rejects.toThrow(
        /HTTP 401/,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });
});
