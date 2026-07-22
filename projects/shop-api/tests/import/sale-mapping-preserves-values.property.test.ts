import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { mapConsignCloudSale } from "../../src/import/sale-mapper";
import type {
  ConsignCloudSale,
  ConsignCloudLineItem,
} from "../../src/import/sale-consigncloud-client";

/**
 * Feature: sale-import-rework, Property 2: Sale mapping preserves monetary values and produces valid output
 *
 * Validates: Requirements 4.1, 3.1, 6.1
 *
 * For any valid ConsignCloudSale object, the mapper produces output where
 * subtotal/total/storePortion/cogs/change equal input values,
 * sourceId equals input id, number equals parsed integer of input number,
 * status equals input status, createdAt equals input created.
 */

const validStatusArb: fc.Arbitrary<string> = fc.constantFrom(
  "open",
  "finalized",
  "voided",
);

const validSaleArb: fc.Arbitrary<
  ConsignCloudSale & { line_items?: ConsignCloudLineItem[] }
> = fc.record({
  id: fc.uuid(),
  number: fc.integer({ min: 1, max: 9_999_999 }).map((n) => String(n)),
  status: validStatusArb,
  subtotal: fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
  total: fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
  store_portion: fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
  consignor_portion: fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
  cogs: fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
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
  voided: fc.oneof(
    fc
      .integer({ min: 946684800000, max: 1924991999000 })
      .map((ms) => new Date(ms).toISOString()),
    fc.constant(null),
  ),
  parked: fc.oneof(
    fc
      .integer({ min: 946684800000, max: 1924991999000 })
      .map((ms) => new Date(ms).toISOString()),
    fc.constant(null),
  ),
  refunded_amount: fc.integer({ min: 0, max: 1_000_000_00 }),
  cash_rounding_adjustment: fc.integer({ min: -100, max: 100 }),
  line_item_count: fc.integer({ min: 0, max: 100 }),
  notes: fc.constant([] as unknown[]),
  gift_cards: fc.constant([] as unknown[]),
  customer: fc.constant(null),
  register: fc.constant(null),
  register_report: fc.constant(null),
  pending_swipe: fc.constant(null),
  line_items: fc.constant(undefined),
});

describe("Property 2: Sale mapping preserves monetary values and produces valid output", () => {
  /**
   * Validates: Requirements 4.1
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
        expect(result.mapped.cogs).toBe(sale.cogs);
        expect(result.mapped.change).toBe(sale.change);
        expect(result.mapped.refundedAmount).toBe(sale.refunded_amount);
        expect(result.mapped.cashRoundingAdjustment).toBe(
          sale.cash_rounding_adjustment,
        );

        // Identity fields preserved
        expect(result.mapped.sourceId).toBe(sale.id);
        expect(result.mapped.number).toBe(parseInt(sale.number, 10));
        expect(result.mapped.createdAt).toBe(sale.created);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.1
   */
  it("mapped result status matches input status directly", () => {
    fc.assert(
      fc.property(validSaleArb, (sale) => {
        const result = mapConsignCloudSale(sale);

        expect(result.success).toBe(true);

        if (!result.success) return;

        expect(result.mapped.status).toBe(sale.status);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 4.1
   */
  it("timestamp fields map correctly from input", () => {
    fc.assert(
      fc.property(validSaleArb, (sale) => {
        const result = mapConsignCloudSale(sale);

        expect(result.success).toBe(true);

        if (!result.success) return;

        expect(result.mapped.finalizedAt).toBe(sale.finalized ?? null);
        expect(result.mapped.voidedAt).toBe(sale.voided ?? null);
        expect(result.mapped.parkedAt).toBe(sale.parked ?? null);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 4.1
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
