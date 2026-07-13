import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { mapConsignCloudSale } from "../../src/import/sale-mapper";
import type {
  ConsignCloudSale,
  ConsignCloudLineItem,
} from "../../src/import/sale-consigncloud-client";

/**
 * Feature: consigncloud-sale-import, Property 2: Sale mapping preserves monetary values and produces valid output
 *
 * Validates: Requirements 6.1
 *
 * For any valid ConsignCloudSale object, the mapper produces output where
 * subtotal/total/storePortion/consignorPortion/change equal input values,
 * sourceId equals input id, sourceNumber equals input number, createdAt equals input created.
 */

const validSaleArb: fc.Arbitrary<
  ConsignCloudSale & { line_items?: ConsignCloudLineItem[] }
> = fc.record({
  id: fc.uuid(),
  number: fc.string({ minLength: 1, maxLength: 20 }),
  status: fc.constant("finalized" as string),
  subtotal: fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
  total: fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
  store_portion: fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
  consignor_portion: fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
  change: fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
  memo: fc.oneof(fc.string({ maxLength: 200 }), fc.constant(null)),
  cashier: fc.oneof(
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
    }),
    fc.constant(null),
  ),
  created: fc
    .integer({ min: 946684800000, max: 1924991999000 })
    .map((ms) => new Date(ms).toISOString()),
  finalized: fc.oneof(
    fc
      .integer({ min: 946684800000, max: 1924991999000 })
      .map((ms) => new Date(ms).toISOString()),
    fc.constant(null),
  ),
  voided: fc.constant(null),
  line_items: fc.option(
    fc.array(
      fc.record({
        id: fc.uuid(),
        item: fc.oneof(fc.uuid(), fc.record({ id: fc.uuid() })),
        price: fc.integer({ min: 0, max: 1_000_000_00 }),
        consignor_portion: fc.integer({ min: 0, max: 1_000_000_00 }),
        store_portion: fc.integer({ min: 0, max: 1_000_000_00 }),
        quantity: fc.integer({ min: 1, max: 100 }),
        discount: fc.integer({ min: 0, max: 1_000_000_00 }),
      }),
      { minLength: 0, maxLength: 10 },
    ),
    { nil: undefined },
  ),
});

describe("Property 2: Sale mapping preserves monetary values and produces valid output", () => {
  /**
   * Validates: Requirements 6.1
   */
  it("monetary fields and identity fields are preserved exactly in the mapped output", () => {
    fc.assert(
      fc.property(validSaleArb, (sale) => {
        const result = mapConsignCloudSale(sale);

        expect(result.success).toBe(true);

        if (!result.success) return;

        // Monetary values preserved
        expect(result.mapped.subtotal).toBe(sale.subtotal);
        expect(result.mapped.total).toBe(sale.total);
        expect(result.mapped.storePortion).toBe(sale.store_portion);
        expect(result.mapped.consignorPortion).toBe(sale.consignor_portion);
        expect(result.mapped.change).toBe(sale.change);

        // Identity fields preserved
        expect(result.mapped.sourceId).toBe(sale.id);
        expect(result.mapped.sourceNumber).toBe(sale.number);
        expect(result.mapped.createdAt).toBe(sale.created);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.1
   */
  it("mapped result always has status 'finalized' and voidedAt null", () => {
    fc.assert(
      fc.property(validSaleArb, (sale) => {
        const result = mapConsignCloudSale(sale);

        expect(result.success).toBe(true);

        if (!result.success) return;

        expect(result.mapped.status).toBe("finalized");
        expect(result.mapped.voidedAt).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.1
   */
  it("finalizedAt equals input finalized value", () => {
    fc.assert(
      fc.property(validSaleArb, (sale) => {
        const result = mapConsignCloudSale(sale);

        expect(result.success).toBe(true);

        if (!result.success) return;

        expect(result.mapped.finalizedAt).toBe(sale.finalized ?? null);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.1
   */
  it("memo maps correctly (null preserved, string preserved)", () => {
    fc.assert(
      fc.property(validSaleArb, (sale) => {
        const result = mapConsignCloudSale(sale);

        expect(result.success).toBe(true);

        if (!result.success) return;

        expect(result.mapped.memo).toBe(sale.memo ?? null);
      }),
      { numRuns: 100 },
    );
  });
});
