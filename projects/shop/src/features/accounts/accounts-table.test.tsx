import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountsTable, type AccountsTableProps } from "./accounts-table";
import type { Account } from "./accounts-types";

const mockAccounts: Account[] = [
  {
    uuid: "uuid-1",
    accountNumber: 42,
    name: "Alice",
    street: "123 Main",
    place: "Zurich",
    postcode: "8001",
    canton: "ZH",
    email: "alice@example.com",
    telephone: "555-0001",
    createdBy: { id: "emp-1", name: "Admin User", userType: "admin" },
    commentCount: 3,
    tags: ["vip"],
  },
  {
    uuid: "uuid-2",
    accountNumber: 7,
    name: "Bob",
    street: "456 Oak",
    place: "Bern",
    postcode: "3001",
    canton: "BE",
    email: "bob@example.com",
    telephone: "555-0002",
    createdBy: { id: "emp-2", name: "Manager User", userType: "manager" },
    commentCount: 0,
    tags: ["wholesale", "vip"],
  },
];

const defaultPaginationProps: Pick<
  AccountsTableProps,
  | "hasPrevious"
  | "hasMore"
  | "pageSize"
  | "onNext"
  | "onPrevious"
  | "onPageSizeChange"
> = {
  hasPrevious: false,
  hasMore: true,
  pageSize: 20,
  onNext: vi.fn(),
  onPrevious: vi.fn(),
  onPageSizeChange: vi.fn(),
};

describe("AccountsTable", () => {
  describe("column order and visibility", () => {
    it("renders column headers in correct order", () => {
      render(
        <AccountsTable
          data={mockAccounts}
          loading={false}
          error={null}
          {...defaultPaginationProps}
        />,
      );

      const headers = screen.getAllByRole("columnheader");
      const headerTexts = headers.map((h) => h.textContent?.trim());

      expect(headerTexts).toEqual([
        "Account #",
        "Name",
        "Street",
        "Place",
        "Postcode",
        "Email",
        "Telephone",
        "Created By",
        "",
      ]);
    });

    it("does NOT render a UUID column", () => {
      render(
        <AccountsTable
          data={mockAccounts}
          loading={false}
          error={null}
          {...defaultPaginationProps}
        />,
      );

      const headers = screen.getAllByRole("columnheader");
      const headerTexts = headers.map((h) => h.textContent?.trim());

      expect(headerTexts).not.toContain("UUID");
      expect(headerTexts).not.toContain("uuid");
    });

    it("does NOT render sort buttons in column headers", () => {
      render(
        <AccountsTable
          data={mockAccounts}
          loading={false}
          error={null}
          {...defaultPaginationProps}
        />,
      );

      const headers = screen.getAllByRole("columnheader");
      for (const header of headers) {
        const button = header.querySelector("button");
        expect(button).toBeNull();
      }
    });

    it("does NOT render aria-sort attributes on column headers", () => {
      render(
        <AccountsTable
          data={mockAccounts}
          loading={false}
          error={null}
          {...defaultPaginationProps}
        />,
      );

      const headers = screen.getAllByRole("columnheader");
      for (const header of headers) {
        expect(header).not.toHaveAttribute("aria-sort");
      }
    });
  });

  describe("loading state", () => {
    it("shows loading indicator when loading is true", () => {
      render(
        <AccountsTable
          data={[]}
          loading={true}
          error={null}
          {...defaultPaginationProps}
        />,
      );

      expect(screen.getByText(/loading accounts/i)).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error message when error is set", () => {
      render(
        <AccountsTable
          data={[]}
          loading={false}
          error="Unable to load accounts. Please try again."
          {...defaultPaginationProps}
        />,
      );

      expect(
        screen.getByText("Unable to load accounts. Please try again."),
      ).toBeInTheDocument();
    });

    it("shows Retry button when error and onRetry provided, clicking calls onRetry", () => {
      const onRetry = vi.fn();
      render(
        <AccountsTable
          data={[]}
          loading={false}
          error="Something went wrong."
          onRetry={onRetry}
          {...defaultPaginationProps}
        />,
      );

      const retryButton = screen.getByRole("button", { name: /retry/i });
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("does not show Retry button when error without onRetry", () => {
      render(
        <AccountsTable
          data={[]}
          loading={false}
          error="Something went wrong."
          {...defaultPaginationProps}
        />,
      );

      expect(
        screen.queryByRole("button", { name: /retry/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it('shows "No accounts found." when data is empty and not loading', () => {
      render(
        <AccountsTable
          data={[]}
          loading={false}
          error={null}
          {...defaultPaginationProps}
        />,
      );

      expect(screen.getByText("No accounts found.")).toBeInTheDocument();
    });
  });

  describe("data display", () => {
    it("displays account data correctly", () => {
      render(
        <AccountsTable
          data={mockAccounts}
          loading={false}
          error={null}
          {...defaultPaginationProps}
        />,
      );

      // Zero-padded account numbers
      expect(screen.getByText("0000042")).toBeInTheDocument();
      expect(screen.getByText("0000007")).toBeInTheDocument();

      // Names
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();

      // Street
      expect(screen.getByText("123 Main")).toBeInTheDocument();
      expect(screen.getByText("456 Oak")).toBeInTheDocument();

      // Place
      expect(screen.getByText("Zurich")).toBeInTheDocument();
      expect(screen.getByText("Bern")).toBeInTheDocument();

      // Postcode
      expect(screen.getByText("8001")).toBeInTheDocument();
      expect(screen.getByText("3001")).toBeInTheDocument();

      // Email
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();

      // Telephone
      expect(screen.getByText("555-0001")).toBeInTheDocument();
      expect(screen.getByText("555-0002")).toBeInTheDocument();

      // Created By
      expect(screen.getByText("Admin User")).toBeInTheDocument();
      expect(screen.getByText("Manager User")).toBeInTheDocument();
    });
  });

  describe("table semantics", () => {
    it('all th elements have scope="col"', () => {
      render(
        <AccountsTable
          data={mockAccounts}
          loading={false}
          error={null}
          {...defaultPaginationProps}
        />,
      );

      const headers = screen.getAllByRole("columnheader");
      for (const header of headers) {
        expect(header).toHaveAttribute("scope", "col");
      }
    });
  });

  describe("pagination controls", () => {
    it("renders pagination controls below the table", () => {
      render(
        <AccountsTable
          data={mockAccounts}
          loading={false}
          error={null}
          {...defaultPaginationProps}
        />,
      );

      expect(
        screen.getByRole("navigation", { name: /pagination/i }),
      ).toBeInTheDocument();
    });

    it("passes hasPrevious and hasMore to pagination controls", () => {
      render(
        <AccountsTable
          data={mockAccounts}
          loading={false}
          error={null}
          hasPrevious={false}
          hasMore={true}
          pageSize={20}
          onNext={vi.fn()}
          onPrevious={vi.fn()}
          onPageSizeChange={vi.fn()}
        />,
      );

      const prevButton = screen.getByRole("button", {
        name: /go to previous page/i,
      });
      const nextButton = screen.getByRole("button", {
        name: /go to next page/i,
      });

      expect(prevButton).toBeDisabled();
      expect(nextButton).not.toBeDisabled();
    });
  });
});
