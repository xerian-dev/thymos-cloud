import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { applyItemUpdate } from "../src/routes/update-item";
import {
  normalizeItemAttributes,
  type ValidatedItemInput,
} from "../src/item-validation";

/**
 * Feature: item-creation, Property 8: Update immutability of identity fields
 *
 * Validates: Requirements 4.3
 */
describe("Property 8: Update immutability of identity fields", () => {
  const inventoryTypeArb = fc.constantFrom(
    "Consignment" as const,
    "Retail" as const,
  );
  const termsArb = fc.constantFrom(
    "Return To Consignor" as const,
    "Donate" as const,
    "Discard" as const,
  );

  /** Generates an arbitrary existing item identity (uuid, sku, createdAt) */
  const existingItemArb = fc.record({
    uuid: fc.uuid(),
    sku: fc.integer({ min: 1, max: 9999999 }),
    createdAt: fc
      .integer({
        min: new Date("2020-01-01T00:00:00Z").getTime(),
        max: new Date("2024-12-31T23:59:59Z").getTime(),
      })
      .map((ts) => new Date(ts).toISOString()),
  });

  /** Generates a valid ValidatedItemInput for the update */
  const validUpdateInputArb: fc.Arbitrary<ValidatedItemInput> = fc.record({
    accountId: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 200 }),
    tagPrice: fc
      .double({ min: 0, max: 999999.99, noNaN: true })
      .map((v) => Math.round(v * 100) / 100),
    quantity: fc.integer({ min: 1, max: 9999 }),
    split: fc.integer({ min: 0, max: 100 }),
    inventoryType: inventoryTypeArb,
    terms: termsArb,
  });

  it("uuid, sku, and createdAt remain unchanged after applying any valid update", () => {
    fc.assert(
      fc.property(
        existingItemArb,
        validUpdateInputArb,
        (existingItem, updateInput) => {
          const normalized = normalizeItemAttributes(updateInput);
          const result = applyItemUpdate(existingItem, normalized);

          // Identity fields must be preserved exactly
          expect(result.uuid).toBe(existingItem.uuid);
          expect(result.sku).toBe(existingItem.sku);
          expect(result.createdAt).toBe(existingItem.createdAt);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("uuid, sku, and createdAt remain unchanged even when update includes optional fields", () => {
    const optionalFieldsArb = fc.record(
      {
        description: fc.string({ minLength: 1, maxLength: 2000 }),
        details: fc.string({ minLength: 1, maxLength: 5000 }),
        category: fc.string({ minLength: 1, maxLength: 50 }),
        brand: fc.string({ minLength: 1, maxLength: 50 }),
        color: fc.string({ minLength: 1, maxLength: 50 }),
        size: fc.string({ minLength: 1, maxLength: 50 }),
        shelf: fc.string({ minLength: 1, maxLength: 50 }),
        tags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
          minLength: 1,
          maxLength: 20,
        }),
        imageKeys: fc.array(
          fc
            .tuple(
              fc.uuid(),
              fc.stringMatching(/^[a-f0-9]{8}$/),
              fc.constantFrom("jpg", "png", "webp"),
            )
            .map(([uuid, id, ext]) => `items/${uuid}/${id}.${ext}`),
          { minLength: 1, maxLength: 10 },
        ),
        taxExempt: fc.boolean(),
      },
      { requiredKeys: [] },
    );

    fc.assert(
      fc.property(
        existingItemArb,
        validUpdateInputArb,
        optionalFieldsArb,
        (existingItem, baseUpdate, optionalFields) => {
          const updateInput: ValidatedItemInput = {
            ...baseUpdate,
            ...optionalFields,
          };
          const normalized = normalizeItemAttributes(updateInput);
          const result = applyItemUpdate(existingItem, normalized);

          // Identity fields must still be preserved
          expect(result.uuid).toBe(existingItem.uuid);
          expect(result.sku).toBe(existingItem.sku);
          expect(result.createdAt).toBe(existingItem.createdAt);
        },
      ),
      { numRuns: 100 },
    );
  });
});
