import * as React from "react";
import { AutocompleteInput } from "@/components/shared/autocomplete-input";
import { findFuzzyMatch } from "@/lib/levenshtein";
import { fetchCanonicalDescriptions } from "../pricing/pricing-api";

export interface DescriptionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

function substringFilter(item: string, query: string): boolean {
  return item.toLowerCase().includes(query.toLowerCase());
}

export function DescriptionAutocomplete({
  value,
  onChange,
  disabled = false,
  className,
}: DescriptionAutocompleteProps): React.ReactNode {
  const [descriptions, setDescriptions] = React.useState<string[]>([]);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [fuzzySuggestion, setFuzzySuggestion] = React.useState<string | null>(
    null,
  );
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    fetchCanonicalDescriptions(controller.signal).then((result) => {
      if (result.success) {
        setDescriptions(result.values);
      } else {
        setLoadFailed(true);
      }
    });

    return () => {
      controller.abort();
    };
  }, []);

  React.useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!value.trim() || descriptions.length === 0) {
      setFuzzySuggestion(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const match = findFuzzyMatch(value, descriptions);
      setFuzzySuggestion(match);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, descriptions]);

  function handleChange(newValue: string): void {
    onChange(newValue);
  }

  function handleUseSuggestion(): void {
    if (fuzzySuggestion) {
      onChange(fuzzySuggestion);
      setFuzzySuggestion(null);
    }
  }

  if (loadFailed) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Description"
        aria-label="Description"
        disabled={disabled}
        className="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    );
  }

  return (
    <div className={className}>
      <AutocompleteInput
        items={descriptions}
        value={value}
        onChange={handleChange}
        filterFn={substringFilter}
        placeholder="Description"
        disabled={disabled}
        aria-label="Description"
      />
      {fuzzySuggestion && (
        <p className="mt-1 text-sm text-muted-foreground">
          Did you mean{" "}
          <button
            type="button"
            onClick={handleUseSuggestion}
            className="cursor-pointer font-medium text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {fuzzySuggestion}
          </button>
          ?
        </p>
      )}
    </div>
  );
}
