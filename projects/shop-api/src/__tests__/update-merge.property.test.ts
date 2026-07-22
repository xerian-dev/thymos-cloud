import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { applySaleUpdate } from "../routes/update-sale";
import type { ValidatedSaleUpdate } from "../sale-update-validation";

/**
 * **Validates: Requirements 4.2**
 */

// Generator for an existing sale record
const existingSaleArb = fc.record({
  PK: fc.constant("SALE#some-uuid"),
  SK: fc.constant("METADATA"),
  GSI1PK: fc.constant("SALES"),
  GSI1SK: fc.constant("SALE#0000042"),
  uuid: fc.uuid(),
  saleNumber: fc.nat({ max: 9999999 }),
  status: fc.constantFrom("open", "finalized", "voided"),
  cashierId: fc.string({ minLength: 1 }),
  createdAt: fc.constant("2024-01-01T00:00:00.000Z"),
  updatedAt: fc.constant("2024-01-01T00:00:00.000Z"),
});

// Generator for a valid update payload
const updateArb: fc.Arbitrary<ValidatedSaleUpdate> = fc.record({
  status: fc.option(
    fc.constantFrom("open" as const, "finalized" as const, "voided" as const),
    { nil: undefined },
  ),
  cashierId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  subtotal: fc.option(fc.double({ noNaN: true }), { nil: undefined }),
  total: fc.option(fc.double({ noNaN: true }), { nil: undefined }),
  storePortion: fc.option(fc.double({ noNaN: true }), { nil: undefined }),
  consignorPortion: fc.option(fc.double({ noNaN: true }), { nil: undefined }),
  change: fc.option(fc.double({ noNaN: true }), { nil: undefined }),
  memo: fc.option(fc.string(), { nil: undefined }),
  finalizedAt: fc.option(fc.string(), { nil: undefined }),
  voidedAt: fc.option(fc.string(), { nil: undefined }),
});

describe("Feature: sales-backend-api, Property 5: Update merge preserves identity", () => {
  it("preserves uuid, saleNumber, and createdAt from the original record", () => {
    fc.assert(
      fc.property(existingSaleArb, updateArb, (existing, update) => {
        const result = applySaleUpdate(existing, update);
        expect(result.uuid).toBe(existing.uuid);
        expect(result.saleNumber).toBe(existing.saleNumber);
        expect(result.createdAt).toBe(existing.createdAt);
      }),
      { numRuns: 200 },
    );
  });

  it("applies mutable fields from the update", () => {
    fc.assert(
      fc.property(existingSaleArb, updateArb, (existing, update) => {
        const result = applySaleUpdate(existing, update);
        // Each field in the update (if defined) should be reflected in result
        if (update.status !== undefined)
          expect(result.status).toBe(update.status);
        if (update.cashierId !== undefined)
          expect(result.cashierId).toBe(update.cashierId);
        if (update.subtotal !== undefined)
          expect(result.subtotal).toBe(update.subtotal);
        if (update.total !== undefined) expect(result.total).toBe(update.total);
        if (update.storePortion !== undefined)
          expect(result.storePortion).toBe(update.storePortion);
        if (update.consignorPortion !== undefined)
          expect(result.consignorPortion).toBe(update.consignorPortion);
        if (update.change !== undefined)
          expect(result.change).toBe(update.change);
        if (update.memo !== undefined) expect(result.memo).toBe(update.memo);
        if (update.finalizedAt !== undefined)
          expect(result.finalizedAt).toBe(update.finalizedAt);
        if (update.voidedAt !== undefined)
          expect(result.voidedAt).toBe(update.voidedAt);
      }),
      { numRuns: 200 },
    );
  });

  it("sets updatedAt to a new ISO timestamp", () => {
    fc.assert(
      fc.property(existingSaleArb, updateArb, (existing, update) => {
        const before = new Date().toISOString();
        const result = applySaleUpdate(existing, update);
        const after = new Date().toISOString();
        expect(result.updatedAt).toBeDefined();
        expect(typeof result.updatedAt).toBe("string");
        // updatedAt should be between before and after
        expect((result.updatedAt as string) >= before).toBe(true);
        expect((result.updatedAt as string) <= after).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
