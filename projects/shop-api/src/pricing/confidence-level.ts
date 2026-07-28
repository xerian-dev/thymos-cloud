/**
 * Confidence level classifier for price suggestions.
 *
 * Classifies how much historical data backs a price suggestion
 * based on the number of sold items in the comparable group.
 */

/**
 * Classifies the confidence level of a price suggestion based on sample size.
 *
 * @param sampleSize - The number of sold items in the brand×category group
 * @returns "high" if >= 20, "medium" if 5-19, "low" if < 5
 */
export function classifyConfidence(sampleSize: number): "high" | "medium" | "low" {
  if (sampleSize >= 20) {
    return "high";
  }
  if (sampleSize >= 5) {
    return "medium";
  }
  return "low";
}
