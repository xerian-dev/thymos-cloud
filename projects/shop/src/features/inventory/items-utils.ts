/**
 * Format a numeric value as CHF currency with exactly 2 decimal places.
 * Uses standard decimal notation (no scientific notation, no locale-specific formatting).
 *
 * @param value - Non-negative number to format
 * @returns String in the format "CHF X.XX"
 */
export function formatChf(value: number): string {
  return `CHF ${value.toFixed(2)}`;
}
