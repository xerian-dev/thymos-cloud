import * as React from "react";
import { AutocompleteInput } from "@/components/shared/autocomplete-input";
import { fetchCanonicalColors } from "../pricing/pricing-api";

export interface ColorAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ColorAutocomplete({
  value,
  onChange,
  disabled = false,
  className,
}: ColorAutocompleteProps): React.ReactNode {
  const [colors, setColors] = React.useState<string[]>([]);

  React.useEffect(() => {
    const controller = new AbortController();

    fetchCanonicalColors(controller.signal).then((result) => {
      if (result.success) {
        setColors(result.values);
      }
    });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <AutocompleteInput
      items={colors}
      value={value}
      onChange={onChange}
      placeholder="Color"
      disabled={disabled}
      className={className}
      aria-label="Color"
    />
  );
}
