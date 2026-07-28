import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeVelocityMultiplier } from "../../src/pricing/velocity-multiplier.js";

/**
 * **Validates: Requirements 5.2, 7.4, 7.5**
 */
describe("Property 2: Velocity multiplier bounds", () => {
  it("output is always in [0.90, 1.10] for any valid inputs", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.double({ min: 0, max: 365, noNaN: true }),
        fc.integer({ min: 0, max: 1000 }),
        (sellThrough, priceRatio, medianDays, sampleSize) => {
          const result = computeVelocityMultiplier(
            sellThrough,
            priceRatio,
            medianDays,
            sampleSize,
          );
          expect(result).toBeGreaterThanOrEqual(0.90);
          expect(result).toBeLessThanOrEqual(1.10);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sellThrough < 0.30 → result in [0.90, 0.95]", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.2999, noNaN: true }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.double({ min: 0, max: 365, noNaN: true }),
        fc.integer({ min: 0, max: 1000 }),
        (sellThrough, priceRatio, medianDays, sampleSize) => {
          const result = computeVelocityMultiplier(
            sellThrough,
            priceRatio,
            medianDays,
            sampleSize,
          );
          expect(result).toBeGreaterThanOrEqual(0.90);
          expect(result).toBeLessThanOrEqual(0.95);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sellThrough in [0.30, 0.70] → result = 1.0", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.30, max: 0.70, noNaN: true }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.double({ min: 0, max: 365, noNaN: true }),
        fc.integer({ min: 0, max: 1000 }),
        (sellThrough, priceRatio, medianDays, sampleSize) => {
          const result = computeVelocityMultiplier(
            sellThrough,
            priceRatio,
            medianDays,
            sampleSize,
          );
          expect(result).toBe(1.0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sellThrough in (0.70, 0.80] → result = 1.0", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.70001, max: 0.80, noNaN: true }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.double({ min: 0, max: 365, noNaN: true }),
        fc.integer({ min: 0, max: 1000 }),
        (sellThrough, priceRatio, medianDays, sampleSize) => {
          const result = computeVelocityMultiplier(
            sellThrough,
            priceRatio,
            medianDays,
            sampleSize,
          );
          expect(result).toBe(1.0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sellThrough > 0.80 with conditions met → result in [1.05, 1.10]", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.80001, max: 1.0, noNaN: true }),
        fc.double({ min: 1.0, max: 5.0, noNaN: true }),
        fc.double({ min: 0, max: 13.99, noNaN: true }),
        fc.integer({ min: 10, max: 1000 }),
        (sellThrough, priceRatio, medianDays, sampleSize) => {
          const result = computeVelocityMultiplier(
            sellThrough,
            priceRatio,
            medianDays,
            sampleSize,
          );
          expect(result).toBeGreaterThanOrEqual(1.05);
          expect(result).toBeLessThanOrEqual(1.10);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sellThrough > 0.80 with conditions NOT met → result = 1.0", () => {
    // Generate inputs where at least one condition is NOT met:
    // priceRatio < 1.0 OR medianDaysOnShelf >= 14 OR sampleSize < 10
    const failedConditionArb = fc.oneof(
      // priceRatio too low
      fc.tuple(
        fc.double({ min: 0.80001, max: 1.0, noNaN: true }),
        fc.double({ min: 0, max: 0.999, noNaN: true }),
        fc.double({ min: 0, max: 13, noNaN: true }),
        fc.integer({ min: 10, max: 1000 }),
      ),
      // medianDaysOnShelf too high
      fc.tuple(
        fc.double({ min: 0.80001, max: 1.0, noNaN: true }),
        fc.double({ min: 1.0, max: 5.0, noNaN: true }),
        fc.double({ min: 14, max: 365, noNaN: true }),
        fc.integer({ min: 10, max: 1000 }),
      ),
      // sampleSize too low
      fc.tuple(
        fc.double({ min: 0.80001, max: 1.0, noNaN: true }),
        fc.double({ min: 1.0, max: 5.0, noNaN: true }),
        fc.double({ min: 0, max: 13, noNaN: true }),
        fc.integer({ min: 0, max: 9 }),
      ),
    );

    fc.assert(
      fc.property(failedConditionArb, ([sellThrough, priceRatio, medianDays, sampleSize]) => {
        const result = computeVelocityMultiplier(
          sellThrough,
          priceRatio,
          medianDays,
          sampleSize,
        );
        expect(result).toBe(1.0);
      }),
      { numRuns: 100 },
    );
  });
});
