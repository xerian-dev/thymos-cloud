import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  capDecrease,
  capIncrease,
  shouldAllowIncrease,
} from "../../src/pricing/adjustment-caps.js";

/**
 * Feature: auto-tag-price, Properties 3 & 4: Adjustment cap enforcement
 *
 * **Validates: Requirements 7.4, 7.5, 7.6, 7.7**
 *
 * Property 3 (decrease cap): For any previousPrice > 0 and newPrice < previousPrice
 * and originalBaseline > 0:
 *   - capDecrease(previousPrice, newPrice, originalBaseline) >= previousPrice * 0.85
 *   - capDecrease(previousPrice, newPrice, originalBaseline) >= originalBaseline * 0.70
 *
 * Property 4 (increase cap): For any previousPrice > 0 and newPrice > previousPrice:
 *   - capIncrease(previousPrice, newPrice) <= previousPrice * 1.10
 *   - The result is always >= previousPrice (never decreases)
 */
describe("Adjustment cap properties", () => {
  describe("Property 3: Decrease cap enforcement", () => {
    it("capped decrease is always >= previousPrice * 0.85 (max 15% per cycle)", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          (previousPrice: number, rawNewPrice: number, originalBaseline: number) => {
            // Ensure newPrice < previousPrice (decrease scenario)
            const newPrice = Math.min(rawNewPrice, previousPrice * 0.99);
            if (newPrice <= 0) return; // skip degenerate cases

            const result = capDecrease(previousPrice, newPrice, originalBaseline);
            const perCycleFloor = previousPrice * 0.85;
            expect(result).toBeGreaterThanOrEqual(perCycleFloor - 1e-9);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("capped decrease is always >= originalBaseline * 0.70 (max 30% cumulative)", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          (previousPrice: number, rawNewPrice: number, originalBaseline: number) => {
            // Ensure newPrice < previousPrice (decrease scenario)
            const newPrice = Math.min(rawNewPrice, previousPrice * 0.99);
            if (newPrice <= 0) return; // skip degenerate cases

            const result = capDecrease(previousPrice, newPrice, originalBaseline);
            const cumulativeFloor = originalBaseline * 0.70;
            expect(result).toBeGreaterThanOrEqual(cumulativeFloor - 1e-9);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("capped decrease is always >= the newPrice itself (never makes price worse)", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          (previousPrice: number, rawNewPrice: number, originalBaseline: number) => {
            const newPrice = Math.min(rawNewPrice, previousPrice * 0.99);
            if (newPrice <= 0) return;

            const result = capDecrease(previousPrice, newPrice, originalBaseline);
            expect(result).toBeGreaterThanOrEqual(newPrice - 1e-9);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Property 4: Increase cap enforcement", () => {
    it("capped increase is always <= previousPrice * 1.10 (max 10% per cycle)", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          (previousPrice: number, rawNewPrice: number) => {
            // Ensure newPrice > previousPrice (increase scenario)
            const newPrice = Math.max(rawNewPrice, previousPrice * 1.01);

            const result = capIncrease(previousPrice, newPrice);
            const perCycleCeiling = previousPrice * 1.10;
            expect(result).toBeLessThanOrEqual(perCycleCeiling + 1e-9);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("capped increase never decreases the price (result >= previousPrice)", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
          (previousPrice: number, rawNewPrice: number) => {
            // Ensure newPrice > previousPrice (increase scenario)
            const newPrice = Math.max(rawNewPrice, previousPrice * 1.01);

            const result = capIncrease(previousPrice, newPrice);
            expect(result).toBeGreaterThanOrEqual(previousPrice - 1e-9);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("shouldAllowIncrease conditions", () => {
    it("returns true only when ALL conditions are simultaneously met", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 3, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 60, noNaN: true, noDefaultInfinity: true }),
          fc.integer({ min: 0, max: 100 }),
          (sellThrough: number, priceRatio: number, medianDaysOnShelf: number, sampleSize: number) => {
            const result = shouldAllowIncrease(sellThrough, priceRatio, medianDaysOnShelf, sampleSize);

            const allConditionsMet =
              sellThrough > 0.80 &&
              priceRatio >= 1.0 &&
              medianDaysOnShelf < 14 &&
              sampleSize >= 10;

            expect(result).toBe(allConditionsMet);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("returns false when any single condition is not met", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            // Fail sell-through condition only
            { sellThrough: 0.5, priceRatio: 1.2, medianDaysOnShelf: 7, sampleSize: 20 },
            // Fail price ratio condition only
            { sellThrough: 0.9, priceRatio: 0.8, medianDaysOnShelf: 7, sampleSize: 20 },
            // Fail days-on-shelf condition only
            { sellThrough: 0.9, priceRatio: 1.2, medianDaysOnShelf: 20, sampleSize: 20 },
            // Fail sample size condition only
            { sellThrough: 0.9, priceRatio: 1.2, medianDaysOnShelf: 7, sampleSize: 5 },
          ),
          ({ sellThrough, priceRatio, medianDaysOnShelf, sampleSize }) => {
            const result = shouldAllowIncrease(sellThrough, priceRatio, medianDaysOnShelf, sampleSize);
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
