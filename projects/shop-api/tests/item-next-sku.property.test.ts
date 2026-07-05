import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeNextSkuFromCounter } from "../src/routes/next-item-sku";

/**
 * Feature: item-creation, Property 9: Next-SKU computation
 *
 * Validates: Requirements 9.2, 9.3
 */
describe("Next-SKU computation properties", () => {
  it("computeNextSkuFromCounter(currentValue) returns currentValue + 1 for any non-negative integer", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER - 1 }),
        (currentValue: number) => {
          const nextSku = computeNextSkuFromCounter(currentValue);
          expect(nextSku).toBe(currentValue + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("computeNextSkuFromCounter(0) returns 1 (represents no counter exists)", () => {
    const nextSku = computeNextSkuFromCounter(0);
    expect(nextSku).toBe(1);
  });
});
