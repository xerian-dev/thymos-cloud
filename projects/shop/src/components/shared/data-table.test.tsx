import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const testColumns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "value", header: "Value" },
];

const testData: TestRow[] = [
  { id: "1", name: "Alpha", value: 10 },
  { id: "2", name: "Beta", value: 20 },
  { id: "3", name: "Gamma", value: 30 },
];

describe("DataTable", () => {
  it("renders headers from column definitions", () => {
    render(
      <DataTable
        columns={testColumns}
        data={testData}
        loading={false}
        error={null}
        aria-label="Test table"
      />,
    );

    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
  });

  it("renders rows matching data", () => {
    render(
      <DataTable
        columns={testColumns}
        data={testData}
        loading={false}
        error={null}
        aria-label="Test table"
      />,
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("displays loading state when loading is true", () => {
    render(
      <DataTable
        columns={testColumns}
        data={[]}
        loading={true}
        error={null}
        aria-label="Test table"
      />,
    );

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("displays error state with retry button", () => {
    const onRetry = vi.fn();

    render(
      <DataTable
        columns={testColumns}
        data={[]}
        loading={false}
        error="Something went wrong"
        onRetry={onRetry}
        aria-label="Test table"
      />,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("displays empty state when data is empty", () => {
    render(
      <DataTable
        columns={testColumns}
        data={[]}
        loading={false}
        error={null}
        aria-label="Test table"
      />,
    );

    expect(screen.getByText("No data found.")).toBeInTheDocument();
  });

  it("wraps the table in a region with the provided aria-label", () => {
    render(
      <DataTable
        columns={testColumns}
        data={testData}
        loading={false}
        error={null}
        aria-label="Items inventory"
      />,
    );

    const region = screen.getByRole("region", { name: "Items inventory" });
    expect(region).toBeInTheDocument();
  });
});
