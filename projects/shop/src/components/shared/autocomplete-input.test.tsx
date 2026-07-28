import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AutocompleteInput } from "./autocomplete-input";

const brands = ["Nike", "Adidas", "New Balance", "North Face", "Puma"];

describe("AutocompleteInput", () => {
  it("renders the input with correct ARIA attributes", () => {
    render(
      <AutocompleteInput
        items={brands}
        value=""
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Brand" });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
  });

  it("shows dropdown when input has matching items and is focused", () => {
    render(
      <AutocompleteInput
        items={brands}
        value="Ni"
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Nike" })).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("filters items using case-insensitive prefix match by default", () => {
    render(
      <AutocompleteInput
        items={brands}
        value="n"
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3); // Nike, New Balance, North Face
  });

  it("does not show dropdown when no items match", () => {
    render(
      <AutocompleteInput
        items={brands}
        value="xyz"
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("does not show dropdown when value is empty", () => {
    render(
      <AutocompleteInput
        items={brands}
        value=""
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("calls onChange when input text changes", () => {
    const handleChange = vi.fn();

    render(
      <AutocompleteInput
        items={brands}
        value=""
        onChange={handleChange}
        onSelect={() => {}}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Pu" } });

    expect(handleChange).toHaveBeenCalledWith("Pu");
  });

  it("calls onSelect when clicking an item", () => {
    const handleSelect = vi.fn();

    render(
      <AutocompleteInput
        items={brands}
        value="Pu"
        onChange={() => {}}
        onSelect={handleSelect}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    const option = screen.getByRole("option", { name: "Puma" });
    fireEvent.mouseDown(option);

    expect(handleSelect).toHaveBeenCalledWith("Puma");
  });

  it("navigates with arrow keys and selects with Enter", () => {
    const handleSelect = vi.fn();

    render(
      <AutocompleteInput
        items={brands}
        value="N"
        onChange={() => {}}
        onSelect={handleSelect}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    // ArrowDown to first item
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(
      screen.getByRole("option", { name: "Nike" }),
    ).toHaveAttribute("aria-selected", "true");

    // ArrowDown to second item
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(
      screen.getByRole("option", { name: "New Balance" }),
    ).toHaveAttribute("aria-selected", "true");

    // Enter to select
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handleSelect).toHaveBeenCalledWith("New Balance");
  });

  it("dismisses dropdown on Escape", () => {
    render(
      <AutocompleteInput
        items={brands}
        value="N"
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes dropdown on blur with delay", async () => {
    render(
      <AutocompleteInput
        items={brands}
        value="N"
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("accepts a custom filter function", () => {
    const customFilter = (item: string, query: string) =>
      item.toLowerCase().includes(query.toLowerCase());

    render(
      <AutocompleteInput
        items={brands}
        value="balance"
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
        filterFn={customFilter}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    expect(
      screen.getByRole("option", { name: "New Balance" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("renders placeholder when provided", () => {
    render(
      <AutocompleteInput
        items={brands}
        value=""
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
        placeholder="Search brands..."
      />,
    );

    expect(screen.getByPlaceholderText("Search brands...")).toBeInTheDocument();
  });

  it("disables the input when disabled prop is true", () => {
    render(
      <AutocompleteInput
        items={brands}
        value=""
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
        disabled
      />,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("does not go past boundaries with arrow keys", () => {
    render(
      <AutocompleteInput
        items={["Nike"]}
        value="N"
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    // ArrowUp when already at -1 (no active item) - should stay at -1
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(
      screen.getByRole("option", { name: "Nike" }),
    ).toHaveAttribute("aria-selected", "false");

    // ArrowDown to first (and only) item
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(
      screen.getByRole("option", { name: "Nike" }),
    ).toHaveAttribute("aria-selected", "true");

    // ArrowDown again - should stay at last item
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(
      screen.getByRole("option", { name: "Nike" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("sets aria-activedescendant when navigating", () => {
    render(
      <AutocompleteInput
        items={brands}
        value="N"
        onChange={() => {}}
        onSelect={() => {}}
        aria-label="Brand"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    // Initially no active descendant
    expect(input).not.toHaveAttribute("aria-activedescendant");

    // ArrowDown sets activedescendant
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant");
  });
});
