import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { mapConsignCloudItem } from "../../src/import/item-mapper";
import { ConsignCloudItem } from "../../src/import/item-consigncloud-client";

/** Feature: consigncloud-item-import, Property 1: Item mapping preserves required fields */

describe("Property 1: Item mapping preserves required fields", () => {
  const validConsignCloudItemArb: fc.Arbitrary<ConsignCloudItem> = fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 300 }),
    tag_price: fc.integer({ min: 0, max: 99999999 }),
    quantity: fc.integer({ min: 0, max: 9999 }),
    split: fc.double({ min: 0, max: 1, noNaN: true }),
    account_id: fc.uuid(),
    created: fc
      .integer({
        min: new Date("2000-01-01").getTime(),
        max: new Date("2030-12-31").getTime(),
      })
      .map((ts) => new Date(ts).toISOString()),
  });

  /**
   * Validates: Requirements 5.1
   */
  it("mapping succeeds for any valid item", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const result = mapConsignCloudItem(item);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("title equals source name truncated to 200 characters", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const result = mapConsignCloudItem(item);
        if (!result.success) throw new Error("Expected success");
        expect(result.mapped.title).toBe(item.title!.slice(0, 200));
      }),
      { numRuns: 100 },
    );
  });

  it("tagPrice equals source price", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const result = mapConsignCloudItem(item);
        if (!result.success) throw new Error("Expected success");
        expect(result.mapped.tagPrice).toBe((item.tag_price ?? 0) / 100);
      }),
      { numRuns: 100 },
    );
  });

  it("quantity equals source quantity (default 0 if null)", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const result = mapConsignCloudItem(item);
        if (!result.success) throw new Error("Expected success");
        expect(result.mapped.quantity).toBe(item.quantity ?? 0);
      }),
      { numRuns: 100 },
    );
  });

  it("split equals source consignor_split", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const result = mapConsignCloudItem(item);
        if (!result.success) throw new Error("Expected success");
        expect(result.mapped.split).toBe(Math.round((item.split ?? 0) * 100));
      }),
      { numRuns: 100 },
    );
  });

  it("inventoryType maps correctly from inventory_type via mapInventoryType", () => {
    const itemWithInventoryTypeArb = fc.record({
      id: fc.uuid(),
      title: fc.string({ minLength: 1, maxLength: 300 }),
      tag_price: fc.integer({ min: 0, max: 99999999 }),
      quantity: fc.integer({ min: 1, max: 9999 }),
      split: fc.double({ min: 0, max: 1, noNaN: true }),
      account_id: fc.uuid(),
      inventory_type: fc.oneof(
        fc.constant("consignment"),
        fc.constant("retail"),
        fc.constant("buy_outright"),
        fc.constant(undefined),
      ),
      created: fc
        .integer({
          min: new Date("2000-01-01").getTime(),
          max: new Date("2030-12-31").getTime(),
        })
        .map((ts) => new Date(ts).toISOString()),
    });

    fc.assert(
      fc.property(itemWithInventoryTypeArb, (item) => {
        const result = mapConsignCloudItem(item as ConsignCloudItem);
        if (!result.success) throw new Error("Expected success");

        const expected =
          item.inventory_type === "retail" ||
          item.inventory_type === "buy_outright"
            ? "Retail"
            : "Consignment";
        expect(result.mapped.inventoryType).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("terms maps correctly from terms via mapTerms", () => {
    const itemWithTermsArb = fc.record({
      id: fc.uuid(),
      title: fc.string({ minLength: 1, maxLength: 300 }),
      tag_price: fc.integer({ min: 0, max: 99999999 }),
      quantity: fc.integer({ min: 1, max: 9999 }),
      split: fc.double({ min: 0, max: 1, noNaN: true }),
      account_id: fc.uuid(),
      terms: fc.oneof(
        fc.constant("return_to_consignor"),
        fc.constant("donate"),
        fc.constant("discard"),
        fc.constant(undefined),
      ),
      created: fc
        .integer({
          min: new Date("2000-01-01").getTime(),
          max: new Date("2030-12-31").getTime(),
        })
        .map((ts) => new Date(ts).toISOString()),
    });

    fc.assert(
      fc.property(itemWithTermsArb, (item) => {
        const result = mapConsignCloudItem(item as ConsignCloudItem);
        if (!result.success) throw new Error("Expected success");

        let expected: string;
        switch (item.terms) {
          case "return_to_consignor":
            expected = "Return To Consignor";
            break;
          case "discard":
            expected = "Discard";
            break;
          case "donate":
          default:
            expected = "Donate";
            break;
        }
        expect(result.mapped.terms).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});
