import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { detectAdjustment } from "../../src/aggregator/adjustment-detector.js";
import type {
  PricingRef,
  ComputedStats,
} from "../../src/aggregator/adjustment-detector.js";

/**
 * Feature: auto-tag-price, Property 8: Adjustment event detection
 *
 * **Validates: Requirement 7.1**
 *
 * For any pricing reference update:
 *   - If |newPrice - previousPrice| / previousPrice > 0.02, an adjustment event SHALL be created
 *   - If the change is <= 2%, no event is created
 *
 * Note: for increases, an event may still be null if shouldAllowIncrease returns false.
 * So the "event must exist" property is tested only for the decrease case.
 * For the increase case, we test that if an event exists it was allowed.
 */
describe("Adjustment detector properties (Property 8)", () => {
  const arbPositivePrice = fc.double({
    min: 0.1,
    max: 10_000,
    noNaN: true,
    noDefaultInfinity: true,
  });

  const arbPricingRef = fc.record({
    referencePrice: arbPositivePrice,
    originalBaseline: arbPositivePrice,
    sellThroughRate: fc.double({
      min: 0,
      max: 1,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    medianDaysOnShelf: fc.double({
      min: 0,
      max: 120,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    sampleSize: fc.integer({ min: 1, max: 500 }),
    priceRatio: fc.double({
      min: 0.3,
      max: 2.0,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  }) as fc.Arbitrary<PricingRef>;

  const arbComputedStats = fc.record({
    referencePrice: arbPositivePrice,
    sellThroughRate: fc.double({
      min: 0,
      max: 1,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    medianDaysOnShelf: fc.double({
      min: 0,
      max: 120,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    sampleSize: fc.integer({ min: 1, max: 500 }),
    priceRatio: fc.double({
      min: 0.3,
      max: 2.0,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  }) as fc.Arbitrary<ComputedStats>;

  describe("Decrease case: event SHALL be created when change > 2%", () => {
    it("creates an event when price decreases by more than 2%", () => {
      fc.assert(
        fc.property(
          arbPricingRef,
          fc.double({
            min: 0.03,
            max: 0.9,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 120, noNaN: true, noDefaultInfinity: true }),
          fc.integer({ min: 1, max: 500 }),
          fc.double({
            min: 0.3,
            max: 2.0,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          (
            previous: PricingRef,
            decreaseFraction: number,
            sellThroughRate: number,
            medianDaysOnShelf: number,
            sampleSize: number,
            priceRatio: number,
          ) => {
            // Construct a current price that is more than 2% lower
            const currentPrice =
              previous.referencePrice * (1 - decreaseFraction);
            if (currentPrice <= 0) return; // skip degenerate

            const current: ComputedStats = {
              referencePrice: currentPrice,
              sellThroughRate,
              medianDaysOnShelf,
              sampleSize,
              priceRatio,
            };

            const result = detectAdjustment(
              previous,
              current,
              "TestBrand",
              "TestCategory",
              "cat-123",
              0.1,
            );

            // Since decrease > 2%, event must be created
            expect(result.event).not.toBeNull();
            expect(result.event!.direction).toBe("decrease");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("No event when change <= 2%", () => {
    it("returns null event and adjustedPrice = previous.referencePrice when change <= 2%", () => {
      fc.assert(
        fc.property(
          arbPricingRef,
          // Use 0.019 as upper bound to avoid floating-point boundary issues
          // where multiplying by (1 - 0.02) can produce a ratio slightly > 0.02
          fc.double({
            min: 0,
            max: 0.019,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.boolean(),
          (
            previous: PricingRef,
            changeFraction: number,
            isIncrease: boolean,
          ) => {
            // Construct a price within 2% of previous
            const multiplier = isIncrease
              ? 1 + changeFraction
              : 1 - changeFraction;
            const currentPrice = previous.referencePrice * multiplier;
            if (currentPrice <= 0) return;

            // Verify the actual change ratio is truly <= 0.02 after floating-point math
            const actualChangeRatio =
              Math.abs(currentPrice - previous.referencePrice) /
              previous.referencePrice;
            if (actualChangeRatio > 0.02) return; // skip floating-point edge cases

            const current: ComputedStats = {
              referencePrice: currentPrice,
              sellThroughRate: 0.5,
              medianDaysOnShelf: 20,
              sampleSize: 15,
              priceRatio: 1.0,
            };

            const result = detectAdjustment(
              previous,
              current,
              "TestBrand",
              "TestCategory",
              "cat-123",
              0.1,
            );

            // Change <= 2% → no event
            expect(result.event).toBeNull();
            // Price stays as previous reference
            expect(result.adjustedPrice).toBeCloseTo(
              previous.referencePrice,
              5,
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Increase case: if event exists, increase was allowed", () => {
    it("when increase > 2% and conditions met, event is created with direction 'increase'", () => {
      fc.assert(
        fc.property(
          arbPricingRef,
          fc.double({
            min: 0.03,
            max: 0.5,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          (previous: PricingRef, increaseFraction: number) => {
            // Construct a price more than 2% higher
            const currentPrice =
              previous.referencePrice * (1 + increaseFraction);

            // Set conditions that allow increase:
            // sellThrough > 0.80, priceRatio >= 1.0, medianDaysOnShelf < 14, sampleSize >= 10
            const current: ComputedStats = {
              referencePrice: currentPrice,
              sellThroughRate: 0.9,
              medianDaysOnShelf: 7,
              sampleSize: 25,
              priceRatio: 1.1,
            };

            const result = detectAdjustment(
              previous,
              current,
              "TestBrand",
              "TestCategory",
              "cat-123",
              0.1,
            );

            // Increase is allowed → event should be created
            expect(result.event).not.toBeNull();
            expect(result.event!.direction).toBe("increase");
          },
        ),
        { numRuns: 100 },
      );
    });

    it("when increase > 2% but conditions NOT met, no event is created", () => {
      fc.assert(
        fc.property(
          arbPricingRef,
          fc.double({
            min: 0.03,
            max: 0.5,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          (previous: PricingRef, increaseFraction: number) => {
            // Construct a price more than 2% higher
            const currentPrice =
              previous.referencePrice * (1 + increaseFraction);

            // Set conditions that do NOT allow increase (sell-through too low)
            const current: ComputedStats = {
              referencePrice: currentPrice,
              sellThroughRate: 0.5,
              medianDaysOnShelf: 20,
              sampleSize: 5,
              priceRatio: 0.85,
            };

            const result = detectAdjustment(
              previous,
              current,
              "TestBrand",
              "TestCategory",
              "cat-123",
              0.1,
            );

            // Increase NOT allowed → no event, price stays as previous
            expect(result.event).toBeNull();
            expect(result.adjustedPrice).toBeCloseTo(
              previous.referencePrice,
              5,
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
