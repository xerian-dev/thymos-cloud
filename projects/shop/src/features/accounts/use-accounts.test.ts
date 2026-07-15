import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAccounts } from "./use-accounts";
import type { AccountsApiResponse } from "./accounts-api";
import type { Account } from "./accounts-types";

vi.mock("./accounts-api");

const mockAccount: Account = {
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  shopUid: 42,
  name: "Jane Smith",
  street: "123 Main St",
  telephone: "555-0100",
  commentCount: 3,
  tags: ["vip", "wholesale"],
};

describe("useAccounts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts in loading state with empty accounts and no error", async () => {
    const { fetchAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchAccounts);
    mockedFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useAccounts());

    expect(result.current.loading).toBe(true);
    expect(result.current.accounts).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("returns accounts and clears loading on successful fetch", async () => {
    const { fetchAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchAccounts);
    const response: AccountsApiResponse = { accounts: [mockAccount] };
    mockedFetch.mockResolvedValue(response);

    const { result } = renderHook(() => useAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.accounts).toEqual([mockAccount]);
    expect(result.current.error).toBeNull();
  });

  it("sets error message and clears accounts on failed fetch", async () => {
    const { fetchAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchAccounts);
    mockedFetch.mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.accounts).toEqual([]);
    expect(result.current.error).toBe(
      "Unable to load accounts. Please try again.",
    );
  });

  it("refresh re-fetches accounts and transitions through loading state", async () => {
    const { fetchAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchAccounts);

    const firstResponse: AccountsApiResponse = { accounts: [mockAccount] };
    const updatedAccount: Account = {
      ...mockAccount,
      name: "Updated Name",
    };
    const secondResponse: AccountsApiResponse = {
      accounts: [mockAccount, updatedAccount],
    };

    mockedFetch.mockResolvedValueOnce(firstResponse);

    const { result } = renderHook(() => useAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.accounts).toEqual([mockAccount]);

    mockedFetch.mockResolvedValueOnce(secondResponse);

    act(() => {
      result.current.refresh();
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.accounts).toEqual([mockAccount, updatedAccount]);
    expect(result.current.error).toBeNull();
  });

  it("refresh clears previous error on successful re-fetch", async () => {
    const { fetchAccounts } = await import("./accounts-api");
    const mockedFetch = vi.mocked(fetchAccounts);

    mockedFetch.mockRejectedValueOnce(new Error("Network failure"));

    const { result } = renderHook(() => useAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(
      "Unable to load accounts. Please try again.",
    );

    const response: AccountsApiResponse = { accounts: [mockAccount] };
    mockedFetch.mockResolvedValueOnce(response);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.accounts).toEqual([mockAccount]);
    expect(result.current.error).toBeNull();
  });
});
