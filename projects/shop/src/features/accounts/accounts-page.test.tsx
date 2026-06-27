import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { AccountsPage } from "./accounts-page";

vi.mock("./accounts-api", () => ({
  fetchAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
  fetchNextAccountNumber: vi.fn().mockResolvedValue(1),
  createAccount: vi.fn().mockResolvedValue({
    success: true,
    account: {
      uuid: "test-uuid",
      shopUid: 1,
      name: "Test",
      address: "",
      telephone: "",
      commentCount: 0,
      tags: [],
    },
  }),
}));

describe("AccountsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Accounts' heading", () => {
    render(<AccountsPage />);

    expect(
      screen.getByRole("heading", { name: /accounts/i }),
    ).toBeInTheDocument();
  });

  it("renders 'Add Account' button", () => {
    render(<AccountsPage />);

    expect(
      screen.getByRole("button", { name: /add account/i }),
    ).toBeInTheDocument();
  });

  it("clicking 'Add Account' opens the AccountForm dialog", async () => {
    render(<AccountsPage />);

    const addButton = screen.getByRole("button", { name: /add account/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("AccountForm onClose closes the modal", async () => {
    render(<AccountsPage />);

    // Open modal
    const addButton = screen.getByRole("button", { name: /add account/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Close via Cancel button
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("AccountForm onSuccess refreshes accounts and closes modal", async () => {
    const { fetchAccounts, createAccount } = await import("./accounts-api");

    render(<AccountsPage />);

    // Open modal
    const addButton = screen.getByRole("button", { name: /add account/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Fill name and submit
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: "New Account" } });

    const form = screen.getByRole("dialog").querySelector("form")!;
    fireEvent.submit(form);

    // After success: modal closes and fetchAccounts is called again (refresh)
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(createAccount).toHaveBeenCalled();
    // Initial load + refresh after success
    expect(vi.mocked(fetchAccounts).mock.calls.length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("after modal close, focus returns to 'Add Account' button", async () => {
    render(<AccountsPage />);

    const addButton = screen.getByRole("button", { name: /add account/i });
    const focusSpy = vi.spyOn(addButton, "focus");

    // Open modal
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Close via Cancel button
    const cancelButton = screen.getByRole("button", { name: /cancel/i });

    await act(async () => {
      fireEvent.click(cancelButton);
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Verify focus() was called on the Add Account button via the ref
    expect(focusSpy).toHaveBeenCalled();

    focusSpy.mockRestore();
  });
});
