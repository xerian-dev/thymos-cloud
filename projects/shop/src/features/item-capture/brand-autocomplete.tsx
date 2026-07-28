import * as React from "react";
import { AutocompleteInput } from "@/components/shared/autocomplete-input";
import { fetchCanonicalBrands } from "../pricing/pricing-api";

export interface BrandAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Compute the Levenshtein distance between two strings.
 * Used for "Did you mean?" fuzzy matching suggestions.
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 0;
  if (aLower.length === 0) return bLower.length;
  if (bLower.length === 0) return aLower.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= aLower.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= aLower.length; i++) {
    for (let j = 1; j <= bLower.length; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[aLower.length][bLower.length];
}

/**
 * Find a fuzzy match from the canonical brands list.
 * Returns the canonical brand if Levenshtein distance <= 2 and the input
 * doesn't already exactly match (case-insensitive).
 */
function findFuzzyMatch(
  input: string,
  brands: string[],
): string | null {
  if (!input.trim()) return null;

  const inputLower = input.toLowerCase();

  // Don't suggest if already an exact match
  const hasExactMatch = brands.some(
    (brand) => brand.toLowerCase() === inputLower,
  );
  if (hasExactMatch) return null;

  let bestMatch: string | null = null;
  let bestDistance = 3; // threshold: <= 2

  for (const brand of brands) {
    const distance = levenshteinDistance(input, brand);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = brand;
    }
  }

  return bestMatch;
}

export function BrandAutocomplete({
  value,
  onChange,
  disabled = false,
  className,
}: BrandAutocompleteProps): React.ReactNode {
  const [brands, setBrands] = React.useState<string[]>([]);
  const [fuzzySuggestion, setFuzzySuggestion] = React.useState<string | null>(
    null,
  );
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    async function loadBrands(): Promise<void> {
      const result = await fetchCanonicalBrands(controller.signal);
      if (result.success) {
        setBrands(result.values);
      }
    }

    loadBrands();

    return () => {
      controller.abort();
    };
  }, []);

  React.useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!value.trim() || brands.length === 0) {
      setFuzzySuggestion(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const match = findFuzzyMatch(value, brands);
      setFuzzySuggestion(match);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, brands]);

  function handleChange(newValue: string): void {
    onChange(newValue);
  }

  function handleUseSuggestion(): void {
    if (fuzzySuggestion) {
      onChange(fuzzySuggestion);
      setFuzzySuggestion(null);
    }
  }

  return (
    <div className={className}>
      <AutocompleteInput
        items={brands}
        value={value}
        onChange={handleChange}
        aria-label="Brand"
        placeholder="Enter brand name"
        disabled={disabled}
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
