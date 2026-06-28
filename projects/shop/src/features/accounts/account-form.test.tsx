import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { AccountForm } from "./account-form";
import type { CreateAccountResult } from "./accounts-types";

vi.mock("./accounts-api");

const mockOnClose = vi.fn();
const mockOnSuccess = vi.fn();

function renderForm(
  props: Partial<Parameters<typeof AccountForm>[0]> = {},
): void {
  render(
    <AccountForm
      open={true}
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
      defaultAccountNumber={null}
      {...props}
    />,
  );
}

describe("AccountForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("modal open/close", () => {
    it("does not render dialog content when open=false", () => {
      renderForm({ open: false });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByText("Add Account")).not.toBeInTheDocument();
    });

    it("renders dialog when open=true", () => {
      renderForm({ open: true });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
  });

  describe("field presence", () => {
    it("renders all input fields", () => {
      renderForm();

      expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/street/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/place/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/postcode/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/canton/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/telephone/i)).toBeInTheDocument();
    });

    it("does not render an address input", () => {
      renderForm();

      expect(screen.queryByLabelText(/address/i)).not.toBeInTheDocument();
    });

    it("all fields have associated labels via htmlFor/id pairing", () => {
      renderForm();

      const accountNumberInput = screen.getByLabelText(/account number/i);
      const nameInput = screen.getByLabelText(/name/i);
      const streetInput = screen.getByLabelText(/street/i);
      const placeInput = screen.getByLabelText(/place/i);
      const postcodeInput = screen.getByLabelText(/postcode/i);
      const cantonInput = screen.getByLabelText(/canton/i);
      const emailInput = screen.getByLabelText(/email/i);
      const telephoneInput = screen.getByLabelText(/telephone/i);

      expect(accountNumberInput).toHaveAttribute("id", "account-number");
      expect(nameInput).toHaveAttribute("id", "name");
      expect(streetInput).toHaveAttribute("id", "street");
      expect(placeInput).toHaveAttribute("id", "place");
      expect(postcodeInput).toHaveAttribute("id", "postcode");
      expect(cantonInput).toHaveAttribute("id", "canton");
      expect(emailInput).toHaveAttribute("id", "email");
      expect(telephoneInput).toHaveAttribute("id", "telephone");
    });
  });

  describe("required indicators", () => {
    it("name field has a required indicator (asterisk *)", () => {
      renderForm();

      const nameLabel = screen.getByText(/name/i, { selector: "label" });
      expect(nameLabel.textContent).toContain("*");
    });
  });

  describe("defaultAccountNumber", () => {
    it("pre-fills account number field as zero-padded when defaultAccountNumber is provided", () => {
      renderForm({ defaultAccountNumber: 42 });

      const input = screen.getByLabelText(/account number/i);
      expect(input).toHaveValue("0000042");
    });

    it("leaves account number field empty when defaultAccountNumber is null", () => {
      renderForm({ defaultAccountNumber: null });

      const input = screen.getByLabelText(/account number/i);
      expect(input).toHaveValue("");
    });
  });

  describe("on-blur formatting", () => {
    it("formats account number as 7-digit zero-padded on blur", () => {
      renderForm();

      const input = screen.getByLabelText(/account number/i);
      fireEvent.change(input, { target: { value: "42" } });
      fireEvent.blur(input);

      expect(input).toHaveValue("0000042");
    });
  });

  describe("validation errors", () => {
    it("shows validation error for name when submitting with empty name", async () => {
      renderForm();

      const accountInput = screen.getByLabelText(/account number/i);
      fireEvent.change(accountInput, { target: { value: "42" } });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });

    it("shows validation error for invalid account number on submit", async () => {
      renderForm();

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "Test Account" } });

      // Leave account number empty and submit
      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      // Should show a validation error on the account number field
      const errorElement = document.getElementById("account-number-error");
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveAttribute("role", "alert");
    });
  });

  describe("submission disabling", () => {
    it("disables all inputs and submit button during submission", async () => {
      const { createAccount } = await import("./accounts-api");
      // Create a promise that never resolves to keep the form in submitting state
      let resolvePromise: (value: CreateAccountResult) => void;
      const pendingPromise = new Promise<CreateAccountResult>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(createAccount).mockReturnValue(pendingPromise);

      vi.useRealTimers();
      renderForm({ defaultAccountNumber: 42 });

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "Test Account" } });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      // During submission, all inputs and submit should be disabled
      await waitFor(() => {
        expect(screen.getByLabelText(/account number/i)).toBeDisabled();
      });
      expect(screen.getByLabelText(/name/i)).toBeDisabled();
      expect(screen.getByLabelText(/street/i)).toBeDisabled();
      expect(screen.getByLabelText(/place/i)).toBeDisabled();
      expect(screen.getByLabelText(/postcode/i)).toBeDisabled();
      expect(screen.getByLabelText(/canton/i)).toBeDisabled();
      expect(screen.getByLabelText(/email/i)).toBeDisabled();
      expect(screen.getByLabelText(/telephone/i)).toBeDisabled();
      expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();

      // Clean up
      await act(async () => {
        resolvePromise!({
          success: true,
          account: {
            uuid: "1",
            shopUid: 42,
            name: "Test",
            street: "",
            place: "",
            postcode: "",
            canton: "",
            email: "",
            telephone: "",
            commentCount: 0,
            tags: [],
          },
        });
      });
    });
  });

  describe("error message display", () => {
    async function submitFormWithError(
      errorType: "duplicate" | "network" | "server" | "timeout",
    ): Promise<void> {
      const { createAccount } = await import("./accounts-api");
      vi.mocked(createAccount).mockResolvedValue({
        success: false,
        error: errorType,
      });

      vi.useRealTimers();
      renderForm({ defaultAccountNumber: 42 });

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "Test Account" } });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);
    }

    it("shows 'Account number is already in use' on duplicate error", async () => {
      await submitFormWithError("duplicate");

      await waitFor(() => {
        expect(
          screen.getByText("Account number is already in use"),
        ).toBeInTheDocument();
      });
    });

    it("shows 'Connection failed. Check your internet connection.' on network error", async () => {
      await submitFormWithError("network");

      await waitFor(() => {
        expect(
          screen.getByText(
            "Connection failed. Check your internet connection.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("shows 'An unexpected error occurred. Please try again.' on server error", async () => {
      await submitFormWithError("server");

      await waitFor(() => {
        expect(
          screen.getByText("An unexpected error occurred. Please try again."),
        ).toBeInTheDocument();
      });
    });

    it("shows 'Request timed out. Please try again.' on timeout error", async () => {
      await submitFormWithError("timeout");

      await waitFor(() => {
        expect(
          screen.getByText("Request timed out. Please try again."),
        ).toBeInTheDocument();
      });
    });
  });

  describe("error recovery", () => {
    it("preserves form values and re-enables inputs after error", async () => {
      const { createAccount } = await import("./accounts-api");
      vi.mocked(createAccount).mockResolvedValue({
        success: false,
        error: "network",
      });

      vi.useRealTimers();
      renderForm({ defaultAccountNumber: 42 });

      const nameInput = screen.getByLabelText(/name/i);
      const streetInput = screen.getByLabelText(/street/i);
      const telephoneInput = screen.getByLabelText(/telephone/i);

      fireEvent.change(nameInput, { target: { value: "Test Account" } });
      fireEvent.change(streetInput, { target: { value: "123 Main St" } });
      fireEvent.change(telephoneInput, { target: { value: "555-0100" } });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(
          screen.getByText(
            "Connection failed. Check your internet connection.",
          ),
        ).toBeInTheDocument();
      });

      // Values preserved
      expect(screen.getByLabelText(/account number/i)).toHaveValue("0000042");
      expect(screen.getByLabelText(/name/i)).toHaveValue("Test Account");
      expect(screen.getByLabelText(/street/i)).toHaveValue("123 Main St");
      expect(screen.getByLabelText(/telephone/i)).toHaveValue("555-0100");

      // Inputs re-enabled
      expect(screen.getByLabelText(/account number/i)).not.toBeDisabled();
      expect(screen.getByLabelText(/name/i)).not.toBeDisabled();
      expect(screen.getByLabelText(/street/i)).not.toBeDisabled();
      expect(screen.getByLabelText(/telephone/i)).not.toBeDisabled();
      expect(
        screen.getByRole("button", { name: /create account/i }),
      ).not.toBeDisabled();
    });
  });

  describe("cancel button", () => {
    it("calls onClose when Cancel button is clicked", () => {
      renderForm();

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("success behavior", () => {
    it("calls onSuccess when account creation succeeds", async () => {
      const { createAccount } = await import("./accounts-api");
      vi.mocked(createAccount).mockResolvedValue({
        success: true,
        account: {
          uuid: "test-uuid",
          shopUid: 42,
          name: "Test Account",
          street: "",
          place: "",
          postcode: "",
          canton: "",
          email: "",
          telephone: "",
          commentCount: 0,
          tags: [],
        },
      });

      vi.useRealTimers();
      renderForm({ defaultAccountNumber: 42 });

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "Test Account" } });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("focus management", () => {
    it("moves focus to account number input on open within 100ms", () => {
      renderForm({ open: true });

      // Advance timers by 100ms to trigger the focus timeout
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByLabelText(/account number/i)).toHaveFocus();
    });
  });
});
