import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { classifyConfidence } from "../../src/pricing/confidence-level.js";

/**
 * Feature: description-pricing, Property: Confidence level classification
 *
 * Validates: Requirements 5.11, 5.6
 *
 * For any non-negative integer sampleSize:
 * - If sampleSize >= 10 → result is "high"
 * - If 5 <= sampleSize < 10 → result is "medium"
 * - If sampleSize < 5 → result is "low"
 */
describe("Confidence level classification properties", () => {
  it("sampleSize >= 10 always returns 'high'", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 100_000 }),
        (sampleSize: number) => {
          expect(classifyConfidence(sampleSize)).toBe("high");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("5 <= sampleSize < 10 always returns 'medium'", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 9 }), (sampleSize: number) => {
        expect(classifyConfidence(sampleSize)).toBe("medium");
      }),
      { numRuns: 100 },
    );
  });

  it("sampleSize < 5 always returns 'low'", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4 }), (sampleSize: number) => {
        expect(classifyConfidence(sampleSize)).toBe("low");
      }),
      { numRuns: 100 },
    );
  });
});
