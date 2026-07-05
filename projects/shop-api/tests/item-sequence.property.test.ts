import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeNextSku } from "../src/routes/create-item";

/**
 * Feature: item-creation, Property 2: Sequence counter monotonicity
 *
 * Validates: Requirements 8.2, 8.4
 */
describe("Sequence counter monotonicity properties", () => {
  it("computeNextSku(current) returns a value strictly greater than current for any non-negative integer", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER - 1 }),
        (current: number) => {
          const next = computeNextSku(current);
          expect(next).toBeGreaterThan(current);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("computeNextSku(current) returns exactly current + 1 for any non-negative integer", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER - 1 }),
        (current: number) => {
          const next = computeNextSku(current);
          expect(next).toBe(current + 1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
