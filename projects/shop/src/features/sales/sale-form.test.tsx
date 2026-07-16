import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { SaleForm } from "./sale-form";
import type { CreateSaleResult } from "./sales-types";

vi.mock("./sales-api");

const mockOnClose = vi.fn();
const mockOnSuccess = vi.fn();

function renderForm(props: Partial<Parameters<typeof SaleForm>[0]> = {}): void {
  render(
    <SaleForm
      open={true}
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
      mode="create"
      {...props}
    />,
  );
}

describe("SaleForm", () => {
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
      expect(screen.queryByText("Create Sale")).not.toBeInTheDocument();
    });

    it("renders dialog when open=true in create mode", () => {
      renderForm({ open: true, mode: "create" });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Create Sale" }),
      ).toBeInTheDocument();
    });

    it("renders dialog when open=true in edit mode", () => {
      renderForm({
        open: true,
        mode: "edit",
        sale: {
          uuid: "sale-1",
          number: 1,
          status: "open",
          cashierId: "emp-1",
          subtotal: 1000,
          total: 1000,
          storePortion: 500,
          consignorPortion: 500,
          change: 0,
          createdAt: "2024-01-01T00:00:00Z",
        },
      });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Edit Sale")).toBeInTheDocument();
    });
  });

  describe("field presence", () => {
    it("renders cashier and memo fields in create mode", () => {
      renderForm({ mode: "create" });

      expect(screen.getByLabelText(/cashier/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/memo/i)).toBeInTheDocument();
    });

    it("does not render status field in create mode", () => {
      renderForm({ mode: "create" });

      expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
    });

    it("renders status field in edit mode", () => {
      renderForm({
        mode: "edit",
        sale: {
          uuid: "sale-1",
          number: 1,
          status: "open",
          cashierId: "emp-1",
          subtotal: 1000,
          total: 1000,
          storePortion: 500,
          consignorPortion: 500,
          change: 0,
          createdAt: "2024-01-01T00:00:00Z",
        },
      });

      expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    });

    it("all fields have associated labels via htmlFor/id pairing", () => {
      renderForm();

      const cashierInput = screen.getByLabelText(/cashier/i);
      const memoInput = screen.getByLabelText(/memo/i);

      expect(cashierInput).toHaveAttribute("id", "cashier-id");
      expect(memoInput).toHaveAttribute("id", "memo");
    });
  });

  describe("required indicators", () => {
    it("cashier field has a required indicator (asterisk *)", () => {
      renderForm();

      const cashierLabel = screen.getByText(/cashier/i, { selector: "label" });
      expect(cashierLabel.textContent).toContain("*");
    });
  });

  describe("edit mode pre-fill", () => {
    it("pre-fills fields from sale prop in edit mode", () => {
      renderForm({
        mode: "edit",
        sale: {
          uuid: "sale-1",
          number: 1,
          status: "open",
          cashierId: "emp-123",
          subtotal: 1000,
          total: 1000,
          storePortion: 500,
          consignorPortion: 500,
          change: 0,
          memo: "Test memo",
          createdAt: "2024-01-01T00:00:00Z",
        },
      });

      expect(screen.getByLabelText(/cashier/i)).toHaveValue("emp-123");
      expect(screen.getByLabelText(/memo/i)).toHaveValue("Test memo");
    });
  });

  describe("validation errors", () => {
    it("shows validation error for cashier when submitting empty form", () => {
      renderForm();

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      expect(screen.getByText(/cashier is required/i)).toBeInTheDocument();
    });

    it("marks cashier input as aria-invalid on validation error", () => {
      renderForm();

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      const cashierInput = screen.getByLabelText(/cashier/i);
      expect(cashierInput).toHaveAttribute("aria-invalid", "true");
    });

    it("error messages have role=alert", () => {
      renderForm();

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      const errorElement = document.getElementById("cashier-id-error");
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveAttribute("role", "alert");
    });
  });

  describe("submission disabling", () => {
    it("disables all inputs and submit button during submission", async () => {
      const { createSale } = await import("./sales-api");
      let resolvePromise: (value: CreateSaleResult) => void;
      const pendingPromise = new Promise<CreateSaleResult>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(createSale).mockReturnValue(pendingPromise);

      vi.useRealTimers();
      renderForm();

      const cashierInput = screen.getByLabelText(/cashier/i);
      fireEvent.change(cashierInput, { target: { value: "emp-1" } });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByLabelText(/cashier/i)).toBeDisabled();
      });
      expect(screen.getByLabelText(/memo/i)).toBeDisabled();
      expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();

      // Clean up
      await act(async () => {
        resolvePromise!({
          success: true,
          sale: {
            uuid: "1",
            number: 1,
            status: "open",
            cashierId: "emp-1",
            subtotal: 0,
            total: 0,
            storePortion: 0,
            consignorPortion: 0,
            change: 0,
            createdAt: "2024-01-01T00:00:00Z",
          },
        });
      });
    });
  });

  describe("error message display", () => {
    it("shows network error message", async () => {
      const { createSale } = await import("./sales-api");
      vi.mocked(createSale).mockResolvedValue({
        success: false,
        error: "network",
      });

      vi.useRealTimers();
      renderForm();

      const cashierInput = screen.getByLabelText(/cashier/i);
      fireEvent.change(cashierInput, { target: { value: "emp-1" } });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(
          screen.getByText(
            "Connection failed. Check your internet connection.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("shows timeout error message", async () => {
      const { createSale } = await import("./sales-api");
      vi.mocked(createSale).mockResolvedValue({
        success: false,
        error: "timeout",
      });

      vi.useRealTimers();
      renderForm();

      const cashierInput = screen.getByLabelText(/cashier/i);
      fireEvent.change(cashierInput, { target: { value: "emp-1" } });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(
          screen.getByText("Request timed out. Please try again."),
        ).toBeInTheDocument();
      });
    });

    it("shows server error message", async () => {
      const { createSale } = await import("./sales-api");
      vi.mocked(createSale).mockResolvedValue({
        success: false,
        error: "server",
      });

      vi.useRealTimers();
      renderForm();

      const cashierInput = screen.getByLabelText(/cashier/i);
      fireEvent.change(cashierInput, { target: { value: "emp-1" } });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(
          screen.getByText("An unexpected error occurred. Please try again."),
        ).toBeInTheDocument();
      });
    });
  });

  describe("edit mode error messages", () => {
    it("shows invalid_transition error in edit mode", async () => {
      const { updateSale } = await import("./sales-api");
      vi.mocked(updateSale).mockResolvedValue({
        success: false,
        error: "invalid_transition",
      });

      vi.useRealTimers();
      renderForm({
        mode: "edit",
        sale: {
          uuid: "sale-1",
          number: 1,
          status: "open",
          cashierId: "emp-1",
          subtotal: 1000,
          total: 1000,
          storePortion: 500,
          consignorPortion: 500,
          change: 0,
          createdAt: "2024-01-01T00:00:00Z",
        },
      });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(
          screen.getByText("Cannot change sale status. Invalid transition."),
        ).toBeInTheDocument();
      });
    });

    it("shows not_found error in edit mode", async () => {
      const { updateSale } = await import("./sales-api");
      vi.mocked(updateSale).mockResolvedValue({
        success: false,
        error: "not_found",
      });

      vi.useRealTimers();
      renderForm({
        mode: "edit",
        sale: {
          uuid: "sale-1",
          number: 1,
          status: "open",
          cashierId: "emp-1",
          subtotal: 1000,
          total: 1000,
          storePortion: 500,
          consignorPortion: 500,
          change: 0,
          createdAt: "2024-01-01T00:00:00Z",
        },
      });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(
          screen.getByText("Sale not found. It may have been deleted."),
        ).toBeInTheDocument();
      });
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
    it("calls onSuccess when sale creation succeeds", async () => {
      const { createSale } = await import("./sales-api");
      vi.mocked(createSale).mockResolvedValue({
        success: true,
        sale: {
          uuid: "sale-1",
          number: 1,
          status: "open",
          cashierId: "emp-1",
          subtotal: 0,
          total: 0,
          storePortion: 0,
          consignorPortion: 0,
          change: 0,
          createdAt: "2024-01-01T00:00:00Z",
        },
      });

      vi.useRealTimers();
      renderForm();

      const cashierInput = screen.getByLabelText(/cashier/i);
      fireEvent.change(cashierInput, { target: { value: "emp-1" } });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it("calls onSuccess when sale update succeeds", async () => {
      const { updateSale } = await import("./sales-api");
      vi.mocked(updateSale).mockResolvedValue({
        success: true,
        sale: {
          uuid: "sale-1",
          number: 1,
          status: "finalized",
          cashierId: "emp-1",
          subtotal: 1000,
          total: 1000,
          storePortion: 500,
          consignorPortion: 500,
          change: 0,
          createdAt: "2024-01-01T00:00:00Z",
        },
      });

      vi.useRealTimers();
      renderForm({
        mode: "edit",
        sale: {
          uuid: "sale-1",
          number: 1,
          status: "open",
          cashierId: "emp-1",
          subtotal: 1000,
          total: 1000,
          storePortion: 500,
          consignorPortion: 500,
          change: 0,
          createdAt: "2024-01-01T00:00:00Z",
        },
      });

      const form = screen.getByRole("dialog").querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("focus management", () => {
    it("moves focus to cashier input on open within 100ms", () => {
      renderForm({ open: true });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByLabelText(/cashier/i)).toHaveFocus();
    });
  });

  describe("error recovery", () => {
    it("preserves form values and re-enables inputs after error", async () => {
      const { createSale } = await import("./sales-api");
      vi.mocked(createSale).mockResolvedValue({
        success: false,
        error: "network",
      });

      vi.useRealTimers();
      renderForm();

      const cashierInput = screen.getByLabelText(/cashier/i);
      const memoInput = screen.getByLabelText(/memo/i);

      fireEvent.change(cashierInput, { target: { value: "emp-1" } });
      fireEvent.change(memoInput, { target: { value: "Test memo" } });

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
      expect(screen.getByLabelText(/cashier/i)).toHaveValue("emp-1");
      expect(screen.getByLabelText(/memo/i)).toHaveValue("Test memo");

      // Inputs re-enabled
      expect(screen.getByLabelText(/cashier/i)).not.toBeDisabled();
      expect(screen.getByLabelText(/memo/i)).not.toBeDisabled();
      expect(
        screen.getByRole("button", { name: /create sale/i }),
      ).not.toBeDisabled();
    });
  });
});
