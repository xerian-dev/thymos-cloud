import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isFinalizedSale } from "../../src/import/sale-mapper";
import { ConsignCloudSale } from "../../src/import/sale-consigncloud-client";

/**
 * Feature: consigncloud-sale-import, Property 1: Only finalized sales pass the status filter
 *
 * Validates: Requirements 3.4
 *
 * The ConsignCloud API does not return an explicit "status" field. A sale is
 * considered finalized if `finalized` is non-null AND `voided` is null.
 * isFinalizedSale returns true iff both conditions hold.
 */

function arbitraryConsignCloudSale(overrides?: {
  finalized?: fc.Arbitrary<string | null>;
  voided?: fc.Arbitrary<string | null>;
}): fc.Arbitrary<ConsignCloudSale> {
  return fc.record({
    id: fc.uuid(),
    number: fc.string({ minLength: 1, maxLength: 10 }),
    status: fc.string({ minLength: 0, maxLength: 20 }),
    subtotal: fc.integer({ min: 0, max: 100_000_00 }),
    total: fc.integer({ min: 0, max: 100_000_00 }),
    store_portion: fc.integer({ min: 0, max: 100_000_00 }),
    consignor_portion: fc.integer({ min: 0, max: 100_000_00 }),
    change: fc.integer({ min: 0, max: 100_000_00 }),
    memo: fc.oneof(fc.constant(null), fc.string({ maxLength: 50 })),
    cashier: fc.oneof(
      fc.constant(null),
      fc.record({ id: fc.uuid(), name: fc.string({ maxLength: 30 }) }),
    ),
    created: fc.constant("2025-01-01T00:00:00.000Z"),
    finalized:
      overrides?.finalized ??
      fc.oneof(fc.constant(null), fc.constant("2025-01-02T00:00:00.000Z")),
    voided:
      overrides?.voided ??
      fc.oneof(fc.constant(null), fc.constant("2025-01-03T00:00:00.000Z")),
  });
}

describe("Property 1: Only finalized sales pass the status filter", () => {
  /**
   * Validates: Requirements 3.4
   */
  it("returns true iff finalized is non-null AND voided is null", () => {
    fc.assert(
      fc.property(arbitraryConsignCloudSale(), (sale) => {
        const result = isFinalizedSale(sale);
        const expected = sale.finalized !== null && sale.voided === null;

        expect(result).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.4
   */
  it("always returns true when finalized is set and voided is null", () => {
    const sale = arbitraryConsignCloudSale({
      finalized: fc.constant("2025-06-15T12:00:00.000Z"),
      voided: fc.constant(null),
    });

    fc.assert(
      fc.property(sale, (s) => {
        expect(isFinalizedSale(s)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.4
   */
  it("always returns false when finalized is null (regardless of voided)", () => {
    const sale = arbitraryConsignCloudSale({
      finalized: fc.constant(null),
      voided: fc.oneof(
        fc.constant(null),
        fc.constant("2025-01-03T00:00:00.000Z"),
      ),
    });

    fc.assert(
      fc.property(sale, (s) => {
        expect(isFinalizedSale(s)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.4
   */
  it("always returns false when voided is non-null (even if finalized is set)", () => {
    const sale = arbitraryConsignCloudSale({
      finalized: fc.constant("2025-06-15T12:00:00.000Z"),
      voided: fc.constant("2025-06-16T08:00:00.000Z"),
    });

    fc.assert(
      fc.property(sale, (s) => {
        expect(isFinalizedSale(s)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
