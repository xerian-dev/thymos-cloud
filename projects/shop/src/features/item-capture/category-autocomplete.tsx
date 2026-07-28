import * as React from "react";
import { AutocompleteInput } from "@/components/shared/autocomplete-input";
import { fetchCategories } from "./categories-api";
import type { CategoryOption } from "./categories-api";

export interface CategoryAutocompleteProps {
  value: string;
  onChange: (uuid: string) => void;
  disabled?: boolean;
  className?: string;
}

export function CategoryAutocomplete({
  value,
  onChange,
  disabled = false,
  className,
}: CategoryAutocompleteProps): React.ReactNode {
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [inputText, setInputText] = React.useState("");

  const nameToId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.name, cat.id);
    }
    return map;
  }, [categories]);

  const idToName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  const names = React.useMemo(
    () => categories.map((c) => c.name),
    [categories],
  );

  // Sync inputText when the value prop changes externally (e.g. form reset)
  React.useEffect(() => {
    if (value) {
      const name = idToName.get(value);
      if (name) {
        setInputText(name);
      }
    } else {
      setInputText("");
    }
  }, [value, idToName]);

  React.useEffect(() => {
    const controller = new AbortController();

    fetchCategories(controller.signal).then((result) => {
      if (result.success) {
        setCategories(result.categories);
      }
    });

    return () => {
      controller.abort();
    };
  }, []);

  function handleChange(text: string): void {
    setInputText(text);
    // If text matches a category name exactly, commit the UUID
    const id = nameToId.get(text);
    if (id) {
      onChange(id);
    } else if (value) {
      // User is editing away from a valid selection — clear the UUID
      onChange("");
    }
  }

  function handleSelect(name: string): void {
    const id = nameToId.get(name);
    if (id) {
      setInputText(name);
      onChange(id);
    }
  }

  return (
    <AutocompleteInput
      items={names}
      value={inputText}
      onChange={handleChange}
      onSelect={handleSelect}
      placeholder="Select category"
      disabled={disabled}
      className={className}
      aria-label="Category"
    />
  );
}
