export interface PriceSuggestionResponse {
  suggestedPrice: number | null;
  confidence: "high" | "medium" | "low" | null;
  explanation: string;
  adjustments: {
    referencePrice: number;
    velocityMultiplier: number;
    creatorAdjustment: number;
    colorAdjustment: number;
    sizeAdjustment: number;
  } | null;
  groupInfo: {
    brand: string | null;
    category: string | null;
    sampleSize: number;
    sellThroughRate: number;
    medianDaysOnShelf: number;
  } | null;
}

export interface AdjustmentEvent {
  id: string;
  brand: string;
  category: string;
  previousPrice: number;
  newPrice: number;
  direction: "increase" | "decrease";
  percentageChange: number;
  reason: string;
  metrics: {
    sellThroughRate: number;
    medianDaysOnShelf: number;
    sampleSize: number;
    discountFrequency: number;
    priceRatio: number;
  };
  timestamp: string;
}

export interface AdjustmentListResponse {
  adjustments: AdjustmentEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AdjustmentFilters {
  direction?: "increase" | "decrease";
  brand?: string;
  category?: string;
  fromDate?: string;
  toDate?: string;
}

export type PriceSuggestionResult =
  | { success: true; data: PriceSuggestionResponse }
  | { success: false; error: "network" | "server" | "timeout" };

export type AdjustmentListResult =
  | { success: true; data: AdjustmentListResponse }
  | { success: false; error: "network" | "server" | "timeout" };

export type TriggerAggregationResult =
  | { success: true }
  | { success: false; error: "network" | "server" | "timeout" };

export type CanonicalListResult =
  | { success: true; values: string[] }
  | { success: false; error: "network" | "server" | "timeout" };
