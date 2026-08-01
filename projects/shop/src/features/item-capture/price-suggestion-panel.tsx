import * as React from "react";
import { fetchPriceSuggestion } from "@/features/pricing/pricing-api";
import type { PriceSuggestionResponse } from "@/features/pricing/pricing-types";

export interface PriceSuggestionPanelProps {
  brand: string;
  categoryId: string;
  description: string;
  color: string;
  size: string;
  createdBy?: string;
  onUseSuggestion: (price: number) => void;
}

type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "suggestion"; data: PriceSuggestionResponse }
  | { status: "no-data" }
  | { status: "error" };

function formatPrice(price: number): string {
  return `CHF ${price.toFixed(2)}`;
}

function getConfidenceBadgeClasses(
  confidence: "high" | "medium" | "low",
): string {
  switch (confidence) {
    case "high":
      return "bg-green-100 text-green-800";
    case "medium":
      return "bg-amber-100 text-amber-800";
    case "low":
      return "bg-gray-100 text-gray-600";
  }
}

export function PriceSuggestionPanel({
  brand,
  categoryId,
  description,
  color,
  size,
  createdBy,
  onUseSuggestion,
}: PriceSuggestionPanelProps): React.ReactNode {
  const [state, setState] = React.useState<PanelState>({ status: "idle" });

  React.useEffect(() => {
    if (!categoryId && !description) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      fetchPriceSuggestion(
        {
          brand: brand || undefined,
          categoryId: categoryId || undefined,
          description: description || undefined,
          color: color || undefined,
          size: size || undefined,
          createdBy,
        },
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted) {
            return;
          }
          if (!result.success) {
            setState({ status: "error" });
            return;
          }
          if (result.data.suggestedPrice === null) {
            setState({ status: "no-data" });
            return;
          }
          setState({ status: "suggestion", data: result.data });
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          setState({ status: "error" });
        });
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [brand, categoryId, description, color, size, createdBy]);

  if (state.status === "idle") {
    return null;
  }

  if (state.status === "loading") {
    return (
      <div
        className="rounded-md border border-border p-4"
        aria-label="Loading price suggestion"
        aria-busy="true"
      >
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="h-3 w-48 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (state.status === "no-data") {
    return (
      <div className="rounded-md border border-border p-4">
        <p className="text-sm text-muted-foreground">
          No pricing data available
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-md border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Unable to load suggestion
        </p>
      </div>
    );
  }

  const { suggestedPrice, confidence, explanation } = state.data;

  return (
    <div className="rounded-md border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-foreground">
          {formatPrice(suggestedPrice!)}
        </span>
        {confidence && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getConfidenceBadgeClasses(confidence)}`}
          >
            {confidence}
          </span>
        )}
      </div>

      {explanation && (
        <p className="text-sm text-muted-foreground">{explanation}</p>
      )}

      <button
        type="button"
        onClick={() => onUseSuggestion(suggestedPrice!)}
        className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Use Suggestion
      </button>
    </div>
  );
}
