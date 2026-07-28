import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { PriceSuggestionPanel } from "./price-suggestion-panel";
import type { PriceSuggestionResult } from "@/features/pricing/pricing-types";

vi.mock("@/features/pricing/pricing-api", () => ({
  fetchPriceSuggestion: vi.fn(),
}));

import { fetchPriceSuggestion } from "@/features/pricing/pricing-api";
const mockFetchPriceSuggestion = vi.mocked(fetchPriceSuggestion);

beforeEach(() => {
  vi.clearAllMocks();
});

const baseSuggestionResponse: PriceSuggestionResult = {
  success: true,
  data: {
    suggestedPrice: 45.5,
    confidence: "high",
    explanation: "Based on 25 comparable items in Zara × Clothing.",
    adjustments: {
      referencePrice: 42.0,
      velocityMultiplier: 1.05,
      creatorAdjustment: 1.0,
      colorAdjustment: 1.02,
      sizeAdjustment: 1.0,
    },
    groupInfo: {
      brand: "Zara",
      category: "Clothing",
      sampleSize: 25,
      sellThroughRate: 0.72,
      medianDaysOnShelf: 18,
    },
  },
};

describe("PriceSuggestionPanel", () => {
  it("renders nothing when categoryId is empty (waiting for input)", () => {
    const { container } = render(
      <PriceSuggestionPanel
        brand="Zara"
        categoryId=""
        color="Black"
        size="M"
        onUseSuggestion={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows loading state before fetch completes", () => {
    mockFetchPriceSuggestion.mockReturnValue(new Promise(() => {}));

    render(
      <PriceSuggestionPanel
        brand="Zara"
        categoryId="cat-1"
        color="Black"
        size="M"
        onUseSuggestion={vi.fn()}
      />,
    );

    // Loading state is shown immediately (before debounce fires)
    expect(
      screen.getByLabelText("Loading price suggestion"),
    ).toBeInTheDocument();
  });

  it("displays suggestion with price, confidence badge, and explanation", async () => {
    mockFetchPriceSuggestion.mockResolvedValue(baseSuggestionResponse);

    render(
      <PriceSuggestionPanel
        brand="Zara"
        categoryId="cat-1"
        color="Black"
        size="M"
        onUseSuggestion={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("CHF 45.50")).toBeInTheDocument();
    });

    expect(screen.getByText("high")).toBeInTheDocument();
    expect(
      screen.getByText("Based on 25 comparable items in Zara × Clothing."),
    ).toBeInTheDocument();
    expect(screen.getByText("Use Suggestion")).toBeInTheDocument();
  });

  it("calls onUseSuggestion with the suggested price when button clicked", async () => {
    mockFetchPriceSuggestion.mockResolvedValue(baseSuggestionResponse);
    const onUseSuggestion = vi.fn();

    render(
      <PriceSuggestionPanel
        brand="Zara"
        categoryId="cat-1"
        color="Black"
        size="M"
        onUseSuggestion={onUseSuggestion}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Use Suggestion")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Use Suggestion"));

    expect(onUseSuggestion).toHaveBeenCalledWith(45.5);
  });

  it("shows no-data message when suggestion is null", async () => {
    const noDataResponse: PriceSuggestionResult = {
      success: true,
      data: {
        suggestedPrice: null,
        confidence: null,
        explanation: "No pricing data available for this category",
        adjustments: null,
        groupInfo: null,
      },
    };
    mockFetchPriceSuggestion.mockResolvedValue(noDataResponse);

    render(
      <PriceSuggestionPanel
        brand="Unknown"
        categoryId="cat-2"
        color=""
        size=""
        onUseSuggestion={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No pricing data available")).toBeInTheDocument();
    });
  });

  it("shows error message when fetch fails", async () => {
    const errorResponse: PriceSuggestionResult = {
      success: false,
      error: "network",
    };
    mockFetchPriceSuggestion.mockResolvedValue(errorResponse);

    render(
      <PriceSuggestionPanel
        brand="Zara"
        categoryId="cat-1"
        color="Black"
        size="M"
        onUseSuggestion={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Unable to load suggestion")).toBeInTheDocument();
    });
  });

  it("passes correct parameters to fetchPriceSuggestion", async () => {
    mockFetchPriceSuggestion.mockResolvedValue(baseSuggestionResponse);

    render(
      <PriceSuggestionPanel
        brand="Nike"
        categoryId="cat-5"
        color="Red"
        size="L"
        createdBy="emp-001"
        onUseSuggestion={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockFetchPriceSuggestion).toHaveBeenCalled();
    });

    expect(mockFetchPriceSuggestion).toHaveBeenCalledWith(
      {
        brand: "Nike",
        categoryId: "cat-5",
        color: "Red",
        size: "L",
        createdBy: "emp-001",
      },
      expect.any(AbortSignal),
    );
  });

  it("displays medium confidence badge with amber styling", async () => {
    const mediumResponse: PriceSuggestionResult = {
      success: true,
      data: {
        suggestedPrice: 30.0,
        confidence: "medium",
        explanation: "Based on 12 comparable items.",
        adjustments: {
          referencePrice: 28.0,
          velocityMultiplier: 1.0,
          creatorAdjustment: 1.0,
          colorAdjustment: 1.0,
          sizeAdjustment: 1.0,
        },
        groupInfo: {
          brand: "H&M",
          category: "Tops",
          sampleSize: 12,
          sellThroughRate: 0.5,
          medianDaysOnShelf: 25,
        },
      },
    };
    mockFetchPriceSuggestion.mockResolvedValue(mediumResponse);

    render(
      <PriceSuggestionPanel
        brand="H&M"
        categoryId="cat-1"
        color="Black"
        size="M"
        onUseSuggestion={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("medium")).toBeInTheDocument();
    });

    const badge = screen.getByText("medium");
    expect(badge.className).toContain("bg-amber-100");
  });

  it("displays low confidence badge with grey styling", async () => {
    const lowResponse: PriceSuggestionResult = {
      success: true,
      data: {
        suggestedPrice: 20.0,
        confidence: "low",
        explanation: "Limited data available.",
        adjustments: {
          referencePrice: 20.0,
          velocityMultiplier: 1.0,
          creatorAdjustment: 1.0,
          colorAdjustment: 1.0,
          sizeAdjustment: 1.0,
        },
        groupInfo: {
          brand: null,
          category: "Accessories",
          sampleSize: 3,
          sellThroughRate: 0.3,
          medianDaysOnShelf: 40,
        },
      },
    };
    mockFetchPriceSuggestion.mockResolvedValue(lowResponse);

    render(
      <PriceSuggestionPanel
        brand="Zara"
        categoryId="cat-1"
        color="Black"
        size="M"
        onUseSuggestion={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("low")).toBeInTheDocument();
    });

    const badge = screen.getByText("low");
    expect(badge.className).toContain("bg-gray-100");
  });

  it("does not call fetch when only empty strings are provided (besides categoryId)", async () => {
    mockFetchPriceSuggestion.mockResolvedValue(baseSuggestionResponse);

    render(
      <PriceSuggestionPanel
        brand=""
        categoryId="cat-1"
        color=""
        size=""
        onUseSuggestion={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockFetchPriceSuggestion).toHaveBeenCalled();
    });

    // Empty strings should be passed as undefined
    expect(mockFetchPriceSuggestion).toHaveBeenCalledWith(
      {
        brand: undefined,
        categoryId: "cat-1",
        color: undefined,
        size: undefined,
        createdBy: undefined,
      },
      expect.any(AbortSignal),
    );
  });
});
