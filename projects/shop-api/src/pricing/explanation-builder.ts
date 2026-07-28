export interface ExplanationInput {
  referenceSource: "brand_category" | "category_only";
  brand: string | null;
  category: string;
  sampleSize: number;
  velocityMultiplier: number; // 1.0 = no adjustment
  creatorAdjustment: number; // 1.0 = no adjustment
  colorAdjustment: number; // 1.0 = no adjustment
  sizeAdjustment: number; // 1.0 = no adjustment
  noData: boolean; // true if no pricing data available
}

export function buildExplanation(params: ExplanationInput): string {
  if (params.noData) {
    return "No pricing data available for this category";
  }

  const parts: string[] = [];

  // Reference source description
  if (params.referenceSource === "brand_category") {
    parts.push(
      `Based on ${params.sampleSize} sold items in ${params.brand} × ${params.category}`
    );
  } else {
    parts.push(
      `Based on ${params.sampleSize} sold items in category ${params.category} (insufficient brand-specific data)`
    );
  }

  // Velocity adjustment description
  if (params.velocityMultiplier !== 1.0) {
    const pct = Math.abs(Math.round((params.velocityMultiplier - 1.0) * 100));
    if (params.velocityMultiplier < 1.0) {
      parts.push(`Reduced ${pct}% due to poor sell-through in this group`);
    } else {
      parts.push(`Increased ${pct}% due to strong sell-through in this group`);
    }
  }

  // Creator adjustment description
  if (params.creatorAdjustment !== 1.0) {
    const direction =
      params.creatorAdjustment < 1.0 ? "downward" : "upward";
    parts.push(
      `Creator's historical pricing tendency factored in (${direction} adjustment)`
    );
  }

  // Color adjustment description
  if (params.colorAdjustment !== 1.0) {
    parts.push("Color adjustment applied");
  }

  // Size adjustment description
  if (params.sizeAdjustment !== 1.0) {
    parts.push("Size adjustment applied");
  }

  return parts.join(". ") + ".";
}
