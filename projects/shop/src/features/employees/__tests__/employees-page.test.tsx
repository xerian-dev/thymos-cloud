import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmployeesPage } from "../employees-page";
import type { UsePaginatedEmployeesResult } from "../employees-types";

const mockResult: UsePaginatedEmployeesResult = {
  employees: [],
  loading: false,
  error: null,
  hasMore: false,
  hasPrevious: false,
  pageSize: 20,
  goNext: vi.fn(),
  goPrevious: vi.fn(),
  setPageSize: vi.fn(),
  retry: vi.fn(),
};

vi.mock("../use-paginated-employees", () => ({
  usePaginatedEmployees: (): UsePaginatedEmployeesResult => mockResult,
}));

describe("EmployeesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResult.employees = [];
    mockResult.loading = false;
    mockResult.error = null;
    mockResult.hasMore = false;
    mockResult.hasPrevious = false;
    mockResult.pageSize = 20;
    mockResult.goNext = vi.fn();
    mockResult.goPrevious = vi.fn();
    mockResult.setPageSize = vi.fn();
    mockResult.retry = vi.fn();
  });

  it("renders 'Employees' heading", () => {
    render(<EmployeesPage />);

    expect(
      screen.getByRole("heading", { name: /employees/i }),
    ).toBeInTheDocument();
  });

  it("renders column headers: Name, Source ID, Created At", () => {
    mockResult.employees = [
      {
        uuid: "emp-001",
        name: "Alice",
        sourceId: "src-001",
        createdAt: "2024-01-15T10:00:00.000Z",
        updatedAt: "2024-01-15T10:00:00.000Z",
      },
    ];

    render(<EmployeesPage />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Source ID")).toBeInTheDocument();
    expect(screen.getByText("Created At")).toBeInTheDocument();
  });

  it("displays loading state when data is loading", () => {
    mockResult.loading = true;

    render(<EmployeesPage />);

    expect(screen.getByText("Loading employees…")).toBeInTheDocument();
  });

  it("displays error state with retry button on failure", () => {
    mockResult.error = "Unable to load employees";

    render(<EmployeesPage />);

    expect(screen.getByText("Unable to load employees")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(mockResult.retry).toHaveBeenCalledTimes(1);
  });

  it("does not render any create, edit, or delete action buttons", () => {
    mockResult.employees = [
      {
        uuid: "emp-001",
        name: "Alice",
        sourceId: "src-001",
        createdAt: "2024-01-15T10:00:00.000Z",
        updatedAt: "2024-01-15T10:00:00.000Z",
      },
    ];

    render(<EmployeesPage />);

    expect(
      screen.queryByRole("button", { name: /add/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /edit/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("uses proper ARIA table semantics", () => {
    mockResult.employees = [
      {
        uuid: "emp-001",
        name: "Alice",
        sourceId: "src-001",
        createdAt: "2024-01-15T10:00:00.000Z",
        updatedAt: "2024-01-15T10:00:00.000Z",
      },
    ];

    render(<EmployeesPage />);

    const region = screen.getByRole("region", { name: "Employees table" });
    expect(region).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    const columnHeaders = screen.getAllByRole("columnheader");
    expect(columnHeaders).toHaveLength(3);
    expect(columnHeaders[0]).toHaveTextContent("Name");
    expect(columnHeaders[1]).toHaveTextContent("Source ID");
    expect(columnHeaders[2]).toHaveTextContent("Created At");
  });
});
