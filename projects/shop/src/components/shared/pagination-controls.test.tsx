import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaginationControls } from "./pagination-controls";
import type { PaginationControlsProps } from "./pagination-controls";

function renderPaginationControls(
  overrides: Partial<PaginationControlsProps> = {},
): void {
  const defaultProps: PaginationControlsProps = {
    hasPrevious: false,
    hasMore: true,
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    pageSize: 20,
    onPageSizeChange: vi.fn(),
    ...overrides,
  };

  render(<PaginationControls {...defaultProps} />);
}

describe("PaginationControls", () => {
  describe("button disabled states", () => {
    it("disables Previous button when hasPrevious is false", () => {
      renderPaginationControls({ hasPrevious: false });

      const previousButton = screen.getByRole("button", {
        name: /go to previous page/i,
      });
      expect(previousButton).toBeDisabled();
    });

    it("enables Previous button when hasPrevious is true", () => {
      renderPaginationControls({ hasPrevious: true });

      const previousButton = screen.getByRole("button", {
        name: /go to previous page/i,
      });
      expect(previousButton).not.toBeDisabled();
    });

    it("disables Next button when hasMore is false", () => {
      renderPaginationControls({ hasMore: false });

      const nextButton = screen.getByRole("button", {
        name: /go to next page/i,
      });
      expect(nextButton).toBeDisabled();
    });

    it("enables Next button when hasMore is true", () => {
      renderPaginationControls({ hasMore: true });

      const nextButton = screen.getByRole("button", {
        name: /go to next page/i,
      });
      expect(nextButton).not.toBeDisabled();
    });

    it("disables both buttons when disabled prop is true", () => {
      renderPaginationControls({
        hasPrevious: true,
        hasMore: true,
        disabled: true,
      });

      const previousButton = screen.getByRole("button", {
        name: /go to previous page/i,
      });
      const nextButton = screen.getByRole("button", {
        name: /go to next page/i,
      });

      expect(previousButton).toBeDisabled();
      expect(nextButton).toBeDisabled();
    });
  });

  describe("page size selector", () => {
    it("renders options for 20, 50, and 100", () => {
      renderPaginationControls();

      const select = screen.getByLabelText(/rows per page/i);
      const options = select.querySelectorAll("option");

      expect(options).toHaveLength(3);
      expect(options[0]).toHaveValue("20");
      expect(options[1]).toHaveValue("50");
      expect(options[2]).toHaveValue("100");
    });

    it("displays the current pageSize as selected", () => {
      renderPaginationControls({ pageSize: 50 });

      const select = screen.getByLabelText(
        /rows per page/i,
      ) as HTMLSelectElement;
      expect(select.value).toBe("50");
    });

    it("calls onPageSizeChange with new value when changed", () => {
      const onPageSizeChange = vi.fn();
      renderPaginationControls({ onPageSizeChange });

      const select = screen.getByLabelText(/rows per page/i);
      fireEvent.change(select, { target: { value: "100" } });

      expect(onPageSizeChange).toHaveBeenCalledWith(100);
    });

    it("disables the page size selector when disabled prop is true", () => {
      renderPaginationControls({ disabled: true });

      const select = screen.getByLabelText(/rows per page/i);
      expect(select).toBeDisabled();
    });
  });

  describe("callbacks", () => {
    it("calls onPrevious when Previous button is clicked", () => {
      const onPrevious = vi.fn();
      renderPaginationControls({ hasPrevious: true, onPrevious });

      const previousButton = screen.getByRole("button", {
        name: /go to previous page/i,
      });
      fireEvent.click(previousButton);

      expect(onPrevious).toHaveBeenCalledTimes(1);
    });

    it("calls onNext when Next button is clicked", () => {
      const onNext = vi.fn();
      renderPaginationControls({ hasMore: true, onNext });

      const nextButton = screen.getByRole("button", {
        name: /go to next page/i,
      });
      fireEvent.click(nextButton);

      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it("does not call onPrevious when hasPrevious is false", () => {
      const onPrevious = vi.fn();
      renderPaginationControls({ hasPrevious: false, onPrevious });

      const previousButton = screen.getByRole("button", {
        name: /go to previous page/i,
      });
      fireEvent.click(previousButton);

      expect(onPrevious).not.toHaveBeenCalled();
    });

    it("does not call onNext when hasMore is false", () => {
      const onNext = vi.fn();
      renderPaginationControls({ hasMore: false, onNext });

      const nextButton = screen.getByRole("button", {
        name: /go to next page/i,
      });
      fireEvent.click(nextButton);

      expect(onNext).not.toHaveBeenCalled();
    });
  });
});
