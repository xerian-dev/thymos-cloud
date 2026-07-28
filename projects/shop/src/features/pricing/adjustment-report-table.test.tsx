import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdjustmentReportTable } from "./adjustment-report-table";
import type { AdjustmentEvent } from "./pricing-types";

const mockAdjustments: AdjustmentEvent[] = [
  {
    id: "adj-1",
    brand: "Gucci",
    category: "Handbags",
    previousPrice: 120,
    newPrice: 108,
    direction: "decrease",
    percentageChange: -10,
    reason: "Low sell-through rate",
    metrics: {
      sellThroughRate: 0.25,
      medianDaysOnShelf: 45,
      sampleSize: 30,
      discountFrequency: 0.6,
      priceRatio: 0.85,
    },
    timestamp: "2024-06-15T10:00:00.000Z",
  },
  {
    id: "adj-2",
    brand: "Louis Vuitton",
    category: "Wallets",
    previousPrice: 80,
    newPrice: 88,
    direction: "increase",
    percentageChange: 10,
    reason: "Strong demand",
    metrics: {
      sellThroughRate: 0.9,
      medianDaysOnShelf: 7,
      sampleSize: 25,
      discountFrequency: 0.1,
      priceRatio: 1.1,
    },
    timestamp: "2024-06-14T08:30:00.000Z",
  },
];

describe("AdjustmentReportTable", () => {
  it("renders loading skeleton when isLoading is true", () => {
    render(<AdjustmentReportTable adjustments={[]} isLoading={true} />);

    expect(screen.getByLabelText("Loading adjustments")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("renders empty message when adjustments array is empty and not loading", () => {
    render(<AdjustmentReportTable adjustments={[]} isLoading={false} />);

    expect(screen.getByText("No adjustments found")).toBeInTheDocument();
  });

  it("renders table headers", () => {
    render(
      <AdjustmentReportTable adjustments={mockAdjustments} isLoading={false} />,
    );

    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Previous Price")).toBeInTheDocument();
    expect(screen.getByText("New Price")).toBeInTheDocument();
    expect(screen.getByText("Change")).toBeInTheDocument();
    expect(screen.getByText("Direction")).toBeInTheDocument();
    expect(screen.getByText("Reason")).toBeInTheDocument();
  });

  it("renders adjustment rows with formatted data", () => {
    render(
      <AdjustmentReportTable adjustments={mockAdjustments} isLoading={false} />,
    );

    expect(screen.getByText("Gucci")).toBeInTheDocument();
    expect(screen.getByText("Handbags")).toBeInTheDocument();
    expect(screen.getByText("CHF 120.00")).toBeInTheDocument();
    expect(screen.getByText("CHF 108.00")).toBeInTheDocument();
    expect(screen.getByText("-10.0%")).toBeInTheDocument();
    expect(screen.getByText("Low sell-through rate")).toBeInTheDocument();

    expect(screen.getByText("Louis Vuitton")).toBeInTheDocument();
    expect(screen.getByText("Wallets")).toBeInTheDocument();
    expect(screen.getByText("CHF 80.00")).toBeInTheDocument();
    expect(screen.getByText("CHF 88.00")).toBeInTheDocument();
    expect(screen.getByText("+10.0%")).toBeInTheDocument();
    expect(screen.getByText("Strong demand")).toBeInTheDocument();
  });

  it("renders direction icons with correct colors", () => {
    render(
      <AdjustmentReportTable adjustments={mockAdjustments} isLoading={false} />,
    );

    const decrease = screen.getByLabelText("Price decrease");
    expect(decrease).toHaveTextContent("↓");
    expect(decrease).toHaveClass("text-red-600");

    const increase = screen.getByLabelText("Price increase");
    expect(increase).toHaveTextContent("↑");
    expect(increase).toHaveClass("text-green-600");
  });

  it("expands a row to show metrics when clicked", () => {
    render(
      <AdjustmentReportTable adjustments={mockAdjustments} isLoading={false} />,
    );

    // Metrics should not be visible initially
    expect(screen.queryByText("Sell-through:")).not.toBeInTheDocument();

    // Click the first row
    const row = screen.getByText("Gucci").closest("tr")!;
    fireEvent.click(row);

    // Metrics should now be visible
    expect(screen.getByText("Sell-through:")).toBeInTheDocument();
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    expect(screen.getByText("Days on shelf:")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("Sample size:")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("Discount frequency:")).toBeInTheDocument();
    expect(screen.getByText("60.0%")).toBeInTheDocument();
  });

  it("collapses an expanded row when clicked again", () => {
    render(
      <AdjustmentReportTable adjustments={mockAdjustments} isLoading={false} />,
    );

    const row = screen.getByText("Gucci").closest("tr")!;

    // Expand
    fireEvent.click(row);
    expect(screen.getByText("Sell-through:")).toBeInTheDocument();

    // Collapse
    fireEvent.click(row);
    expect(screen.queryByText("Sell-through:")).not.toBeInTheDocument();
  });

  it("sets aria-expanded attribute on clickable rows", () => {
    render(
      <AdjustmentReportTable adjustments={mockAdjustments} isLoading={false} />,
    );

    const row = screen.getByText("Gucci").closest("tr")!;
    expect(row).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
  });

  it("wraps table in a region with proper aria-label", () => {
    render(
      <AdjustmentReportTable adjustments={mockAdjustments} isLoading={false} />,
    );

    expect(
      screen.getByRole("region", { name: "Adjustment report table" }),
    ).toBeInTheDocument();
  });
});
