import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { formatShopUid } from "./accounts-utils";

/**
 * Feature: accounts-page, Property 1: Shop UID formatting preserves numeric value and produces fixed-width output
 *
 * For any integer N in the range [1, 9999999], `formatShopUid(N)` SHALL produce a string
 * of exactly 7 characters, consisting only of digit characters, whose numeric value equals N.
 *
 * Validates: Requirements 2.3, 5.4
 */

describe("Feature: accounts-page, Property 1: Shop UID formatting preserves numeric value and produces fixed-width output", () => {
  it("produces exactly 7 characters, all digits, with numeric value equal to input", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999999 }), (n: number) => {
        const result = formatShopUid(n);

        // Output is exactly 7 characters
        expect(result).toHaveLength(7);

        // All characters are digits (0-9)
        expect(result).toMatch(/^[0-9]{7}$/);

        // Numeric value equals the input
        expect(parseInt(result, 10)).toBe(n);
      }),
      { numRuns: 100 },
    );
  });
});
