import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { mapConsignCloudItem } from "../../src/import/item-mapper";
import { ConsignCloudItem } from "../../src/import/item-consigncloud-client";

/** Feature: consigncloud-item-import, Property 2: Invalid items are rejected with field-specific errors */

describe("Property 2: Invalid items are rejected with field-specific errors", () => {
  const isoDateArb = fc
    .integer({ min: 946684800000, max: 1924991999000 })
    .map((ts) => new Date(ts).toISOString());

  const validConsignCloudItemArb: fc.Arbitrary<ConsignCloudItem> = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 300 }),
    price: fc.integer({ min: 0, max: 99999999 }).map((n) => n / 100),
    quantity: fc.integer({ min: 1, max: 9999 }),
    consignor_split: fc.integer({ min: 0, max: 100 }),
    account_id: fc.uuid(),
    created: isoDateArb,
  });

  /**
   * Validates: Requirements 5.4, 5.5
   */
  it("empty title produces failure mentioning 'title'", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const invalidItem: ConsignCloudItem = { ...item, name: "" };
        const result = mapConsignCloudItem(invalidItem);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.toLowerCase()).toContain("title");
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.4, 5.5
   */
  it("negative or out-of-range tagPrice produces failure mentioning 'tagPrice'", () => {
    const invalidPriceArb = fc.oneof(
      fc.double({ min: -999999, max: -0.01, noNaN: true }),
      fc.double({ min: 1000000, max: 9999999, noNaN: true }),
    );

    fc.assert(
      fc.property(validConsignCloudItemArb, invalidPriceArb, (item, price) => {
        const invalidItem: ConsignCloudItem = { ...item, price };
        const result = mapConsignCloudItem(invalidItem);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.toLowerCase()).toContain("tagprice");
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.4, 5.5
   */
  it("out-of-range quantity produces failure mentioning 'quantity'", () => {
    const invalidQuantityArb = fc.oneof(
      fc.integer({ min: -9999, max: 0 }),
      fc.integer({ min: 10000, max: 99999 }),
    );

    fc.assert(
      fc.property(
        validConsignCloudItemArb,
        invalidQuantityArb,
        (item, quantity) => {
          const invalidItem: ConsignCloudItem = { ...item, quantity };
          const result = mapConsignCloudItem(invalidItem);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.toLowerCase()).toContain("quantity");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.4, 5.5
   */
  it("out-of-range split produces failure mentioning 'split'", () => {
    const invalidSplitArb = fc.oneof(
      fc.integer({ min: -100, max: -1 }),
      fc.integer({ min: 101, max: 200 }),
    );

    fc.assert(
      fc.property(validConsignCloudItemArb, invalidSplitArb, (item, split) => {
        const invalidItem: ConsignCloudItem = {
          ...item,
          consignor_split: split,
        };
        const result = mapConsignCloudItem(invalidItem);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.toLowerCase()).toContain("split");
        }
      }),
      { numRuns: 100 },
    );
  });
});
