import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  mapConsignCloudSale,
  buildLineItemSk,
} from "../../src/import/sale-mapper";
import { ConsignCloudLineItem } from "../../src/import/sale-consigncloud-client";

/**
 * Feature: consigncloud-sale-import, Property 4: Line item mapping produces correctly indexed records with preserved values
 *
 * Validates: Requirements 7.1, 7.2
 *
 * For any list of line items (0 to N), mapping produces N records where
 * SK for index i equals `LINE_ITEM#` + i zero-padded to 4 digits, and
 * salePrice/discount/consignorPortion/storePortion equal input values.
 */

function arbitraryLineItem(): fc.Arbitrary<ConsignCloudLineItem> {
  return fc.record({
    id: fc.uuid(),
    item: fc.record({
      id: fc.uuid(),
      image: fc.constant(null),
      quantity: fc.integer({ min: 1, max: 10 }),
      title: fc.string({ minLength: 1, maxLength: 20 }),
      sku: fc.string({ minLength: 1, maxLength: 10 }),
    }),
    unit_price: fc.integer({ min: 0, max: 100_000_00 }),
    consignor_portion: fc.integer({ min: 0, max: 100_000_00 }),
    store_portion: fc.integer({ min: 0, max: 100_000_00 }),
    split_price: fc.integer({ min: 0, max: 100_000_00 }),
    split: fc.double({ min: 0, max: 1, noNaN: true }),
    cost: fc.constant(0),
    taxed_price: fc.integer({ min: 0, max: 100_000_00 }),
    tax_exempt: fc.boolean(),
    days_on_shelf: fc.integer({ min: 0, max: 365 }),
    quantity: fc.integer({ min: 1, max: 100 }),
    refunded_quantity: fc.constant(0),
    sale: fc.uuid(),
    created: fc.constant("2025-01-01T00:00:00.000Z"),
    discounts: fc.constant([]),
    surcharges: fc.constant([]),
    taxes: fc.constant([]),
    applied_discounts: fc.array(
      fc.record({
        id: fc.uuid(),
        amount: fc.integer({ min: 0, max: 10_000 }),
        level: fc.constant("item"),
        discount: fc.uuid(),
      }),
      { minLength: 0, maxLength: 3 },
    ),
    applied_surcharges: fc.constant([]),
    applied_taxes: fc.constant([]),
  });
}

describe("Property 4: Line item mapping produces correctly indexed records with preserved values", () => {
  /**
   * Validates: Requirements 7.1, 7.2
   */
  it("mapping produces N line items with preserved field values", () => {
    const lineItemsArb = fc.array(arbitraryLineItem(), {
      minLength: 0,
      maxLength: 50,
    });

    fc.assert(
      fc.property(lineItemsArb, (lineItems) => {
        const sale = {
          id: "sale-001",
          number: "1001",
          status: "finalized" as const,
          subtotal: 5000,
          total: 5000,
          store_portion: 2500,
          consignor_portion: 2500,
          change: 0,
          memo: null,
          cashier: null,
          created: "2025-01-01T00:00:00.000Z",
          finalized: "2025-01-02T00:00:00.000Z",
          voided: null,
          line_items: lineItems,
        };

        const result = mapConsignCloudSale(sale);

        // 1. The mapping result has success: true
        expect(result.success).toBe(true);

        if (!result.success) return;

        // 2. The lineItems array has the same length as the input
        expect(result.lineItems).toHaveLength(lineItems.length);

        // 3. For each index i, field values are preserved
        for (let i = 0; i < lineItems.length; i++) {
          const expectedDiscount = lineItems[i].applied_discounts.reduce(
            (sum, d) => sum + d.amount,
            0,
          );
          expect(result.lineItems[i].salePrice).toBe(lineItems[i].unit_price);
          expect(result.lineItems[i].discount).toBe(expectedDiscount);
          expect(result.lineItems[i].consignorPortion).toBe(
            lineItems[i].consignor_portion,
          );
          expect(result.lineItems[i].storePortion).toBe(
            lineItems[i].store_portion,
          );
        }

        // 4. For each index i, buildLineItemSk produces the correct SK pattern
        for (let i = 0; i < lineItems.length; i++) {
          const expectedSk = `LINE_ITEM#${String(i).padStart(4, "0")}`;
          expect(buildLineItemSk(i)).toBe(expectedSk);
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 7.1, 7.2
   */
  it("buildLineItemSk produces zero-padded 4-digit index for any valid index", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9999 }), (index) => {
        const sk = buildLineItemSk(index);
        const expectedSk = `LINE_ITEM#${String(index).padStart(4, "0")}`;
        expect(sk).toBe(expectedSk);
      }),
      { numRuns: 200 },
    );
  });
});
