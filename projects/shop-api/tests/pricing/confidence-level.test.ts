import { describe, it, expect } from "vitest";
import { classifyConfidence } from "../../src/pricing/confidence-level";

describe("classifyConfidence", () => {
  describe("high confidence (>= 20)", () => {
    it("returns high for exactly 20", () => {
      expect(classifyConfidence(20)).toBe("high");
    });

    it("returns high for large sample sizes", () => {
      expect(classifyConfidence(100)).toBe("high");
    });
  });

  describe("medium confidence (5-19)", () => {
    it("returns medium for exactly 5", () => {
      expect(classifyConfidence(5)).toBe("medium");
    });

    it("returns medium for 19", () => {
      expect(classifyConfidence(19)).toBe("medium");
    });

    it("returns medium for value in the middle of range", () => {
      expect(classifyConfidence(12)).toBe("medium");
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
