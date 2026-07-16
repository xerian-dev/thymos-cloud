import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAccountPage,
  AccountClientConfig,
  ConsignCloudAccount,
} from "../account-consigncloud-client";
import { RateLimiter } from "../rate-limiter";

const mockFetchWithRetry = vi.hoisted(() => vi.fn());

vi.mock("../generic-consigncloud-client", () => ({
  fetchWithRetry: mockFetchWithRetry,
}));

function createMockRateLimiter(): RateLimiter {
  return { acquire: () => Promise.resolve() };
}

function createConfig(
  overrides?: Partial<AccountClientConfig>,
): AccountClientConfig {
  return {
    apiKey: "test-api-key",
    baseUrl: "https://api.consigncloud.com/api/v1",
    rateLimiter: createMockRateLimiter(),
    ...overrides,
  };
}

function createMockAccount(id: string): ConsignCloudAccount {
  return {
    id,
    name: `Account ${id}`,
    email: `${id}@example.com`,
    created: "2025-01-01T00:00:00.000Z",
  };
}

function mockJsonResponse(body: unknown): { json: () => Promise<unknown> } {
  return {
    json: () => Promise.resolve(body),
  };
}

describe("account-consigncloud-client fetchAccountPage", () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds URL with all 14 include query parameters", async () => {
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ data: [], next_cursor: null }),
    );

    await fetchAccountPage(createConfig(), null, 50);

    const url: string = mockFetchWithRetry.mock.calls[0][0];
    const parsedUrl = new URL(url);
    const includeValues: string[] = parsedUrl.searchParams.getAll("include");

    expect(includeValues).toHaveLength(14);
    expect(includeValues).toEqual(
      expect.arrayContaining([
        "default_split",
        "last_settlement",
        "number_of_purchases",
        "default_inventory_type",
        "default_terms",
        "last_item_entered",
        "number_of_items",
        "created_by",
        "last_activity",
        "locations",
        "recurring_fees",
        "tags",
        "is_vendor",
        "has_pending_invite",
      ]),
    );
  });

  it("builds URL with correct expand query parameters", async () => {
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ data: [], next_cursor: null }),
    );

    await fetchAccountPage(createConfig(), null, 50);

    const url: string = mockFetchWithRetry.mock.calls[0][0];
    const parsedUrl = new URL(url);
    const expandValues: string[] = parsedUrl.searchParams.getAll("expand");

    expect(expandValues).toHaveLength(3);
    expect(expandValues).toEqual(
      expect.arrayContaining(["created_by", "locations", "recurring_fees"]),
    );
  });

  it("applies created:gt filter when createdAfter is provided", async () => {
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ data: [], next_cursor: null }),
    );

    const config: AccountClientConfig = createConfig({
      createdAfter: "2025-01-01T00:00:00.000Z",
    });

    await fetchAccountPage(config, null, 50);

    const url: string = mockFetchWithRetry.mock.calls[0][0];
    const parsedUrl = new URL(url);

    expect(parsedUrl.searchParams.get("created:gt")).toBe(
      "2025-01-01T00:00:00.000Z",
    );
  });

  it("does not include created:gt filter when createdAfter is not provided", async () => {
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ data: [], next_cursor: null }),
    );

    await fetchAccountPage(createConfig(), null, 50);

    const url: string = mockFetchWithRetry.mock.calls[0][0];
    const parsedUrl = new URL(url);

    expect(parsedUrl.searchParams.has("created:gt")).toBe(false);
  });

  it("includes cursor parameter when cursor is provided", async () => {
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ data: [], next_cursor: null }),
    );

    await fetchAccountPage(createConfig(), "abc123", 50);

    const url: string = mockFetchWithRetry.mock.calls[0][0];
    const parsedUrl = new URL(url);

    expect(parsedUrl.searchParams.get("cursor")).toBe("abc123");
  });

  it("does not include cursor parameter when cursor is null", async () => {
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ data: [], next_cursor: null }),
    );

    await fetchAccountPage(createConfig(), null, 50);

    const url: string = mockFetchWithRetry.mock.calls[0][0];
    const parsedUrl = new URL(url);

    expect(parsedUrl.searchParams.has("cursor")).toBe(false);
  });

  it("sets the limit query parameter to the provided value", async () => {
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ data: [], next_cursor: null }),
    );

    await fetchAccountPage(createConfig(), null, 100);

    const url: string = mockFetchWithRetry.mock.calls[0][0];
    const parsedUrl = new URL(url);

    expect(parsedUrl.searchParams.get("limit")).toBe("100");
  });

  it("parses response with data field and next_cursor", async () => {
    const mockAccounts: ConsignCloudAccount[] = [
      createMockAccount("acc-1"),
      createMockAccount("acc-2"),
    ];

    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ data: mockAccounts, next_cursor: "cursor-next" }),
    );

    const result = await fetchAccountPage(createConfig(), null, 50);

    expect(result.accounts).toEqual(mockAccounts);
    expect(result.nextCursor).toBe("cursor-next");
  });

  it("returns nextCursor as null when next_cursor is null in response", async () => {
    const mockAccounts: ConsignCloudAccount[] = [createMockAccount("acc-1")];

    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ data: mockAccounts, next_cursor: null }),
    );

    const result = await fetchAccountPage(createConfig(), null, 50);

    expect(result.accounts).toEqual(mockAccounts);
    expect(result.nextCursor).toBeNull();
  });

  it("falls back to accounts field when data field is not present", async () => {
    const mockAccounts: ConsignCloudAccount[] = [
      createMockAccount("acc-fallback"),
    ];

    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ accounts: mockAccounts }),
    );

    const result = await fetchAccountPage(createConfig(), null, 50);

    expect(result.accounts).toEqual(mockAccounts);
    expect(result.nextCursor).toBeNull();
  });
});
