import { describe, it, expect } from "vitest";
import { classifyConfidence } from "../../src/pricing/confidence-level";

describe("classifyConfidence", () => {
  describe("high confidence (>= 10)", () => {
    it("returns high for exactly 10", () => {
      expect(classifyConfidence(10)).toBe("high");
    });

    it("returns high for large sample sizes", () => {
      expect(classifyConfidence(100)).toBe("high");
    });
  });

  describe("medium confidence (5-9)", () => {
    it("returns medium for exactly 5", () => {
      expect(classifyConfidence(5)).toBe("medium");
    });

    it("returns medium for 9", () => {
      expect(classifyConfidence(9)).toBe("medium");
    });

    it("returns medium for value in the middle of range", () => {
      expect(classifyConfidence(7)).toBe("medium");
    });
  });

  describe("low confidence (< 5)", () => {
    it("returns low for 4", () => {
      expect(classifyConfidence(4)).toBe("low");
    });

    it("returns low for 0", () => {
      expect(classifyConfidence(0)).toBe("low");
    });

    it("returns low for 1", () => {
      expect(classifyConfidence(1)).toBe("low");
    });
  });
});
