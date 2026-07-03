import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaginationControls } from "./pagination-controls";
import type { PageSize } from "./accounts-types";

interface RenderOptions {
  hasPrevious?: boolean;
  hasMore?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  pageSize?: PageSize;
  onPageSizeChange?: (pageSize: PageSize) => void;
  disabled?: boolean;
}

function renderControls(options: RenderOptions = {}): void {
  const {
    hasPrevious = false,
    hasMore = true,
    onNext = vi.fn(),
    onPrevious = vi.fn(),
    pageSize = 20,
    onPageSizeChange = vi.fn(),
    disabled = false,
  } = options;

  render(
    <PaginationControls
      hasPrevious={hasPrevious}
      hasMore={hasMore}
      onNext={onNext}
      onPrevious={onPrevious}
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      disabled={disabled}
    />,
  );
}

describe("PaginationControls", () => {
  describe("page size selector", () => {
    it("shows 20, 50, 100 options", () => {
      renderControls();

      const select = screen.getByLabelText("Rows per page");
      const options = select.querySelectorAll("option");

      expect(options).toHaveLength(3);
      expect(options[0]).toHaveValue("20");
      expect(options[1]).toHaveValue("50");
      expect(options[2]).toHaveValue("100");
    });

    it("reflects the current page size", () => {
      renderControls({ pageSize: 50 });

      const select = screen.getByLabelText(
        "Rows per page",
      ) as HTMLSelectElement;
      expect(select.value).toBe("50");
    });

    it("calls onPageSizeChange with selected value", () => {
      const onPageSizeChange = vi.fn();
      renderControls({ onPageSizeChange });

      const select = screen.getByLabelText("Rows per page");
      fireEvent.change(select, { target: { value: "100" } });

      expect(onPageSizeChange).toHaveBeenCalledWith(100);
    });
  });

  describe("Previous button (Req 4.4)", () => {
    it("disables Previous when hasPrevious is false", () => {
      renderControls({ hasPrevious: false });

      const prevButton = screen.getByRole("button", { name: /previous page/i });
      expect(prevButton).toBeDisabled();
      expect(prevButton).toHaveAttribute("aria-disabled", "true");
    });

    it("enables Previous when hasPrevious is true", () => {
      renderControls({ hasPrevious: true });

      const prevButton = screen.getByRole("button", { name: /previous page/i });
      expect(prevButton).not.toBeDisabled();
      expect(prevButton).toHaveAttribute("aria-disabled", "false");
    });

    it("calls onPrevious when clicked and hasPrevious is true", () => {
      const onPrevious = vi.fn();
      renderControls({ hasPrevious: true, onPrevious });

      const prevButton = screen.getByRole("button", { name: /previous page/i });
      fireEvent.click(prevButton);

      expect(onPrevious).toHaveBeenCalledOnce();
    });

    it("does not call onPrevious when disabled", () => {
      const onPrevious = vi.fn();
      renderControls({ hasPrevious: true, disabled: true, onPrevious });

      const prevButton = screen.getByRole("button", { name: /previous page/i });
      fireEvent.click(prevButton);

      expect(onPrevious).not.toHaveBeenCalled();
    });
  });

  describe("Next button (Req 4.3)", () => {
    it("disables Next when hasMore is false", () => {
      renderControls({ hasMore: false });

      const nextButton = screen.getByRole("button", { name: /next page/i });
      expect(nextButton).toBeDisabled();
      expect(nextButton).toHaveAttribute("aria-disabled", "true");
    });

    it("enables Next when hasMore is true", () => {
      renderControls({ hasMore: true });

      const nextButton = screen.getByRole("button", { name: /next page/i });
      expect(nextButton).not.toBeDisabled();
      expect(nextButton).toHaveAttribute("aria-disabled", "false");
    });

    it("calls onNext when clicked and hasMore is true", () => {
      const onNext = vi.fn();
      renderControls({ hasMore: true, onNext });

      const nextButton = screen.getByRole("button", { name: /next page/i });
      fireEvent.click(nextButton);

      expect(onNext).toHaveBeenCalledOnce();
    });

    it("does not call onNext when disabled", () => {
      const onNext = vi.fn();
      renderControls({ hasMore: true, disabled: true, onNext });

      const nextButton = screen.getByRole("button", { name: /next page/i });
      fireEvent.click(nextButton);

      expect(onNext).not.toHaveBeenCalled();
    });
  });

  describe("no Page X of Y display (Req 4.8)", () => {
    it("does not render page count text", () => {
      renderControls();

      expect(screen.queryByText(/page \d+ of \d+/i)).not.toBeInTheDocument();
    });

    it("does not render aria-current='page' element", () => {
      renderControls();

      const pageElement = document.querySelector("[aria-current='page']");
      expect(pageElement).toBeNull();
    });
  });

  describe("accessibility", () => {
    it("renders navigation landmark with Pagination label", () => {
      renderControls();

      const nav = screen.getByRole("navigation", { name: "Pagination" });
      expect(nav).toBeInTheDocument();
    });

    it("Previous button is focusable", () => {
      renderControls({ hasPrevious: true });

      const prevButton = screen.getByRole("button", { name: /previous page/i });
      prevButton.focus();
      expect(prevButton).toHaveFocus();
    });

    it("Next button is focusable", () => {
      renderControls({ hasMore: true });

      const nextButton = screen.getByRole("button", { name: /next page/i });
      nextButton.focus();
      expect(nextButton).toHaveFocus();
    });

    it("page size selector is focusable", () => {
      renderControls();

      const select = screen.getByLabelText("Rows per page");
      select.focus();
      expect(select).toHaveFocus();
    });
  });

  describe("disabled state", () => {
    it("disables all controls when disabled prop is true", () => {
      renderControls({ hasPrevious: true, hasMore: true, disabled: true });

      const prevButton = screen.getByRole("button", { name: /previous page/i });
      const nextButton = screen.getByRole("button", { name: /next page/i });
      const select = screen.getByLabelText("Rows per page");

      expect(prevButton).toBeDisabled();
      expect(nextButton).toBeDisabled();
      expect(select).toBeDisabled();
    });
  });
});
