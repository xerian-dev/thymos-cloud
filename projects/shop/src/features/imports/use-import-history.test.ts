import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useImportHistory } from "./use-import-history";
import type { ImportHistoryResponse } from "./imports-types";

vi.mock("./imports-api", () => ({
  fetchImportHistory: vi.fn(),
}));

import { fetchImportHistory } from "./imports-api";

const mockFetchImportHistory = vi.mocked(fetchImportHistory);

function makeResponse(
  overrides: Partial<ImportHistoryResponse> = {},
): ImportHistoryResponse {
  return {
    jobs: [
      {
        jobId: "job-1",
        state: "complete",
        phase: "sync",
        startedAt: "2024-01-15T10:00:00Z",
        lastUpdatedAt: "2024-01-15T10:45:00Z",
        progress: { processed: 100, imported: 80, skipped: 10, failed: 10 },
      },
    ],
    ...overrides,
  };
}

describe("useImportHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchImportHistory.mockResolvedValue(makeResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("starts collapsed with empty jobs", () => {
      const { result } = renderHook(() => useImportHistory("items"));

      expect(result.current.expanded).toBe(false);
      expect(result.current.jobs).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.hasMore).toBe(false);
      expect(result.current.hasPrevious).toBe(false);
      expect(result.current.pageSize).toBe(20);
    });

    it("does not fetch on mount", () => {
      renderHook(() => useImportHistory("items"));
      expect(mockFetchImportHistory).not.toHaveBeenCalled();
    });
  });

  describe("toggle", () => {
    it("expands and fetches first page on toggle", async () => {
      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      expect(result.current.expanded).toBe(true);
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetchImportHistory).toHaveBeenCalledWith(
        { type: "items", pageSize: 20, nextToken: undefined },
        { signal: expect.any(AbortSignal) },
      );
      expect(result.current.jobs).toHaveLength(1);
      expect(result.current.jobs[0].jobId).toBe("job-1");
    });

    it("collapses and clears state on second toggle", async () => {
      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.toggle();
      });

      expect(result.current.expanded).toBe(false);
      expect(result.current.jobs).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.hasMore).toBe(false);
      expect(result.current.hasPrevious).toBe(false);
    });

    it("aborts in-flight request on collapse", async () => {
      let resolveRequest: ((value: ImportHistoryResponse) => void) | null =
        null;
      mockFetchImportHistory.mockImplementation(
        (_params, options) =>
          new Promise((resolve, reject) => {
            resolveRequest = resolve;
            options?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      );

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      expect(result.current.loading).toBe(true);
      expect(resolveRequest).not.toBeNull();

      // Collapse while still loading
      act(() => {
        result.current.toggle();
      });

      expect(result.current.expanded).toBe(false);
      expect(result.current.loading).toBe(false);
      expect(result.current.jobs).toEqual([]);
    });
  });

  describe("pagination", () => {
    it("sets hasMore when nextToken is present", async () => {
      mockFetchImportHistory.mockResolvedValue(
        makeResponse({ nextToken: "token-1" }),
      );

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);
    });

    it("goNext fetches next page using nextToken", async () => {
      mockFetchImportHistory.mockResolvedValueOnce(
        makeResponse({ nextToken: "token-1" }),
      );

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetchImportHistory.mockResolvedValueOnce(
        makeResponse({
          jobs: [
            {
              jobId: "job-2",
              state: "failed",
              phase: "fetch",
              startedAt: "2024-01-14T08:00:00Z",
              lastUpdatedAt: "2024-01-14T08:02:30Z",
              progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
            },
          ],
        }),
      );

      act(() => {
        result.current.goNext();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetchImportHistory).toHaveBeenLastCalledWith(
        { type: "items", pageSize: 20, nextToken: "token-1" },
        { signal: expect.any(AbortSignal) },
      );
      expect(result.current.jobs[0].jobId).toBe("job-2");
      expect(result.current.hasPrevious).toBe(true);
    });

    it("goPrevious navigates back using page stack", async () => {
      // First page
      mockFetchImportHistory.mockResolvedValueOnce(
        makeResponse({ nextToken: "token-1" }),
      );

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Go to second page
      mockFetchImportHistory.mockResolvedValueOnce(
        makeResponse({
          jobs: [
            {
              jobId: "job-2",
              state: "complete",
              phase: "sync",
              startedAt: "2024-01-14T08:00:00Z",
              lastUpdatedAt: "2024-01-14T08:02:30Z",
              progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
            },
          ],
          nextToken: "token-2",
        }),
      );

      act(() => {
        result.current.goNext();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Go back to first page
      mockFetchImportHistory.mockResolvedValueOnce(
        makeResponse({ nextToken: "token-1" }),
      );

      act(() => {
        result.current.goPrevious();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should fetch first page (no token)
      expect(mockFetchImportHistory).toHaveBeenLastCalledWith(
        { type: "items", pageSize: 20, nextToken: undefined },
        { signal: expect.any(AbortSignal) },
      );
    });

    it("goNext does nothing when hasMore is false", async () => {
      mockFetchImportHistory.mockResolvedValueOnce(makeResponse());

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = mockFetchImportHistory.mock.calls.length;

      act(() => {
        result.current.goNext();
      });

      // No additional fetch
      expect(mockFetchImportHistory).toHaveBeenCalledTimes(callCount);
    });

    it("goPrevious does nothing when stack is empty", async () => {
      mockFetchImportHistory.mockResolvedValueOnce(makeResponse());

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = mockFetchImportHistory.mock.calls.length;

      act(() => {
        result.current.goPrevious();
      });

      // No additional fetch
      expect(mockFetchImportHistory).toHaveBeenCalledTimes(callCount);
    });
  });

  describe("setPageSize", () => {
    it("changes page size and resets to first page", async () => {
      mockFetchImportHistory.mockResolvedValue(
        makeResponse({ nextToken: "token-1" }),
      );

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Go to next page to build up stack
      act(() => {
        result.current.goNext();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Change page size
      act(() => {
        result.current.setPageSize(50);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.pageSize).toBe(50);
      expect(result.current.hasPrevious).toBe(false);
      expect(mockFetchImportHistory).toHaveBeenLastCalledWith(
        { type: "items", pageSize: 50, nextToken: undefined },
        { signal: expect.any(AbortSignal) },
      );
    });

    it("does not fetch when collapsed", () => {
      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.setPageSize(100);
      });

      expect(result.current.pageSize).toBe(100);
      expect(mockFetchImportHistory).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("sets error on fetch failure", async () => {
      mockFetchImportHistory.mockRejectedValueOnce(
        new Error("Failed to fetch import history: 500"),
      );

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(
        "Failed to fetch import history: 500",
      );
      expect(result.current.jobs).toEqual([]);
    });

    it("sets generic error for non-Error exceptions", async () => {
      mockFetchImportHistory.mockRejectedValueOnce("unexpected");

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Unable to load import history");
    });

    it("retry re-fetches the current page", async () => {
      mockFetchImportHistory.mockRejectedValueOnce(
        new Error("Network error"),
      );

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");

      mockFetchImportHistory.mockResolvedValueOnce(makeResponse());

      act(() => {
        result.current.retry();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.jobs).toHaveLength(1);
    });

    it("clears error on successful fetch", async () => {
      mockFetchImportHistory.mockRejectedValueOnce(
        new Error("Temporary error"),
      );

      const { result } = renderHook(() => useImportHistory("items"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Temporary error");
      });

      mockFetchImportHistory.mockResolvedValueOnce(makeResponse());

      act(() => {
        result.current.retry();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("import type independence", () => {
    it("passes correct type to fetch", async () => {
      const { result } = renderHook(() => useImportHistory("sales"));

      act(() => {
        result.current.toggle();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetchImportHistory).toHaveBeenCalledWith(
        { type: "sales", pageSize: 20, nextToken: undefined },
        { signal: expect.any(AbortSignal) },
      );
    });
  });
});
