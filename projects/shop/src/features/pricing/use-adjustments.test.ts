import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAdjustments } from "./use-adjustments";
import type {
  AdjustmentEvent,
  AdjustmentFilters,
  AdjustmentListResult,
} from "./pricing-types";

vi.mock("./pricing-api");

const mockAdjustment: AdjustmentEvent = {
  id: "adj-001",
  brand: "Nike",
  category: "Shoes",
  previousPrice: 50,
  newPrice: 45,
  direction: "decrease",
  percentageChange: -10,
  reason: "Low sell-through rate",
  metrics: {
    sellThroughRate: 0.25,
    medianDaysOnShelf: 45,
    sampleSize: 30,
    discountFrequency: 0.4,
    priceRatio: 0.85,
  },
  timestamp: "2024-01-15T10:00:00Z",
};

const mockSecondAdjustment: AdjustmentEvent = {
  id: "adj-002",
  brand: "Adidas",
  category: "Shirts",
  previousPrice: 30,
  newPrice: 33,
  direction: "increase",
  percentageChange: 10,
  reason: "High sell-through rate",
  metrics: {
    sellThroughRate: 0.85,
    medianDaysOnShelf: 7,
    sampleSize: 25,
    discountFrequency: 0.1,
    priceRatio: 1.05,
  },
  timestamp: "2024-01-16T10:00:00Z",
};

const mockFirstPageResult: AdjustmentListResult = {
  success: true,
  data: {
    adjustments: [mockAdjustment],
    nextCursor: "cursor-page-2",
    hasMore: true,
  },
};

const mockSecondPageResult: AdjustmentListResult = {
  success: true,
  data: {
    adjustments: [mockSecondAdjustment],
    nextCursor: null,
    hasMore: false,
  },
};

describe("useAdjustments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the first page on mount", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockResolvedValue(mockFirstPageResult);

    const filters: AdjustmentFilters = {};
    const { result } = renderHook(() => useAdjustments({ filters }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedFetch).toHaveBeenCalledWith(
      { filters: {}, pageSize: 20, cursor: undefined },
      expect.any(AbortSignal),
    );
    expect(result.current.adjustments).toEqual([mockAdjustment]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("shows loading state during fetch", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockReturnValue(new Promise(() => {}));

    const filters: AdjustmentFilters = {};
    const { result } = renderHook(() => useAdjustments({ filters }));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.adjustments).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("sets error state on network failure", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockResolvedValue({ success: false, error: "network" });

    const filters: AdjustmentFilters = {};
    const { result } = renderHook(() => useAdjustments({ filters }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(
      "Network error — check your connection",
    );
    expect(result.current.adjustments).toEqual([]);
  });

  it("sets error state on timeout", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockResolvedValue({ success: false, error: "timeout" });

    const filters: AdjustmentFilters = {};
    const { result } = renderHook(() => useAdjustments({ filters }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Request timed out");
  });

  it("sets error state on server error", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockResolvedValue({ success: false, error: "server" });

    const filters: AdjustmentFilters = {};
    const { result } = renderHook(() => useAdjustments({ filters }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Unable to load adjustments");
  });

  it("loadMore appends next page results", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockResolvedValueOnce(mockFirstPageResult);

    const filters: AdjustmentFilters = {};
    const { result } = renderHook(() => useAdjustments({ filters }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.adjustments).toEqual([mockAdjustment]);

    mockedFetch.mockResolvedValueOnce(mockSecondPageResult);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedFetch).toHaveBeenLastCalledWith(
      { filters: {}, pageSize: 20, cursor: "cursor-page-2" },
      expect.any(AbortSignal),
    );
    expect(result.current.adjustments).toEqual([
      mockAdjustment,
      mockSecondAdjustment,
    ]);
    expect(result.current.hasMore).toBe(false);
  });

  it("loadMore does nothing when there are no more pages", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockResolvedValueOnce(mockSecondPageResult);

    const filters: AdjustmentFilters = {};
    const { result } = renderHook(() => useAdjustments({ filters }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callCount = mockedFetch.mock.calls.length;

    act(() => {
      result.current.loadMore();
    });

    expect(mockedFetch.mock.calls.length).toBe(callCount);
  });

  it("loadMore does nothing while loading", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockReturnValue(new Promise(() => {}));

    const filters: AdjustmentFilters = {};
    const { result } = renderHook(() => useAdjustments({ filters }));

    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    // Only the initial fetch should have been called
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("refresh resets and refetches from the beginning", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockResolvedValueOnce(mockFirstPageResult);

    const filters: AdjustmentFilters = {};
    const { result } = renderHook(() => useAdjustments({ filters }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Load more to have 2 pages of data
    mockedFetch.mockResolvedValueOnce(mockSecondPageResult);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.adjustments).toHaveLength(2);

    // Now refresh
    mockedFetch.mockResolvedValueOnce(mockFirstPageResult);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have reset to first page only
    expect(result.current.adjustments).toEqual([mockAdjustment]);
    expect(result.current.hasMore).toBe(true);
  });

  it("refetches when filters change", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockResolvedValue(mockFirstPageResult);

    const initialFilters: AdjustmentFilters = {};
    const { result, rerender } = renderHook(
      ({ filters }) => useAdjustments({ filters }),
      { initialProps: { filters: initialFilters } },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const newFilters: AdjustmentFilters = { direction: "decrease" };
    mockedFetch.mockResolvedValueOnce(mockSecondPageResult);

    rerender({ filters: newFilters });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedFetch).toHaveBeenLastCalledWith(
      { filters: newFilters, pageSize: 20, cursor: undefined },
      expect.any(AbortSignal),
    );
  });

  it("uses custom page size", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);
    mockedFetch.mockResolvedValue(mockFirstPageResult);

    const filters: AdjustmentFilters = {};
    const { result } = renderHook(() =>
      useAdjustments({ filters, pageSize: 50 }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedFetch).toHaveBeenCalledWith(
      { filters: {}, pageSize: 50, cursor: undefined },
      expect.any(AbortSignal),
    );
  });

  it("cancels in-flight request on unmount", async () => {
    const { fetchAdjustments } = await import("./pricing-api");
    const mockedFetch = vi.mocked(fetchAdjustments);

    const capturedSignals: AbortSignal[] = [];
    mockedFetch.mockImplementation((_params, signal) => {
      if (signal) {
        capturedSignals.push(signal);
      }
      return new Promise(() => {});
    });

    const filters: AdjustmentFilters = {};
    const { unmount } = renderHook(() => useAdjustments({ filters }));

    await waitFor(() => {
      expect(capturedSignals.length).toBe(1);
    });

    unmount();

    expect(capturedSignals[0].aborted).toBe(true);
  });
});
