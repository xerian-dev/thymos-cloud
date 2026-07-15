import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeNextSaleNumber } from "../routes/next-sale-number";

/**
 * **Validates: Requirements 2.2**
 *
 * Property 4: Next sale number monotonicity
 * For any non-negative integer n, computeNextSaleNumber(n) returns n + 1,
 * ensuring the sequence is strictly monotonically increasing.
 */
describe("Feature: sales-backend-api, Property 4: Next sale number monotonicity", () => {
  it("returns n + 1 for any non-negative integer", () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        expect(computeNextSaleNumber(n)).toBe(n + 1);
      }),
      { numRuns: 200 },
    );
  });

  it("the sequence is strictly monotonically increasing", () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        const current = computeNextSaleNumber(n);
        const next = computeNextSaleNumber(current);
        expect(next).toBeGreaterThan(current);
      }),
      { numRuns: 200 },
    );
  });

  it("applying computeNextSaleNumber k times produces n + k", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000000 }),
        fc.integer({ min: 1, max: 10 }),
        (start, k) => {
          let value = start;
          for (let i = 0; i < k; i++) {
            value = computeNextSaleNumber(value);
          }
          expect(value).toBe(start + k);
        },
      ),
      { numRuns: 200 },
    );
  });
});
