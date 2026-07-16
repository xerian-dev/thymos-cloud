import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmployeesPage } from "../employees-page";
import type { UsePaginatedEmployeesResult } from "../employees-types";

const mockUsePaginatedEmployees = vi.fn<() => UsePaginatedEmployeesResult>();

vi.mock("../use-paginated-employees", () => ({
  usePaginatedEmployees: (...args: unknown[]) =>
    mockUsePaginatedEmployees(...(args as [])),
}));

function createMockResult(
  overrides: Partial<UsePaginatedEmployeesResult> = {},
): UsePaginatedEmployeesResult {
  return {
    employees: [
      {
        uuid: "emp-1",
        name: "Jane Smith",
        sourceId: "src-001",
        createdAt: "2024-01-15T10:00:00.000Z",
        updatedAt: "2024-01-15T10:00:00.000Z",
      },
    ],
    loading: false,
    error: null,
    hasMore: false,
    hasPrevious: false,
    pageSize: 20,
    goNext: vi.fn(),
    goPrevious: vi.fn(),
    setPageSize: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

describe("EmployeesPage — pagination controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Next button enabled/disabled states (Req 4.1)", () => {
    it("enables Next button when hasMore is true", () => {
      mockUsePaginatedEmployees.mockReturnValue(
        createMockResult({ hasMore: true }),
      );
      render(<EmployeesPage />);

      const nextButton = screen.getByRole("button", {
        name: /go to next page/i,
      });
      expect(nextButton).not.toBeDisabled();
    });

    it("disables Next button when hasMore is false", () => {
      mockUsePaginatedEmployees.mockReturnValue(
        createMockResult({ hasMore: false }),
      );
      render(<EmployeesPage />);

      const nextButton = screen.getByRole("button", {
        name: /go to next page/i,
      });
      expect(nextButton).toBeDisabled();
    });
  });

  describe("Previous button enabled/disabled states (Req 4.2)", () => {
    it("enables Previous button when hasPrevious is true", () => {
      mockUsePaginatedEmployees.mockReturnValue(
        createMockResult({ hasPrevious: true }),
      );
      render(<EmployeesPage />);

      const previousButton = screen.getByRole("button", {
        name: /go to previous page/i,
      });
      expect(previousButton).not.toBeDisabled();
    });

    it("disables Previous button when hasPrevious is false", () => {
      mockUsePaginatedEmployees.mockReturnValue(
        createMockResult({ hasPrevious: false }),
      );
      render(<EmployeesPage />);

      const previousButton = screen.getByRole("button", {
        name: /go to previous page/i,
      });
      expect(previousButton).toBeDisabled();
    });
  });

  describe("Page size selector (Req 4.5)", () => {
    it("shows options 20, 50, and 100", () => {
      mockUsePaginatedEmployees.mockReturnValue(createMockResult());
      render(<EmployeesPage />);

      const select = screen.getByLabelText(/rows per page/i);
      const options = select.querySelectorAll("option");

      expect(options).toHaveLength(3);
      expect(options[0]).toHaveValue("20");
      expect(options[1]).toHaveValue("50");
      expect(options[2]).toHaveValue("100");
    });

    it("calls setPageSize when page size is changed", () => {
      const setPageSize = vi.fn();
      mockUsePaginatedEmployees.mockReturnValue(
        createMockResult({ setPageSize }),
      );
      render(<EmployeesPage />);

      const select = screen.getByLabelText(/rows per page/i);
      fireEvent.change(select, { target: { value: "100" } });

      expect(setPageSize).toHaveBeenCalledWith(100);
    });
  });

  describe("pagination controls visibility", () => {
    it("does not show pagination controls while loading", () => {
      mockUsePaginatedEmployees.mockReturnValue(
        createMockResult({ loading: true }),
      );
      render(<EmployeesPage />);

      expect(
        screen.queryByRole("navigation", { name: "Pagination" }),
      ).not.toBeInTheDocument();
    });

    it("does not show pagination controls when there is an error", () => {
      mockUsePaginatedEmployees.mockReturnValue(
        createMockResult({ error: "Network error" }),
      );
      render(<EmployeesPage />);

      expect(
        screen.queryByRole("navigation", { name: "Pagination" }),
      ).not.toBeInTheDocument();
    });

    it("shows pagination controls when data is loaded without error", () => {
      mockUsePaginatedEmployees.mockReturnValue(createMockResult());
      render(<EmployeesPage />);

      expect(
        screen.getByRole("navigation", { name: "Pagination" }),
      ).toBeInTheDocument();
    });
  });
});
