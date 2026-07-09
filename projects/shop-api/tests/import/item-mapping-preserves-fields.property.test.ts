import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { mapConsignCloudItem } from "../../src/import/item-mapper";
import { ConsignCloudItem } from "../../src/import/item-consigncloud-client";

/** Feature: consigncloud-item-import, Property 1: Item mapping preserves required fields */

describe("Property 1: Item mapping preserves required fields", () => {
  const validConsignCloudItemArb: fc.Arbitrary<ConsignCloudItem> = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 300 }),
    price: fc.integer({ min: 0, max: 99999999 }).map((n) => n / 100),
    quantity: fc.integer({ min: 1, max: 9999 }),
    consignor_split: fc.integer({ min: 0, max: 100 }),
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
        expect(result.mapped.title).toBe(item.name.slice(0, 200));
      }),
      { numRuns: 100 },
    );
  });

  it("tagPrice equals source price", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const result = mapConsignCloudItem(item);
        if (!result.success) throw new Error("Expected success");
        expect(result.mapped.tagPrice).toBe(item.price);
      }),
      { numRuns: 100 },
    );
  });

  it("quantity equals source quantity", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const result = mapConsignCloudItem(item);
        if (!result.success) throw new Error("Expected success");
        expect(result.mapped.quantity).toBe(item.quantity);
      }),
      { numRuns: 100 },
    );
  });

  it("split equals source consignor_split", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const result = mapConsignCloudItem(item);
        if (!result.success) throw new Error("Expected success");
        expect(result.mapped.split).toBe(item.consignor_split);
      }),
      { numRuns: 100 },
    );
  });

  it("inventoryType is always Consignment", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const result = mapConsignCloudItem(item);
        if (!result.success) throw new Error("Expected success");
        expect(result.mapped.inventoryType).toBe("Consignment");
      }),
      { numRuns: 100 },
    );
  });

  it("terms is always Return To Consignor", () => {
    fc.assert(
      fc.property(validConsignCloudItemArb, (item) => {
        const result = mapConsignCloudItem(item);
        if (!result.success) throw new Error("Expected success");
        expect(result.mapped.terms).toBe("Return To Consignor");
      }),
      { numRuns: 100 },
    );
  });
});
