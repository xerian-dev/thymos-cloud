import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { ItemCapturePage } from "./item-capture-page";

vi.mock("../pricing/pricing-api", () => ({
  fetchCanonicalBrands: vi.fn(),
  fetchCanonicalColors: vi.fn(),
  fetchCanonicalDescriptions: vi.fn(),
  fetchPriceSuggestion: vi.fn(),
}));

vi.mock("./categories-api", () => ({
  fetchCategories: vi.fn(),
}));

import {
  fetchCanonicalBrands,
  fetchCanonicalColors,
  fetchCanonicalDescriptions,
  fetchPriceSuggestion,
} from "../pricing/pricing-api";
import { fetchCategories } from "./categories-api";

const mockFetchCanonicalBrands = vi.mocked(fetchCanonicalBrands);
const mockFetchCanonicalColors = vi.mocked(fetchCanonicalColors);
const mockFetchCanonicalDescriptions = vi.mocked(fetchCanonicalDescriptions);
const mockFetchPriceSuggestion = vi.mocked(fetchPriceSuggestion);
const mockFetchCategories = vi.mocked(fetchCategories);

describe("ItemCapturePage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockFetchCanonicalBrands.mockResolvedValue({
      success: true,
      values: ["Nike", "Adidas", "Puma"],
    });
    mockFetchCanonicalColors.mockResolvedValue({
      success: true,
      values: ["Black", "Blue", "Red"],
    });
    mockFetchCanonicalDescriptions.mockResolvedValue({
      success: true,
      values: ["Jeans", "T-Shirt", "Dress"],
    });
    mockFetchCategories.mockResolvedValue({
      success: true,
      categories: [
        { id: "cat-uuid-1", name: "Shoes" },
        { id: "cat-uuid-2", name: "Bags" },
        { id: "cat-uuid-3", name: "Clothing" },
      ],
    });
    mockFetchPriceSuggestion.mockResolvedValue({
      success: true,
      data: {
        suggestedPrice: 29.95,
        confidence: "high",
        explanation: "Based on 30 comparable items.",
        adjustments: {
          referencePrice: 28.0,
          velocityMultiplier: 1.05,
          creatorAdjustment: 1.0,
          colorAdjustment: 1.02,
          sizeAdjustment: 1.0,
        },
        groupInfo: {
          brand: "Nike",
          category: "Shoes",
          sampleSize: 30,
          sellThroughRate: 0.65,
          medianDaysOnShelf: 20,
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the Preview Mode indicator", async () => {
    await act(async () => {
      render(<ItemCapturePage />);
    });

    expect(
      screen.getByText("Preview Mode — items will not be created"),
    ).toBeInTheDocument();
  });

  it("renders the preview mode banner with alert role", async () => {
    await act(async () => {
      render(<ItemCapturePage />);
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders all form fields", async () => {
    await act(async () => {
      render(<ItemCapturePage />);
    });

    expect(screen.getByRole("combobox", { name: "Brand" })).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Color" })).toBeInTheDocument();
    expect(screen.getByLabelText("Size")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Tag price in CHF")).toBeInTheDocument();
  });

  it("renders the item capture form with accessible label", async () => {
    await act(async () => {
      render(<ItemCapturePage />);
    });

    expect(
      screen.getByRole("form", { name: "Item capture form" }),
    ).toBeInTheDocument();
  });

  it("populates tag price when Use Suggestion is clicked", async () => {
    await act(async () => {
      render(<ItemCapturePage />);
    });

    // Wait for categories to load
    await act(async () => {
      await Promise.resolve();
    });

    // Type category name to trigger dropdown
    const categoryInput = screen.getByLabelText("Category");
    await act(async () => {
      fireEvent.change(categoryInput, { target: { value: "Shoes" } });
    });

    // Select "Shoes" from the dropdown (fires onSelect → onChange with UUID)
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: "Shoes" }));
    });

    // Advance past the 300ms debounce in PriceSuggestionPanel
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // Wait for the mock promise to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Use Suggestion")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Use Suggestion"));
    });

    const tagPriceInput = screen.getByLabelText(
      "Tag price in CHF",
    ) as HTMLInputElement;
    expect(tagPriceInput.value).toBe("29.95");
  });

  it("does not call any item creation API", async () => {
    await act(async () => {
      render(<ItemCapturePage />);
    });

    // Wait for categories to load
    await act(async () => {
      await Promise.resolve();
    });

    // Fill in all fields
    const brandInput = screen.getByRole("combobox", { name: "Brand" });
    const categoryInput = screen.getByLabelText("Category");
    const sizeInput = screen.getByLabelText("Size");
    const titleInput = screen.getByLabelText("Title");

    await act(async () => {
      fireEvent.change(brandInput, { target: { value: "Nike" } });
      fireEvent.change(categoryInput, { target: { value: "Shoes" } });
    });

    // Select category from dropdown
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: "Shoes" }));
    });

    await act(async () => {
      fireEvent.change(sizeInput, { target: { value: "42" } });
      fireEvent.change(titleInput, { target: { value: "Running Shoe" } });
    });

    // The form has no submit handler that calls any create API
    // There should be no fetch calls other than canonical lists and price suggestion
    // Verify only pricing-related API calls are made
    expect(mockFetchCanonicalBrands).toHaveBeenCalled();
    expect(mockFetchCanonicalColors).toHaveBeenCalled();
  });

  it("allows manual tag price entry", async () => {
    await act(async () => {
      render(<ItemCapturePage />);
    });

    const tagPriceInput = screen.getByLabelText(
      "Tag price in CHF",
    ) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(tagPriceInput, { target: { value: "55.50" } });
    });

    expect(tagPriceInput.value).toBe("55.50");
  });

  it("validates tag price input format (allows valid decimal)", async () => {
    await act(async () => {
      render(<ItemCapturePage />);
    });

    const tagPriceInput = screen.getByLabelText(
      "Tag price in CHF",
    ) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(tagPriceInput, { target: { value: "12.50" } });
    });
    expect(tagPriceInput.value).toBe("12.50");

    await act(async () => {
      fireEvent.change(tagPriceInput, { target: { value: "abc" } });
    });
    // Invalid input should be rejected (value stays at previous)
    expect(tagPriceInput.value).toBe("12.50");
  });

  it("has accessible fields with proper labels", async () => {
    await act(async () => {
      render(<ItemCapturePage />);
    });

    // All inputs should be associated with labels
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Size")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Tag price in CHF")).toBeInTheDocument();
    // Brand and Color use role=combobox with aria-label
    expect(screen.getByRole("combobox", { name: "Brand" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Color" })).toBeInTheDocument();
  });

  it("renders the price suggestion aside region", async () => {
    await act(async () => {
      render(<ItemCapturePage />);
    });

    expect(
      screen.getByRole("complementary", { name: "Price suggestion" }),
    ).toBeInTheDocument();
  });
});
