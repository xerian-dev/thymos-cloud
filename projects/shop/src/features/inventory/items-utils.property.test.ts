import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { formatChf } from "./items-utils";

/**
 * Feature: item-creation, Property 11: CHF currency formatting
 *
 * For any non-negative number with at most 2 decimal places, formatChf produces
 * "CHF X.XX" with exactly 2 decimal digits.
 *
 * Validates: Requirements 12.4
 */

describe("Feature: item-creation, Property 11: CHF currency formatting", () => {
  it("produces 'CHF X.XX' with exactly 2 decimal digits for any non-negative number with at most 2 decimal places", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99999999 }).map((n: number) => n / 100),
        (value: number) => {
          const result = formatChf(value);

          // Starts with "CHF "
          expect(result.startsWith("CHF ")).toBe(true);

          // Extract the numeric part after "CHF "
          const numericPart = result.slice(4);

          // Has exactly 2 decimal digits
          expect(numericPart).toMatch(/^\d+\.\d{2}$/);

          // No scientific notation (no "e" in the output)
          expect(result.toLowerCase()).not.toContain("e");

          // The numeric value matches the input
          expect(parseFloat(numericPart)).toBe(value);
        },
      ),
      { numRuns: 100 },
    );
  });
});
