/**
 * Adjustment cap functions for reference price changes.
 *
 * These functions enforce guardrails on how much the pricing aggregator
 * can adjust reference prices in a single cycle:
 * - Decreases: max 15% per cycle, max 30% cumulative from original baseline
 * - Increases: max 10% per cycle, only when strong evidence exists
 */

/**
 * Caps a price decrease to enforce maximum adjustment limits.
 *
 * - Per-cycle cap: the new price cannot drop below 85% of the previous price
 * - Cumulative cap: the new price cannot drop below 70% of the original baseline
 *
 * Returns the maximum of (newPrice, previousPrice * 0.85, originalBaseline * 0.70),
 * ensuring neither cap is violated.
 *
 * @param previousPrice - The reference price from the last cycle
 * @param newPrice - The newly computed reference price (lower than previousPrice)
 * @param originalBaseline - The first-ever computed reference price for this group
 * @returns The capped price, guaranteed >= both floor limits
 */
export function capDecrease(
  previousPrice: number,
  newPrice: number,
  originalBaseline: number,
): number {
  const perCycleFloor = previousPrice * 0.85;
  const cumulativeFloor = originalBaseline * 0.70;
  return Math.max(newPrice, perCycleFloor, cumulativeFloor);
}

/**
 * Caps a price increase to a maximum of 10% per cycle.
 *
 * Returns the minimum of (newPrice, previousPrice * 1.10).
 *
 * @param previousPrice - The reference price from the last cycle
 * @param newPrice - The newly computed reference price (higher than previousPrice)
 * @returns The capped price, guaranteed <= previousPrice * 1.10
 */
export function capIncrease(
  previousPrice: number,
  newPrice: number,
): number {
  const perCycleCeiling = previousPrice * 1.10;
  return Math.min(newPrice, perCycleCeiling);
}

/**
 * Determines whether a price increase should be allowed.
 *
 * An increase is only permitted when ALL of the following conditions are met:
 * - Sell-through rate > 80%
 * - Price ratio >= 1.0 (median sale price >= median tag price)
 * - Median days on shelf < 14
 * - Sample size >= 10 items
 *
 * @param sellThrough - Sell-through rate as a decimal (0-1)
 * @param priceRatio - Ratio of median sale price to median tag price
 * @param medianDaysOnShelf - Median days items spend on shelf before selling
 * @param sampleSize - Number of sold items in the group
 * @returns true if all conditions for a price increase are met
 */
export function shouldAllowIncrease(
  sellThrough: number,
  priceRatio: number,
  medianDaysOnShelf: number,
  sampleSize: number,
): boolean {
  return (
    sellThrough > 0.80 &&
    priceRatio >= 1.0 &&
    medianDaysOnShelf < 14 &&
    sampleSize >= 10
  );
}
