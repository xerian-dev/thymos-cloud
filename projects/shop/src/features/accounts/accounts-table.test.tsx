import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { AccountsTable } from "./accounts-table";
import type { Account } from "./accounts-types";

const mockAccounts: Account[] = [
  {
    uuid: "uuid-1",
    shopUid: 42,
    name: "Alice",
    street: "123 Main",
    place: "Zurich",
    postcode: "8001",
    canton: "ZH",
    email: "alice@example.com",
    telephone: "555-0001",
    commentCount: 3,
    tags: ["vip"],
  },
  {
    uuid: "uuid-2",
    shopUid: 7,
    name: "Bob",
    street: "456 Oak",
    place: "Bern",
    postcode: "3001",
    canton: "BE",
    email: "bob@example.com",
    telephone: "555-0002",
    commentCount: 0,
    tags: ["wholesale", "vip"],
  },
];

describe("AccountsTable", () => {
  describe("column order and visibility", () => {
    it("renders column headers in correct order", () => {
      render(
        <AccountsTable data={mockAccounts} loading={false} error={null} />,
      );

      const headers = screen.getAllByRole("columnheader");
      const headerTexts = headers.map((h) =>
        h.textContent?.replace(/[⇅▲▼]/g, "").trim(),
      );

      expect(headerTexts).toEqual([
        "Account #",
        "Name",
        "Street",
        "Place",
        "Postcode",
        "Canton",
        "Email",
        "Telephone",
        "Comments",
        "Tags",
      ]);
    });

    it("does NOT render a UUID column", () => {
      render(
        <AccountsTable data={mockAccounts} loading={false} error={null} />,
      );

      const headers = screen.getAllByRole("columnheader");
      const headerTexts = headers.map((h) =>
        h.textContent?.replace(/[⇅▲▼]/g, "").trim(),
      );

      expect(headerTexts).not.toContain("UUID");
      expect(headerTexts).not.toContain("uuid");
    });
  });

  describe("loading state", () => {
    it("shows loading indicator when loading is true", () => {
      render(<AccountsTable data={[]} loading={true} error={null} />);

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
        />,
      );

      expect(
        screen.queryByRole("button", { name: /retry/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it('shows "No accounts found." when data is empty and not loading', () => {
      render(<AccountsTable data={[]} loading={false} error={null} />);

      expect(screen.getByText("No accounts found.")).toBeInTheDocument();
    });
  });

  describe("data display", () => {
    it("displays account data correctly", () => {
      render(
        <AccountsTable data={mockAccounts} loading={false} error={null} />,
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

      // Canton
      expect(screen.getByText("ZH")).toBeInTheDocument();
      expect(screen.getByText("BE")).toBeInTheDocument();

      // Email
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();

      // Telephone
      expect(screen.getByText("555-0001")).toBeInTheDocument();
      expect(screen.getByText("555-0002")).toBeInTheDocument();

      // Comment counts
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();

      // Tags (comma-separated)
      expect(screen.getByText("vip")).toBeInTheDocument();
      expect(screen.getByText("wholesale, vip")).toBeInTheDocument();
    });
  });

  describe("table semantics", () => {
    it('all th elements have scope="col"', () => {
      render(
        <AccountsTable data={mockAccounts} loading={false} error={null} />,
      );

      const headers = screen.getAllByRole("columnheader");
      for (const header of headers) {
        expect(header).toHaveAttribute("scope", "col");
      }
    });
  });

  describe("sort indicator", () => {
    it("shows ascending sort indicator when a column header is clicked", () => {
      render(
        <AccountsTable data={mockAccounts} loading={false} error={null} />,
      );

      const nameButton = screen.getByRole("button", { name: /name/i });
      fireEvent.click(nameButton);

      const headers = screen.getAllByRole("columnheader");
      const nameHeader = headers.find((h) => h.textContent?.includes("Name"));
      expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    });

    it("toggles to descending sort indicator on second click", () => {
      render(
        <AccountsTable data={mockAccounts} loading={false} error={null} />,
      );

      const nameButton = screen.getByRole("button", { name: /name/i });
      fireEvent.click(nameButton);
      fireEvent.click(nameButton);

      const headers = screen.getAllByRole("columnheader");
      const nameHeader = headers.find((h) => h.textContent?.includes("Name"));
      expect(nameHeader).toHaveAttribute("aria-sort", "descending");
    });
  });

  describe("sorting behavior", () => {
    it("clicking a sortable column header sorts the data", () => {
      render(
        <AccountsTable data={mockAccounts} loading={false} error={null} />,
      );

      // Click "Name" twice for descending alphabetical sort
      const nameButton = screen.getByRole("button", { name: /name/i });
      fireEvent.click(nameButton); // ascending
      fireEvent.click(nameButton); // descending

      // Get all rows (excluding header row)
      const rows = screen.getAllByRole("row").slice(1);
      const firstRowCells = within(rows[0]).getAllByRole("cell");
      const secondRowCells = within(rows[1]).getAllByRole("cell");

      // "Bob" should come before "Alice" in descending alphabetical order
      expect(firstRowCells[1]).toHaveTextContent("Bob");
      expect(secondRowCells[1]).toHaveTextContent("Alice");
    });
  });
});
