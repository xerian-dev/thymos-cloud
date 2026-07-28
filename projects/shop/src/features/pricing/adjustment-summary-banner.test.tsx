import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdjustmentSummaryBanner } from "./adjustment-summary-banner";
import type { AdjustmentEvent } from "./pricing-types";

function makeAdjustment(
  overrides: Partial<AdjustmentEvent> = {},
): AdjustmentEvent {
  return {
    id: "test-id",
    brand: "TestBrand",
    category: "TestCategory",
    previousPrice: 20,
    newPrice: 18,
    direction: "decrease",
    percentageChange: -10,
    reason: "Low sell-through",
    metrics: {
      sellThroughRate: 0.25,
      medianDaysOnShelf: 45,
      sampleSize: 30,
      discountFrequency: 0.4,
      priceRatio: 0.85,
    },
    timestamp: "2024-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("AdjustmentSummaryBanner", () => {
  it("displays zeros and dash when adjustments array is empty", () => {
    render(<AdjustmentSummaryBanner adjustments={[]} />);

    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(3);
    expect(screen.getByText("—%")).toBeInTheDocument();
    expect(screen.getByText("Total Adjustments")).toBeInTheDocument();
    expect(screen.getByText("Increases")).toBeInTheDocument();
    expect(screen.getByText("Decreases")).toBeInTheDocument();
    expect(screen.getByText("Avg. Magnitude")).toBeInTheDocument();
  });

  it("displays correct counts for mixed adjustments", () => {
    const adjustments: AdjustmentEvent[] = [
      makeAdjustment({
        id: "1",
        direction: "increase",
        percentageChange: 5,
      }),
      makeAdjustment({
        id: "2",
        direction: "decrease",
        percentageChange: -10,
      }),
      makeAdjustment({
        id: "3",
        direction: "decrease",
        percentageChange: -8,
      }),
    ];

    render(<AdjustmentSummaryBanner adjustments={adjustments} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("computes average magnitude from absolute percentage changes", () => {
    const adjustments: AdjustmentEvent[] = [
      makeAdjustment({
        id: "1",
        direction: "increase",
        percentageChange: 6,
      }),
      makeAdjustment({
        id: "2",
        direction: "decrease",
        percentageChange: -10,
      }),
    ];

    render(<AdjustmentSummaryBanner adjustments={adjustments} />);

    // (6 + 10) / 2 = 8.0
    expect(screen.getByText("8.0%")).toBeInTheDocument();
  });

  it("has accessible region with aria-label", () => {
    render(<AdjustmentSummaryBanner adjustments={[]} />);

    expect(
      screen.getByRole("region", { name: "Adjustment summary" }),
    ).toBeInTheDocument();
  });

  it("displays all increases correctly", () => {
    const adjustments: AdjustmentEvent[] = [
      makeAdjustment({
        id: "1",
        direction: "increase",
        percentageChange: 4,
      }),
      makeAdjustment({
        id: "2",
        direction: "increase",
        percentageChange: 8,
      }),
    ];

    render(<AdjustmentSummaryBanner adjustments={adjustments} />);

    // Total = 2, Increases = 2, Decreases = 0
    // The "2" values for total and increases
    const twos = screen.getAllByText("2");
    expect(twos.length).toBe(2);
    expect(screen.getByText("6.0%")).toBeInTheDocument();
  });
});
