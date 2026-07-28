import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrandAutocomplete, levenshteinDistance } from "./brand-autocomplete";

vi.mock("../pricing/pricing-api", () => ({
  fetchCanonicalBrands: vi.fn(),
}));

import { fetchCanonicalBrands } from "../pricing/pricing-api";

const mockFetchCanonicalBrands = vi.mocked(fetchCanonicalBrands);

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("Nike", "Nike")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(levenshteinDistance("nike", "Nike")).toBe(0);
  });

  it("returns correct distance for single character difference", () => {
    expect(levenshteinDistance("Nik", "Nike")).toBe(1);
  });

  it("returns correct distance for two character differences", () => {
    expect(levenshteinDistance("Nke", "Nike")).toBe(1);
    expect(levenshteinDistance("Nk", "Nike")).toBe(2);
  });

  it("returns length for empty string comparison", () => {
    expect(levenshteinDistance("", "Nike")).toBe(4);
    expect(levenshteinDistance("Nike", "")).toBe(4);
  });
});

describe("BrandAutocomplete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetchCanonicalBrands.mockImplementation(() =>
      Promise.resolve({
        success: true as const,
        values: ["Nike", "Adidas", "Puma", "Gucci", "Prada"],
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders the autocomplete input", async () => {
    await act(async () => {
      render(<BrandAutocomplete value="" onChange={vi.fn()} />);
    });

    expect(screen.getByRole("combobox", { name: "Brand" })).toBeInTheDocument();
  });

  it("fetches canonical brands on mount", async () => {
    await act(async () => {
      render(<BrandAutocomplete value="" onChange={vi.fn()} />);
    });

    expect(mockFetchCanonicalBrands).toHaveBeenCalledTimes(1);
  });

  it("filters brands by prefix match (case-insensitive)", async () => {
    const onChange = vi.fn();

    await act(async () => {
      render(<BrandAutocomplete value="ni" onChange={onChange} />);
    });

    const input = screen.getByRole("combobox", { name: "Brand" });

    await act(async () => {
      fireEvent.focus(input);
    });

    expect(screen.getByRole("option", { name: "Nike" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Adidas" }),
    ).not.toBeInTheDocument();
  });

  it("allows free-text entry (not restricted to list)", async () => {
    const onChange = vi.fn();

    await act(async () => {
      render(<BrandAutocomplete value="Unknown Brand" onChange={onChange} />);
    });

    const input = screen.getByRole("combobox", { name: "Brand" });

    await act(async () => {
      fireEvent.change(input, { target: { value: "My Custom Brand" } });
    });

    expect(onChange).toHaveBeenCalledWith("My Custom Brand");
  });

  it("shows fuzzy suggestion when input is close to a canonical brand", async () => {
    await act(async () => {
      render(<BrandAutocomplete value="Nke" onChange={vi.fn()} />);
    });

    // Advance the debounce timer
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByText(/Did you mean/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nike" })).toBeInTheDocument();
  });

  it("does not show fuzzy suggestion for exact match", async () => {
    await act(async () => {
      render(<BrandAutocomplete value="Nike" onChange={vi.fn()} />);
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
  });

  it("does not show fuzzy suggestion when distance > 2", async () => {
    await act(async () => {
      render(<BrandAutocomplete value="Xyz" onChange={vi.fn()} />);
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
  });

  it("clicking the fuzzy suggestion updates the value", async () => {
    const onChange = vi.fn();

    await act(async () => {
      render(<BrandAutocomplete value="Nke" onChange={onChange} />);
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByRole("button", { name: "Nike" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nike" }));
    });

    expect(onChange).toHaveBeenCalledWith("Nike");
  });

  it("disables input when disabled prop is true", async () => {
    await act(async () => {
      render(<BrandAutocomplete value="" onChange={vi.fn()} disabled />);
    });

    expect(screen.getByRole("combobox", { name: "Brand" })).toBeDisabled();
  });

  it("degrades gracefully when brand fetch fails", async () => {
    mockFetchCanonicalBrands.mockImplementation(() =>
      Promise.resolve({
        success: false as const,
        error: "network" as const,
      }),
    );

    const onChange = vi.fn();

    await act(async () => {
      render(<BrandAutocomplete value="test" onChange={onChange} />);
    });

    // Should still render as a functional text input
    const input = screen.getByRole("combobox", { name: "Brand" });
    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(input, { target: { value: "Custom" } });
    });

    expect(onChange).toHaveBeenCalledWith("Custom");
  });
});
