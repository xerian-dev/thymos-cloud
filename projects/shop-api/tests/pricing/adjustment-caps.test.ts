import { describe, it, expect } from "vitest";
import {
  capDecrease,
  capIncrease,
  shouldAllowIncrease,
} from "../../src/pricing/adjustment-caps";

describe("adjustment-caps", () => {
  describe("capDecrease", () => {
    it("returns newPrice when within both caps", () => {
      // 10% decrease from 100 → 90, well within 15% per-cycle and 30% cumulative
      expect(capDecrease(100, 90, 100)).toBe(90);
    });

    it("caps at 15% per-cycle floor when newPrice drops more", () => {
      // 20% decrease from 100 → 80, but floor is 100 * 0.85 = 85
      expect(capDecrease(100, 80, 100)).toBe(85);
    });

    it("caps at 30% cumulative floor when baseline would be violated", () => {
      // Previous was already reduced to 75 from baseline 100
      // New price wants to go to 60, per-cycle floor = 75 * 0.85 = 63.75
      // But cumulative floor = 100 * 0.70 = 70 is higher
      expect(capDecrease(75, 60, 100)).toBe(70);
    });

    it("per-cycle floor takes precedence over cumulative when it is higher", () => {
      // Previous 90, baseline 100, new wants 70
      // Per-cycle floor = 90 * 0.85 = 76.5
      // Cumulative floor = 100 * 0.70 = 70
      // Per-cycle floor is higher
      expect(capDecrease(90, 70, 100)).toBe(76.5);
    });

    it("returns newPrice when it equals the per-cycle floor exactly", () => {
      // newPrice = 85 = 100 * 0.85 exactly
      expect(capDecrease(100, 85, 100)).toBe(85);
    });

    it("returns newPrice when it equals the cumulative floor exactly", () => {
      // Previous already at 72, baseline 100
      // New price = 70 = 100 * 0.70 exactly
      // Per-cycle floor = 72 * 0.85 = 61.2 (lower than 70)
      expect(capDecrease(72, 70, 100)).toBe(70);
    });

    it("handles small prices correctly", () => {
      // Previous 5, baseline 10, new 2
      // Per-cycle floor = 5 * 0.85 = 4.25
      // Cumulative floor = 10 * 0.70 = 7
      expect(capDecrease(5, 2, 10)).toBe(7);
    });

    it("handles case where newPrice is already above both floors", () => {
      // Previous 100, baseline 120, new 95
      // Per-cycle floor = 100 * 0.85 = 85
      // Cumulative floor = 120 * 0.70 = 84
      // newPrice 95 is above both, so returns 95
      expect(capDecrease(100, 95, 120)).toBe(95);
    });
  });

  describe("capIncrease", () => {
    it("returns newPrice when within 10% cap", () => {
      // 5% increase from 100 → 105
      expect(capIncrease(100, 105)).toBe(105);
    });

    it("caps at 10% ceiling when newPrice exceeds it", () => {
      // 20% increase from 100 → 120, but ceiling is 110
      expect(capIncrease(100, 120)).toBeCloseTo(110);
    });

    it("returns newPrice when it equals the ceiling exactly", () => {
      expect(capIncrease(100, 110)).toBe(110);
    });

    it("handles small increases", () => {
      expect(capIncrease(100, 101)).toBe(101);
    });

    it("handles large prices", () => {
      // Previous 500, new 600, ceiling = 550
      expect(capIncrease(500, 600)).toBe(550);
    });

    it("handles decimal prices", () => {
      // Previous 19.95, new 25, ceiling = 19.95 * 1.10 = 21.945
      expect(capIncrease(19.95, 25)).toBeCloseTo(21.945);
    });
  });

  describe("shouldAllowIncrease", () => {
    it("returns true when all conditions are met", () => {
      expect(shouldAllowIncrease(0.85, 1.05, 10, 15)).toBe(true);
    });

    it("returns false when sellThrough is exactly 0.80 (not > 0.80)", () => {
      expect(shouldAllowIncrease(0.8, 1.05, 10, 15)).toBe(false);
    });

    it("returns false when sellThrough is below 0.80", () => {
      expect(shouldAllowIncrease(0.5, 1.05, 10, 15)).toBe(false);
    });

    it("returns false when priceRatio is below 1.0", () => {
      expect(shouldAllowIncrease(0.85, 0.95, 10, 15)).toBe(false);
    });

    it("returns true when priceRatio is exactly 1.0 (>= 1.0)", () => {
      expect(shouldAllowIncrease(0.85, 1.0, 10, 15)).toBe(true);
    });

    it("returns false when medianDaysOnShelf is 14 or more", () => {
      expect(shouldAllowIncrease(0.85, 1.05, 14, 15)).toBe(false);
      expect(shouldAllowIncrease(0.85, 1.05, 20, 15)).toBe(false);
    });

    it("returns false when sampleSize is below 10", () => {
      expect(shouldAllowIncrease(0.85, 1.05, 10, 9)).toBe(false);
    });

    it("returns true when sampleSize is exactly 10", () => {
      expect(shouldAllowIncrease(0.85, 1.05, 10, 10)).toBe(true);
    });

    it("returns false when multiple conditions fail", () => {
      expect(shouldAllowIncrease(0.5, 0.8, 20, 5)).toBe(false);
    });

    it("handles boundary case: just above all thresholds", () => {
      expect(shouldAllowIncrease(0.81, 1.0, 13, 10)).toBe(true);
    });
  });
});
