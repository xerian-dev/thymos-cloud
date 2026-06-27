import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeNextCounter } from "./sequence-counter";

/**
 * Feature: accounts-page, Property 7: Sequence counter update logic
 *
 * For any current sequence value C and specified account UID U where both are in [1, 9999999]:
 * (a) if U equals C (default sequential), the new counter SHALL be C + 1;
 * (b) if U > C, the new counter SHALL be U + 1;
 * (c) if U < C, the counter SHALL remain C.
 *
 * Validates: Requirements 9.2, 9.3, 9.4
 */

describe("Feature: accounts-page, Property 7: Sequence counter update logic", () => {
  it("when U equals C, returns C + 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999999 }), (c: number) => {
        const result = computeNextCounter(c, c);
        expect(result).toBe(c + 1);
      }),
      { numRuns: 100 },
    );
  });

  it("when U > C, returns U + 1", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 9999998 })
          .chain((c: number) =>
            fc.tuple(fc.constant(c), fc.integer({ min: c + 1, max: 9999999 })),
          ),
        ([c, u]: [number, number]) => {
          const result = computeNextCounter(c, u);
          expect(result).toBe(u + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("when U < C, returns C unchanged", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 9999999 })
          .chain((c: number) =>
            fc.tuple(fc.constant(c), fc.integer({ min: 1, max: c - 1 })),
          ),
        ([c, u]: [number, number]) => {
          const result = computeNextCounter(c, u);
          expect(result).toBe(c);
        },
      ),
      { numRuns: 100 },
    );
  });
});
