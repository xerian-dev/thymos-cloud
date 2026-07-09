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
    title: fc.string({ minLength: 1, maxLength: 300 }),
    tag_price: fc.integer({ min: 0, max: 99999999 }),
    quantity: fc.integer({ min: 1, max: 9999 }),
    split: fc.double({ min: 0, max: 1, noNaN: true }),
    account_id: fc.uuid(),
    created: isoDateArb,
  });

  /**
   * Validates: Requirements 5.4, 5.5
   */
  it("empty title produces failure mentioning 'title'", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const invalidItem: ConsignCloudItem = { ...item, title: "" };
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
      fc.integer({ min: -999999, max: -1 }),
      fc.integer({ min: 100000000, max: 999999999 }),
    );

    fc.assert(
      fc.property(validConsignCloudItemArb, invalidPriceArb, (item, price) => {
        const invalidItem: ConsignCloudItem = { ...item, tag_price: price };
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
  it("out-of-range split produces failure mentioning 'split'", () => {
    const invalidSplitArb = fc.oneof(
      fc.double({ min: -1, max: -0.01, noNaN: true }),
      fc.double({ min: 1.01, max: 2, noNaN: true }),
    );

    fc.assert(
      fc.property(validConsignCloudItemArb, invalidSplitArb, (item, split) => {
        const invalidItem: ConsignCloudItem = {
          ...item,
          split,
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
