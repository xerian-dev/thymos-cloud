/**
 * Swiss rounding utility.
 *
 * Switzerland does not use 1- or 2-centime coins. All cash prices
 * are rounded to the nearest 5 centimes (CHF 0.05).
 */

/**
 * Rounds a price to the nearest CHF 0.05.
 *
 * @param price - The price in CHF to round
 * @returns The price rounded to the nearest 0.05
 */
export function roundToSwiss5(price: number): number {
  return Math.round(price * 20) / 20;
}
