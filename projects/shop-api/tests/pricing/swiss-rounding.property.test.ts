import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { roundToSwiss5 } from "../../src/pricing/swiss-rounding.js";

/**
 * Feature: auto-tag-price, Property 1: Swiss rounding
 *
 * Validates: Requirement 5.13
 *
 * For any non-negative number, roundToSwiss5(price) produces a value that:
 * 1. Is a multiple of 0.05 (i.e., result * 20 is an integer, within floating point tolerance)
 * 2. Differs from the input by at most 0.025
 */
describe("Swiss rounding properties", () => {
  it("result is always a multiple of 0.05", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        (price: number) => {
          const result = roundToSwiss5(price);
          const multiple = result * 20;
          expect(Math.abs(multiple - Math.round(multiple))).toBeLessThan(1e-9);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("result differs from input by at most 0.025", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        (price: number) => {
          const result = roundToSwiss5(price);
          expect(Math.abs(result - price)).toBeLessThanOrEqual(0.025 + 1e-9);
        },
      ),
      { numRuns: 100 },
    );
  });
});
