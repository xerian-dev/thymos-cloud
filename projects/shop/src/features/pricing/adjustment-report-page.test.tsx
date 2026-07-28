import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdjustmentReportPage } from "./adjustment-report-page";
import type { UseAdjustmentsResult } from "./use-adjustments";
import type { AdjustmentEvent } from "./pricing-types";

vi.mock("./use-adjustments");

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
];

function createMockHookResult(
  overrides: Partial<UseAdjustmentsResult> = {},
): UseAdjustmentsResult {
  return {
    adjustments: [],
    isLoading: false,
    error: null,
    hasMore: false,
    loadMore: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

describe("AdjustmentReportPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the heading 'Pricing Adjustments'", async () => {
    const { useAdjustments } = await import("./use-adjustments");
    vi.mocked(useAdjustments).mockReturnValue(createMockHookResult());

    render(<AdjustmentReportPage />);

    expect(
      screen.getByRole("heading", { name: "Pricing Adjustments" }),
    ).toBeInTheDocument();
  });

  it("renders filter controls", async () => {
    const { useAdjustments } = await import("./use-adjustments");
    vi.mocked(useAdjustments).mockReturnValue(createMockHookResult());

    render(<AdjustmentReportPage />);

    expect(screen.getByLabelText("Direction")).toBeInTheDocument();
    expect(screen.getByLabelText("Brand")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });

  it("renders loading state", async () => {
    const { useAdjustments } = await import("./use-adjustments");
    vi.mocked(useAdjustments).mockReturnValue(
      createMockHookResult({ isLoading: true }),
    );

    render(<AdjustmentReportPage />);

    expect(screen.getByLabelText("Loading adjustments")).toBeInTheDocument();
  });

  it("renders error state with Retry button", async () => {
    const { useAdjustments } = await import("./use-adjustments");
    vi.mocked(useAdjustments).mockReturnValue(
      createMockHookResult({ error: "Network error — check your connection" }),
    );

    render(<AdjustmentReportPage />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("Network error — check your connection"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
  });

  it("renders adjustment table with data", async () => {
    const { useAdjustments } = await import("./use-adjustments");
    vi.mocked(useAdjustments).mockReturnValue(
      createMockHookResult({ adjustments: mockAdjustments }),
    );

    render(<AdjustmentReportPage />);

    expect(screen.getByText("Gucci")).toBeInTheDocument();
    expect(screen.getByText("Handbags")).toBeInTheDocument();
    expect(screen.getByText("CHF 120.00")).toBeInTheDocument();
    expect(screen.getByText("CHF 108.00")).toBeInTheDocument();
  });

  it("renders summary banner", async () => {
    const { useAdjustments } = await import("./use-adjustments");
    vi.mocked(useAdjustments).mockReturnValue(
      createMockHookResult({ adjustments: mockAdjustments }),
    );

    render(<AdjustmentReportPage />);

    expect(
      screen.getByRole("region", { name: "Adjustment summary" }),
    ).toBeInTheDocument();
  });

  it("shows Load More button when hasMore is true", async () => {
    const { useAdjustments } = await import("./use-adjustments");
    vi.mocked(useAdjustments).mockReturnValue(
      createMockHookResult({
        adjustments: mockAdjustments,
        hasMore: true,
      }),
    );

    render(<AdjustmentReportPage />);

    expect(
      screen.getByRole("button", { name: "Load More" }),
    ).toBeInTheDocument();
  });

  it("does not show Load More button when hasMore is false", async () => {
    const { useAdjustments } = await import("./use-adjustments");
    vi.mocked(useAdjustments).mockReturnValue(
      createMockHookResult({
        adjustments: mockAdjustments,
        hasMore: false,
      }),
    );

    render(<AdjustmentReportPage />);

    expect(
      screen.queryByRole("button", { name: "Load More" }),
    ).not.toBeInTheDocument();
  });
});
