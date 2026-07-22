import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePaginatedAccounts } from "./use-paginated-accounts";
import type { Account, CursorPaginatedResponse } from "./accounts-types";

vi.mock("./accounts-api");

const mockAccount: Account = {
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  accountNumber: 42,
  name: "Jane Smith",
  street: "123 Main St",
  place: "Zurich",
  postcode: "8000",
  canton: "ZH",
  email: "jane@example.com",
  telephone: "555-0100",
  commentCount: 3,
  tags: ["vip"],
};

const mockSecondAccount: Account = {
  uuid: "660e8400-e29b-41d4-a716-446655440001",
  accountNumber: 43,
  name: "John Doe",
  street: "456 Oak St",
  place: "Bern",
  postcode: "3000",
  canton: "BE",
  email: "john@example.com",
  telephone: "555-0200",
  commentCount: 1,
  tags: [],
};

const mockFirstPageResponse: CursorPaginatedResponse = {
  accounts: [mockAccount],
  nextCursor: "cursor-page-2",
  hasMore: true,
};

const mockSecondPageResponse: CursorPaginatedResponse = {
  accounts: [mockSecondAccount],
  nextCursor: null,
  hasMore: false,
};

describe("usePaginatedAccounts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the first page on mount with default page size", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);
    mockedFetch.mockResolvedValue(mockFirstPageResponse);

    const { result } = renderHook(() => usePaginatedAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockedFetch).toHaveBeenCalledWith(
      { pageSize: 20, cursor: undefined },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.accounts).toEqual([mockAccount]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.hasPrevious).toBe(false);
    expect(result.current.pageSize).toBe(20);
    expect(result.current.error).toBeNull();
  });

  it("shows loading state during fetch", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);
    mockedFetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePaginatedAccounts());

    expect(result.current.loading).toBe(true);
    expect(result.current.accounts).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("sets error state on fetch failure and allows retry", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);
    mockedFetch.mockRejectedValueOnce(new Error("Server error"));

    const { result } = renderHook(() => usePaginatedAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Server error");
    expect(result.current.accounts).toEqual([]);

    mockedFetch.mockResolvedValueOnce(mockFirstPageResponse);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.accounts).toEqual([mockAccount]);
  });

  it("goNext fetches the next page using nextCursor", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);
    mockedFetch.mockResolvedValueOnce(mockFirstPageResponse);

    const { result } = renderHook(() => usePaginatedAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockedFetch.mockResolvedValueOnce(mockSecondPageResponse);

    act(() => {
      result.current.goNext();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockedFetch).toHaveBeenLastCalledWith(
      { pageSize: 20, cursor: "cursor-page-2" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.accounts).toEqual([mockSecondAccount]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.hasPrevious).toBe(true);
  });

  it("goNext uses cached page when available (no API call)", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);
    mockedFetch.mockResolvedValueOnce(mockFirstPageResponse);

    const { result } = renderHook(() => usePaginatedAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockedFetch.mockResolvedValueOnce(mockSecondPageResponse);

    act(() => {
      result.current.goNext();
    });

    await waitFor(() => {
      expect(result.current.accounts).toEqual([mockSecondAccount]);
    });

    // Go back
    act(() => {
      result.current.goPrevious();
    });

    expect(result.current.accounts).toEqual([mockAccount]);

    const callCountBeforeGoNext = mockedFetch.mock.calls.length;

    // Go forward again — should use cache
    act(() => {
      result.current.goNext();
    });

    expect(mockedFetch.mock.calls.length).toBe(callCountBeforeGoNext);
    expect(result.current.accounts).toEqual([mockSecondAccount]);
  });

  it("goPrevious navigates to cached previous page without API call", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);
    mockedFetch.mockResolvedValueOnce(mockFirstPageResponse);

    const { result } = renderHook(() => usePaginatedAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockedFetch.mockResolvedValueOnce(mockSecondPageResponse);

    act(() => {
      result.current.goNext();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const callCountBeforeGoPrevious = mockedFetch.mock.calls.length;

    act(() => {
      result.current.goPrevious();
    });

    expect(mockedFetch.mock.calls.length).toBe(callCountBeforeGoPrevious);
    expect(result.current.accounts).toEqual([mockAccount]);
    expect(result.current.hasPrevious).toBe(false);
  });

  it("goPrevious does nothing on first page", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);
    mockedFetch.mockResolvedValueOnce(mockFirstPageResponse);

    const { result } = renderHook(() => usePaginatedAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.goPrevious();
    });

    expect(result.current.accounts).toEqual([mockAccount]);
    expect(result.current.hasPrevious).toBe(false);
  });

  it("setPageSize clears cache and fetches first page with new size", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);
    mockedFetch.mockResolvedValueOnce(mockFirstPageResponse);

    const { result } = renderHook(() => usePaginatedAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockedFetch.mockResolvedValueOnce({
      accounts: [mockAccount, mockSecondAccount],
      nextCursor: null,
      hasMore: false,
    });

    act(() => {
      result.current.setPageSize(50);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockedFetch).toHaveBeenLastCalledWith(
      { pageSize: 50, cursor: undefined },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.pageSize).toBe(50);
    expect(result.current.hasPrevious).toBe(false);
  });

  it("cancels in-flight request when new request is made", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);

    const capturedSignals: AbortSignal[] = [];
    mockedFetch.mockImplementation((_params, options) => {
      if (options?.signal) {
        capturedSignals.push(options.signal);
      }
      return new Promise(() => {});
    });

    const { result } = renderHook(() => usePaginatedAccounts());

    await waitFor(() => {
      expect(capturedSignals.length).toBe(1);
    });

    act(() => {
      result.current.setPageSize(50);
    });

    await waitFor(() => {
      expect(capturedSignals.length).toBe(2);
    });

    expect(capturedSignals[0].aborted).toBe(true);
    expect(capturedSignals[1].aborted).toBe(false);
  });

  it("hasMore is true when current page has a nextCursor", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);
    mockedFetch.mockResolvedValueOnce(mockFirstPageResponse);

    const { result } = renderHook(() => usePaginatedAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(true);
  });

  it("hasMore is false when current page has no nextCursor and no cached pages ahead", async () => {
    const { fetchCursorPaginatedAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchCursorPaginatedAccounts);
    mockedFetch.mockResolvedValueOnce({
      accounts: [mockAccount],
      nextCursor: null,
      hasMore: false,
    });

    const { result } = renderHook(() => usePaginatedAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);
  });
});
