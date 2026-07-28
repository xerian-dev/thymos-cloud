import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ColorAutocomplete } from "./color-autocomplete";

vi.mock("../pricing/pricing-api", () => ({
  fetchCanonicalColors: vi.fn(),
}));

import { fetchCanonicalColors } from "../pricing/pricing-api";

const mockFetchCanonicalColors = vi.mocked(fetchCanonicalColors);

const MOCK_COLORS = ["Black", "Blue", "Brown", "Green", "Red", "White"];

describe("ColorAutocomplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCanonicalColors.mockResolvedValue({
      success: true,
      values: MOCK_COLORS,
    });
  });

  it("fetches canonical colors on mount", async () => {
    render(<ColorAutocomplete value="" onChange={vi.fn()} />);

    await waitFor(() => {
      expect(mockFetchCanonicalColors).toHaveBeenCalledTimes(1);
    });
  });

  it("renders an input with Color placeholder", () => {
    render(<ColorAutocomplete value="" onChange={vi.fn()} />);

    expect(screen.getByPlaceholderText("Color")).toBeInTheDocument();
  });

  it("displays filtered suggestions matching input prefix", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorAutocomplete value="" onChange={onChange} />,
    );

    await waitFor(() => {
      expect(mockFetchCanonicalColors).toHaveBeenCalled();
    });

    rerender(<ColorAutocomplete value="Bl" onChange={onChange} />);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    expect(screen.getByText("Black")).toBeInTheDocument();
    expect(screen.getByText("Blue")).toBeInTheDocument();
    expect(screen.queryByText("Red")).not.toBeInTheDocument();
    expect(screen.queryByText("Green")).not.toBeInTheDocument();
  });

  it("allows free-text entry not in the list", async () => {
    const onChange = vi.fn();
    render(<ColorAutocomplete value="" onChange={onChange} />);

    await waitFor(() => {
      expect(mockFetchCanonicalColors).toHaveBeenCalled();
    });

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Magenta" } });

    expect(onChange).toHaveBeenCalledWith("Magenta");
  });

  it("calls onChange when a suggestion is clicked", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorAutocomplete value="" onChange={onChange} />,
    );

    await waitFor(() => {
      expect(mockFetchCanonicalColors).toHaveBeenCalled();
    });

    rerender(<ColorAutocomplete value="Re" onChange={onChange} />);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    const option = screen.getByText("Red");
    fireEvent.mouseDown(option);

    expect(onChange).toHaveBeenCalledWith("Red");
  });

  it("degrades gracefully when fetch fails", async () => {
    mockFetchCanonicalColors.mockResolvedValue({
      success: false,
      error: "network",
    });

    render(<ColorAutocomplete value="test" onChange={vi.fn()} />);

    await waitFor(() => {
      expect(mockFetchCanonicalColors).toHaveBeenCalled();
    });

    const input = screen.getByRole("combobox");
    expect(input).toBeInTheDocument();
  });

  it("supports keyboard navigation", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorAutocomplete value="" onChange={onChange} />,
    );

    await waitFor(() => {
      expect(mockFetchCanonicalColors).toHaveBeenCalled();
    });

    rerender(<ColorAutocomplete value="B" onChange={onChange} />);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    // Arrow down to first item (Black)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Select with Enter
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("Black");
  });

  it("dismisses dropdown on Escape", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorAutocomplete value="" onChange={onChange} />,
    );

    await waitFor(() => {
      expect(mockFetchCanonicalColors).toHaveBeenCalled();
    });

    rerender(<ColorAutocomplete value="B" onChange={onChange} />);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("disables the input when disabled prop is true", () => {
    render(<ColorAutocomplete value="" onChange={vi.fn()} disabled />);

    const input = screen.getByRole("combobox");
    expect(input).toBeDisabled();
  });

  it("passes className through", () => {
    const { container } = render(
      <ColorAutocomplete
        value=""
        onChange={vi.fn()}
        className="custom-class"
      />,
    );

    expect(container.firstChild).toHaveClass("custom-class");
  });
});
