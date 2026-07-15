import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UserDetailPanel } from "./user-detail-panel";

const mockEmployee = {
  uuid: "emp-123",
  name: "Jane Smith",
  sourceId: "EMP-001",
  createdAt: "2024-01-15T10:00:00Z",
  updatedAt: "2024-06-20T14:30:00Z",
};

vi.mock("@/features/employees/employees-api", () => ({
  fetchEmployee: vi.fn(),
}));

import { fetchEmployee } from "@/features/employees/employees-api";
const mockFetchEmployee = vi.mocked(fetchEmployee);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UserDetailPanel", () => {
  it("renders nothing visible when closed", () => {
    mockFetchEmployee.mockResolvedValue(mockEmployee);

    render(
      <UserDetailPanel open={false} onClose={vi.fn()} employeeId="emp-123" />,
    );

    expect(screen.queryByText("Employee Details")).not.toBeInTheDocument();
  });

  it("displays loading state when open with an employeeId", () => {
    mockFetchEmployee.mockReturnValue(new Promise(() => {}));

    render(
      <UserDetailPanel open={true} onClose={vi.fn()} employeeId="emp-123" />,
    );

    expect(
      screen.getByText("Loading employee details…"),
    ).toBeInTheDocument();
  });

  it("displays employee data after successful fetch", async () => {
    mockFetchEmployee.mockResolvedValue(mockEmployee);

    render(
      <UserDetailPanel open={true} onClose={vi.fn()} employeeId="emp-123" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    });

    expect(screen.getByText("EMP-001")).toBeInTheDocument();
    expect(screen.getByText("Employee Details")).toBeInTheDocument();
  });

  it("displays error state when fetch fails", async () => {
    mockFetchEmployee.mockRejectedValue(
      new Error("Unable to load employee details"),
    );

    render(
      <UserDetailPanel open={true} onClose={vi.fn()} employeeId="emp-123" />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Unable to load employee details"),
      ).toBeInTheDocument();
    });
  });

  it("fetches employee data with the provided employeeId", () => {
    mockFetchEmployee.mockReturnValue(new Promise(() => {}));

    render(
      <UserDetailPanel open={true} onClose={vi.fn()} employeeId="emp-456" />,
    );

    expect(mockFetchEmployee).toHaveBeenCalledWith(
      "emp-456",
      expect.any(AbortSignal),
    );
  });

  it("does not fetch when employeeId is null", () => {
    render(
      <UserDetailPanel open={true} onClose={vi.fn()} employeeId={null} />,
    );

    expect(mockFetchEmployee).not.toHaveBeenCalled();
  });

  it("does not fetch when panel is closed", () => {
    render(
      <UserDetailPanel open={false} onClose={vi.fn()} employeeId="emp-123" />,
    );

    expect(mockFetchEmployee).not.toHaveBeenCalled();
  });
});
