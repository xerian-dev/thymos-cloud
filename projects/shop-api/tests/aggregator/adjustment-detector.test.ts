import { describe, it, expect } from "vitest";
import {
  detectAdjustment,
  PricingRef,
  ComputedStats,
} from "../../src/aggregator/adjustment-detector";

function makePrevious(overrides: Partial<PricingRef> = {}): PricingRef {
  return {
    referencePrice: 100,
    originalBaseline: 100,
    sellThroughRate: 0.5,
    medianDaysOnShelf: 20,
    sampleSize: 15,
    priceRatio: 0.9,
    ...overrides,
  };
}

function makeCurrent(overrides: Partial<ComputedStats> = {}): ComputedStats {
  return {
    referencePrice: 100,
    sellThroughRate: 0.5,
    medianDaysOnShelf: 20,
    sampleSize: 15,
    priceRatio: 0.9,
    ...overrides,
  };
}

describe("aggregator/adjustment-detector", () => {
  describe("detectAdjustment", () => {
    it("returns new price with no event when previous is null", () => {
      const current = makeCurrent({ referencePrice: 80 });
      const result = detectAdjustment(
        null,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event).toBeNull();
      expect(result.adjustedPrice).toBe(80);
    });

    it("returns no event when change is exactly 2%", () => {
      const previous = makePrevious({ referencePrice: 100 });
      const current = makeCurrent({ referencePrice: 98 });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event).toBeNull();
      expect(result.adjustedPrice).toBe(100); // stays at previous
    });

    it("returns no event when change is less than 2%", () => {
      const previous = makePrevious({ referencePrice: 100 });
      const current = makeCurrent({ referencePrice: 99 });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event).toBeNull();
      expect(result.adjustedPrice).toBe(100); // stays at previous
    });

    it("creates decrease event when change > 2%", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      const current = makeCurrent({ referencePrice: 90 });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event).not.toBeNull();
      expect(result.event!.direction).toBe("decrease");
      expect(result.event!.brand).toBe("Nike");
      expect(result.event!.category).toBe("Shoes");
      expect(result.event!.categoryId).toBe("cat-1");
      expect(result.event!.previousPrice).toBe(100);
    });

    it("applies capDecrease to limit decrease (per-cycle cap at 15%)", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      // Trying to drop to 70 (30% decrease) — should be capped at 85 (15% max per cycle)
      const current = makeCurrent({ referencePrice: 70 });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event).not.toBeNull();
      expect(result.adjustedPrice).toBe(85); // max(70, 100*0.85, 100*0.70) = 85
      expect(result.event!.newPrice).toBe(85);
    });

    it("applies cumulative cap from original baseline", () => {
      // Previous already dropped from 100 to 80. Trying to go to 60.
      // Per-cycle floor: 80 * 0.85 = 68
      // Cumulative floor: 100 * 0.70 = 70
      // Result: max(60, 68, 70) = 70
      const previous = makePrevious({
        referencePrice: 80,
        originalBaseline: 100,
      });
      const current = makeCurrent({ referencePrice: 60 });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.adjustedPrice).toBe(70);
    });

    it("creates increase event only when shouldAllowIncrease conditions met", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      // Conditions for increase: sellThrough > 0.80, priceRatio >= 1.0, medianDaysOnShelf < 14, sampleSize >= 10
      const current = makeCurrent({
        referencePrice: 115,
        sellThroughRate: 0.9,
        priceRatio: 1.1,
        medianDaysOnShelf: 10,
        sampleSize: 15,
      });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event).not.toBeNull();
      expect(result.event!.direction).toBe("increase");
    });

    it("returns previous price (no event) when increase conditions not met", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      // sellThroughRate is below threshold (0.5 < 0.80)
      const current = makeCurrent({
        referencePrice: 115,
        sellThroughRate: 0.5,
        priceRatio: 0.9,
        medianDaysOnShelf: 20,
        sampleSize: 5,
      });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event).toBeNull();
      expect(result.adjustedPrice).toBe(100); // stays at previous
    });

    it("applies capIncrease to limit increase (max 10% per cycle)", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      // Trying to increase to 125 (25%) — should be capped at 110 (10% max)
      const current = makeCurrent({
        referencePrice: 125,
        sellThroughRate: 0.9,
        priceRatio: 1.1,
        medianDaysOnShelf: 10,
        sampleSize: 15,
      });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event).not.toBeNull();
      expect(result.adjustedPrice).toBeCloseTo(110, 5); // min(125, 100*1.10) = 110
      expect(result.event!.newPrice).toBeCloseTo(110, 5);
    });

    it("calculates correct percentageChange for decrease", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      const current = makeCurrent({ referencePrice: 90 });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      // New price is 90 (within per-cycle cap), percentageChange = (90-100)/100 * 100 = -10%
      expect(result.event!.percentageChange).toBeCloseTo(-10, 5);
    });

    it("calculates correct percentageChange for capped decrease", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      const current = makeCurrent({ referencePrice: 70 });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      // Capped to 85, percentageChange = (85-100)/100 * 100 = -15%
      expect(result.event!.percentageChange).toBeCloseTo(-15, 5);
    });

    it("calculates correct percentageChange for increase", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      const current = makeCurrent({
        referencePrice: 108,
        sellThroughRate: 0.9,
        priceRatio: 1.1,
        medianDaysOnShelf: 10,
        sampleSize: 15,
      });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      // New price is 108 (within cap), percentageChange = (108-100)/100 * 100 = 8%
      expect(result.event!.percentageChange).toBeCloseTo(8, 5);
    });

    it("generates correct reason string for decrease with low sell-through", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      const current = makeCurrent({
        referencePrice: 90,
        sellThroughRate: 0.2,
        priceRatio: 0.9,
        medianDaysOnShelf: 20,
      });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event!.reason).toContain("low sell-through rate");
    });

    it("generates correct reason string for decrease with low price ratio", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      const current = makeCurrent({
        referencePrice: 90,
        sellThroughRate: 0.5,
        priceRatio: 0.8,
        medianDaysOnShelf: 20,
      });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event!.reason).toContain(
        "items selling well below tag price",
      );
    });

    it("generates correct reason string for decrease with slow movement", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      const current = makeCurrent({
        referencePrice: 90,
        sellThroughRate: 0.5,
        priceRatio: 0.9,
        medianDaysOnShelf: 45,
      });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event!.reason).toContain("slow movement");
    });

    it("generates correct reason string for increase", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      const current = makeCurrent({
        referencePrice: 108,
        sellThroughRate: 0.9,
        priceRatio: 1.1,
        medianDaysOnShelf: 10,
        sampleSize: 15,
      });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event!.reason).toContain("strong sell-through");
    });

    it("includes metrics in the event", () => {
      const previous = makePrevious({
        referencePrice: 100,
        originalBaseline: 100,
      });
      const current = makeCurrent({
        referencePrice: 90,
        sellThroughRate: 0.4,
        medianDaysOnShelf: 25,
        sampleSize: 12,
        priceRatio: 0.88,
      });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.15,
      );

      expect(result.event!.metrics).toEqual({
        sellThroughRate: 0.4,
        medianDaysOnShelf: 25,
        sampleSize: 12,
        discountFrequency: 0.15,
        priceRatio: 0.88,
      });
    });

    it("handles previousPrice of 0 gracefully", () => {
      const previous = makePrevious({ referencePrice: 0, originalBaseline: 0 });
      const current = makeCurrent({ referencePrice: 50 });
      const result = detectAdjustment(
        previous,
        current,
        "Nike",
        "Shoes",
        "cat-1",
        0.1,
      );

      expect(result.event).toBeNull();
      expect(result.adjustedPrice).toBe(50);
    });
  });
});
