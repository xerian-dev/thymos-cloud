import { describe, it, expect } from "vitest";
import { roundToSwiss5 } from "../../src/pricing/swiss-rounding";

describe("swiss-rounding", () => {
  describe("roundToSwiss5", () => {
    it("rounds down to nearest 0.05", () => {
      expect(roundToSwiss5(1.02)).toBe(1.0);
    });

    it("rounds up to nearest 0.05", () => {
      expect(roundToSwiss5(1.03)).toBe(1.05);
    });

    it("leaves exact multiples of 0.05 unchanged", () => {
      expect(roundToSwiss5(1.05)).toBe(1.05);
      expect(roundToSwiss5(2.50)).toBe(2.50);
      expect(roundToSwiss5(0.0)).toBe(0.0);
    });

    it("rounds midpoint (0.025) up", () => {
      expect(roundToSwiss5(1.025)).toBe(1.05);
    });

    it("handles typical CHF prices", () => {
      expect(roundToSwiss5(19.99)).toBe(20.0);
      expect(roundToSwiss5(24.97)).toBe(24.95);
      expect(roundToSwiss5(24.98)).toBe(25.0);
    });

    it("handles zero", () => {
      expect(roundToSwiss5(0)).toBe(0);
    });

    it("handles large prices", () => {
      expect(roundToSwiss5(999.99)).toBe(1000.0);
      expect(roundToSwiss5(1234.56)).toBe(1234.55);
    });
  });
});
