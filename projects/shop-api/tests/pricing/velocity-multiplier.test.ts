import { describe, it, expect } from "vitest";
import { computeVelocityMultiplier } from "../../src/pricing/velocity-multiplier.js";

describe("computeVelocityMultiplier", () => {
  describe("low sell-through band (< 0.30)", () => {
    it("returns 0.90 when sell-through is 0.0", () => {
      expect(computeVelocityMultiplier(0.0, 1.0, 10, 20)).toBe(0.90);
    });

    it("returns 0.95 at the boundary of 0.30", () => {
      const result = computeVelocityMultiplier(0.2999, 1.0, 10, 20);
      expect(result).toBeCloseTo(0.95, 2);
    });

    it("interpolates linearly at 0.15 (midpoint)", () => {
      const result = computeVelocityMultiplier(0.15, 1.0, 10, 20);
      expect(result).toBeCloseTo(0.925, 4);
    });

    it("interpolates linearly at 0.10", () => {
      const result = computeVelocityMultiplier(0.10, 1.0, 10, 20);
      // t = 0.10 / 0.30 = 1/3 → 0.90 + (1/3) * 0.05 ≈ 0.9167
      expect(result).toBeCloseTo(0.90 + (1 / 3) * 0.05, 4);
    });
  });

  describe("neutral band (0.30–0.70)", () => {
    it("returns 1.0 at 0.30", () => {
      expect(computeVelocityMultiplier(0.30, 1.0, 10, 20)).toBe(1.0);
    });

    it("returns 1.0 at 0.50", () => {
      expect(computeVelocityMultiplier(0.50, 1.0, 10, 20)).toBe(1.0);
    });

    it("returns 1.0 at 0.70", () => {
      expect(computeVelocityMultiplier(0.70, 1.0, 10, 20)).toBe(1.0);
    });
  });

  describe("transitional band (0.70–0.80)", () => {
    it("returns 1.0 at 0.75", () => {
      expect(computeVelocityMultiplier(0.75, 1.0, 10, 20)).toBe(1.0);
    });

    it("returns 1.0 at 0.80", () => {
      expect(computeVelocityMultiplier(0.80, 1.0, 10, 20)).toBe(1.0);
    });
  });

  describe("high sell-through band (> 0.80) with conditions met", () => {
    it("returns 1.05 just above 0.80", () => {
      const result = computeVelocityMultiplier(0.801, 1.0, 10, 20);
      expect(result).toBeCloseTo(1.05, 2);
    });

    it("returns 1.10 at sell-through 1.0", () => {
      expect(computeVelocityMultiplier(1.0, 1.0, 10, 20)).toBe(1.10);
    });

    it("interpolates linearly at 0.90 (midpoint of 0.80–1.0)", () => {
      const result = computeVelocityMultiplier(0.90, 1.5, 7, 15);
      // t = (0.90 - 0.80) / 0.20 = 0.5 → 1.05 + 0.5 * 0.05 = 1.075
      expect(result).toBeCloseTo(1.075, 4);
    });
  });

  describe("high sell-through band (> 0.80) with conditions NOT met", () => {
    it("returns 1.0 when priceRatio < 1.0", () => {
      expect(computeVelocityMultiplier(0.90, 0.95, 10, 20)).toBe(1.0);
    });

    it("returns 1.0 when medianDaysOnShelf >= 14", () => {
      expect(computeVelocityMultiplier(0.90, 1.2, 14, 20)).toBe(1.0);
    });

    it("returns 1.0 when sampleSize < 10", () => {
      expect(computeVelocityMultiplier(0.90, 1.2, 7, 9)).toBe(1.0);
    });

    it("returns 1.0 when multiple conditions fail", () => {
      expect(computeVelocityMultiplier(0.95, 0.8, 20, 5)).toBe(1.0);
    });
  });

  describe("edge cases", () => {
    it("clamps multiplier at 1.10 for sell-through > 1.0", () => {
      // Sell-through can technically exceed 1.0 in edge cases
      const result = computeVelocityMultiplier(1.5, 1.2, 5, 30);
      expect(result).toBe(1.10);
    });

    it("handles exact boundary at priceRatio = 1.0 (condition met)", () => {
      const result = computeVelocityMultiplier(0.85, 1.0, 13, 10);
      expect(result).toBeGreaterThan(1.0);
    });

    it("handles exact boundary at sampleSize = 10 (condition met)", () => {
      const result = computeVelocityMultiplier(0.85, 1.0, 13, 10);
      expect(result).toBeGreaterThan(1.0);
    });
  });
});
