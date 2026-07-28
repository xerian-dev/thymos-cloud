import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdjustmentReportFilters } from "./adjustment-report-filters";
import type { AdjustmentFilters } from "./pricing-types";

describe("AdjustmentReportFilters", () => {
  const defaultFilters: AdjustmentFilters = {};

  it("renders all filter inputs with labels", () => {
    render(
      <AdjustmentReportFilters
        filters={defaultFilters}
        onFiltersChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("Direction")).toBeInTheDocument();
    expect(screen.getByLabelText("Brand")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });

  it("displays current filter values", () => {
    const filters: AdjustmentFilters = {
      direction: "increase",
      brand: "Nike",
      category: "Shoes",
      fromDate: "2024-01-01",
      toDate: "2024-06-30",
    };

    render(
      <AdjustmentReportFilters filters={filters} onFiltersChange={() => {}} />,
    );

    expect(screen.getByLabelText("Direction")).toHaveValue("increase");
    expect(screen.getByLabelText("Brand")).toHaveValue("Nike");
    expect(screen.getByLabelText("Category")).toHaveValue("Shoes");
    expect(screen.getByLabelText("From")).toHaveValue("2024-01-01");
    expect(screen.getByLabelText("To")).toHaveValue("2024-06-30");
  });

  it("calls onFiltersChange with updated direction", () => {
    const onFiltersChange = vi.fn();

    render(
      <AdjustmentReportFilters
        filters={defaultFilters}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Direction"), {
      target: { value: "decrease" },
    });

    expect(onFiltersChange).toHaveBeenCalledWith({
      direction: "decrease",
    });
  });

  it("calls onFiltersChange with undefined direction when all is selected", () => {
    const onFiltersChange = vi.fn();
    const filters: AdjustmentFilters = { direction: "increase" };

    render(
      <AdjustmentReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Direction"), {
      target: { value: "all" },
    });

    expect(onFiltersChange).toHaveBeenCalledWith({
      direction: undefined,
    });
  });

  it("calls onFiltersChange with brand text", () => {
    const onFiltersChange = vi.fn();

    render(
      <AdjustmentReportFilters
        filters={defaultFilters}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Brand"), {
      target: { value: "Nike" },
    });

    expect(onFiltersChange).toHaveBeenCalledWith({
      brand: "Nike",
    });
  });

  it("calls onFiltersChange with undefined brand when cleared", () => {
    const onFiltersChange = vi.fn();
    const filters: AdjustmentFilters = { brand: "Nike" };

    render(
      <AdjustmentReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Brand"), {
      target: { value: "" },
    });

    expect(onFiltersChange).toHaveBeenCalledWith({
      brand: undefined,
    });
  });

  it("calls onFiltersChange with category text", () => {
    const onFiltersChange = vi.fn();

    render(
      <AdjustmentReportFilters
        filters={defaultFilters}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Shoes" },
    });

    expect(onFiltersChange).toHaveBeenCalledWith({
      category: "Shoes",
    });
  });

  it("calls onFiltersChange with fromDate", () => {
    const onFiltersChange = vi.fn();

    render(
      <AdjustmentReportFilters
        filters={defaultFilters}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2024-03-15" },
    });

    expect(onFiltersChange).toHaveBeenCalledWith({
      fromDate: "2024-03-15",
    });
  });

  it("calls onFiltersChange with toDate", () => {
    const onFiltersChange = vi.fn();

    render(
      <AdjustmentReportFilters
        filters={defaultFilters}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2024-06-30" },
    });

    expect(onFiltersChange).toHaveBeenCalledWith({
      toDate: "2024-06-30",
    });
  });

  it("direction select has all/increase/decrease options", () => {
    render(
      <AdjustmentReportFilters
        filters={defaultFilters}
        onFiltersChange={() => {}}
      />,
    );

    const select = screen.getByLabelText("Direction");
    const options = select.querySelectorAll("option");

    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("All");
    expect(options[1]).toHaveTextContent("Increase");
    expect(options[2]).toHaveTextContent("Decrease");
  });

  it("preserves other filters when one changes", () => {
    const onFiltersChange = vi.fn();
    const filters: AdjustmentFilters = {
      direction: "increase",
      brand: "Nike",
      category: "Shoes",
      fromDate: "2024-01-01",
      toDate: "2024-06-30",
    };

    render(
      <AdjustmentReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Brand"), {
      target: { value: "Adidas" },
    });

    expect(onFiltersChange).toHaveBeenCalledWith({
      direction: "increase",
      brand: "Adidas",
      category: "Shoes",
      fromDate: "2024-01-01",
      toDate: "2024-06-30",
    });
  });
});
