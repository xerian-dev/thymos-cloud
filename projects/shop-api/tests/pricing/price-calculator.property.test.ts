import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { calculateSuggestedPrice } from "../../src/pricing/price-calculator.js";
import { roundToSwiss5 } from "../../src/pricing/swiss-rounding.js";

/**
 * Feature: auto-tag-price, Property 5: Price suggestion composition
 *
 * Validates: Requirements 5.2, 5.7, 5.9, 5.10
 *
 * For any valid PriceCalculationInput, the suggested price equals:
 * referencePrice × velocityMultiplier × creatorAdjustment × colorAdjustment × sizeAdjustment,
 * rounded to the nearest CHF 0.05. Each adjustment factor defaults to 1.0 when not provided.
 */
describe("Price calculator properties", () => {
  const positivePrice = fc.double({ min: 0.05, max: 10_000, noNaN: true, noDefaultInfinity: true });
  const multiplier = fc.double({ min: 0.5, max: 2.0, noNaN: true, noDefaultInfinity: true });

  it("suggestedPrice equals roundToSwiss5(rawPrice) where rawPrice = referencePrice × all multipliers", () => {
    fc.assert(
      fc.property(
        positivePrice,
        multiplier,
        multiplier,
        multiplier,
        multiplier,
        (
          referencePrice: number,
          velocityMultiplier: number,
          creatorAdjustment: number,
          colorAdjustment: number,
          sizeAdjustment: number,
        ) => {
          const result = calculateSuggestedPrice({
            referencePrice,
            velocityMultiplier,
            creatorAdjustment,
            colorAdjustment,
            sizeAdjustment,
          });

          const expectedRaw =
            referencePrice * velocityMultiplier * creatorAdjustment * colorAdjustment * sizeAdjustment;
          const expectedSuggested = roundToSwiss5(expectedRaw);

          expect(result.suggestedPrice).toBeCloseTo(expectedSuggested, 9);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rawPrice equals the un-rounded composition of all multipliers", () => {
    fc.assert(
      fc.property(
        positivePrice,
        multiplier,
        multiplier,
        multiplier,
        multiplier,
        (
          referencePrice: number,
          velocityMultiplier: number,
          creatorAdjustment: number,
          colorAdjustment: number,
          sizeAdjustment: number,
        ) => {
          const result = calculateSuggestedPrice({
            referencePrice,
            velocityMultiplier,
            creatorAdjustment,
            colorAdjustment,
            sizeAdjustment,
          });

          const expectedRaw =
            referencePrice * velocityMultiplier * creatorAdjustment * colorAdjustment * sizeAdjustment;

          expect(result.rawPrice).toBeCloseTo(expectedRaw, 9);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("when optional adjustments are omitted, they default to 1.0 in the result", () => {
    fc.assert(
      fc.property(positivePrice, (referencePrice: number) => {
        const result = calculateSuggestedPrice({ referencePrice });

        expect(result.adjustments.velocityMultiplier).toBe(1.0);
        expect(result.adjustments.creatorAdjustment).toBe(1.0);
        expect(result.adjustments.colorAdjustment).toBe(1.0);
        expect(result.adjustments.sizeAdjustment).toBe(1.0);
        expect(result.rawPrice).toBeCloseTo(referencePrice, 9);
        expect(result.suggestedPrice).toBeCloseTo(roundToSwiss5(referencePrice), 9);
      }),
      { numRuns: 100 },
    );
  });
});
