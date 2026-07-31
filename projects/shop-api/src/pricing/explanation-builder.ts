export interface ExplanationInput {
  fallbackLevel: number; // 1-6
  source: "sold" | "unsold";
  brand: string | null;
  category: string;
  description: string | null;
  sampleSize: number;
  unsoldCount: number;
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

  // Opening text based on fallback level
  parts.push(buildOpeningText(params));

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
    const direction = params.creatorAdjustment < 1.0 ? "downward" : "upward";
    parts.push(
      `Creator's historical pricing tendency factored in (${direction} adjustment)`,
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

function buildOpeningText(params: ExplanationInput): string {
  switch (params.fallbackLevel) {
    case 1:
      return `Based on ${params.sampleSize} sold items in ${params.brand} × ${params.description}`;
    case 2:
      return `Based on ${params.sampleSize} sold items matching description '${params.description}' (insufficient brand-specific data)`;
    case 3:
      return `Based on ${params.sampleSize} sold items in ${params.brand} × ${params.category}`;
    case 4:
      return `Based on ${params.sampleSize} sold items in category ${params.category} (insufficient brand-specific data)`;
    case 5:
      return `Based on ${params.unsoldCount} unsold items in ${params.brand} × ${params.description}. No items in this group have sold yet`;
    case 6:
      return `Based on ${params.unsoldCount} unsold items matching description '${params.description}'. No items in this group have sold yet`;
    default:
      return `Based on ${params.sampleSize} sold items in ${params.brand} × ${params.category}`;
  }
}
