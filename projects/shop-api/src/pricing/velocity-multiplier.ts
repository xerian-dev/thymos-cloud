/**
 * Velocity multiplier computation.
 *
 * Adjusts the reference price based on sell-through rate to account for
 * market demand. Slow-selling groups get a discount (0.90–0.95), fast-selling
 * groups may get a premium (1.05–1.10) if strict conditions are met.
 */

/**
 * Computes the velocity multiplier based on sell-through rate and supporting metrics.
 *
 * Rules:
 * - sellThroughRate < 0.30 → linear interpolation from 0.90 (at 0.0) to 0.95 (at 0.30)
 * - sellThroughRate 0.30–0.70 → 1.0 (neutral band)
 * - sellThroughRate 0.70–0.80 → 1.0 (transitional band, no adjustment)
 * - sellThroughRate > 0.80 → linear interpolation from 1.05 to 1.10 ONLY IF all conditions met:
 *     - priceRatio >= 1.0 (median sale price >= median tag price)
 *     - medianDaysOnShelf < 14
 *     - sampleSize >= 10
 *   Otherwise returns 1.0
 *
 * @param sellThroughRate - Ratio of sold items to total items (0–1)
 * @param priceRatio - Ratio of median sale price to median tag price
 * @param medianDaysOnShelf - Median days items stay on shelf before selling
 * @param sampleSize - Number of sold items in the group
 * @returns Multiplier in the range [0.90, 1.10]
 */
export function computeVelocityMultiplier(
  sellThroughRate: number,
  priceRatio: number,
  medianDaysOnShelf: number,
  sampleSize: number,
): number {
  if (sellThroughRate < 0.30) {
    // Linear interpolation: at 0.0 → 0.90, at 0.30 → 0.95
    const t = sellThroughRate / 0.30;
    return 0.90 + t * 0.05;
  }

  if (sellThroughRate <= 0.80) {
    // Neutral band (0.30–0.70) and transitional band (0.70–0.80)
    return 1.0;
  }

  // sellThroughRate > 0.80: increase only if all conditions are met
  const conditionsMet =
    priceRatio >= 1.0 && medianDaysOnShelf < 14 && sampleSize >= 10;

  if (!conditionsMet) {
    return 1.0;
  }

  // Linear interpolation: at 0.80 → 1.05, at 1.0 → 1.10
  const t = Math.min((sellThroughRate - 0.80) / 0.20, 1.0);
  return 1.05 + t * 0.05;
}
