import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { ConsignCloudItem } from "../../src/import/item-consigncloud-client";
import { isDeletedItem } from "../../src/import/item-filter";

/** Feature: consigncloud-item-import, Property 3: Deleted items are always skipped */

/**
 * Generator for a random ISO date string (used for the `deleted` and `created` fields).
 */
const isoDateArb = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 59 }),
  )
  .map(
    ([year, month, day, hour, min, sec]) =>
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.000Z`,
  );

/**
 * Generator for a ConsignCloudItem with random field values.
 * All fields are randomized to demonstrate the property holds regardless of other fields' validity.
 */
function consignCloudItemArb(
  deletedArb: fc.Arbitrary<string | null | undefined>,
): fc.Arbitrary<ConsignCloudItem> {
  return fc.record({
    id: fc.uuid(),
    name: fc.oneof(
      fc.string({ minLength: 0, maxLength: 300 }),
      fc.constant(""),
    ),
    price: fc.oneof(
      fc.double({ min: -100, max: 1_000_000, noNaN: true }),
      fc.constant(0),
    ),
    quantity: fc.oneof(fc.integer({ min: -10, max: 20_000 }), fc.constant(1)),
    consignor_split: fc.oneof(
      fc.double({ min: -10, max: 200, noNaN: true }),
      fc.constant(50),
    ),
    account_id: fc.uuid(),
    category: fc.oneof(
      fc.constant(null),
      fc.constant(undefined as unknown as null),
      fc.record({ name: fc.string({ minLength: 1, maxLength: 50 }) }),
    ),
    tags: fc.oneof(
      fc.constant(undefined as unknown as string[]),
      fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 25 }),
    ),
    description: fc.oneof(
      fc.constant(undefined as unknown as string),
      fc.string({ maxLength: 3000 }),
    ),
    brand: fc.oneof(
      fc.constant(undefined as unknown as string),
      fc.string({ maxLength: 50 }),
    ),
    color: fc.oneof(
      fc.constant(undefined as unknown as string),
      fc.string({ maxLength: 30 }),
    ),
    size: fc.oneof(
      fc.constant(undefined as unknown as string),
      fc.string({ maxLength: 20 }),
    ),
    shelf: fc.oneof(
      fc.constant(null),
      fc.constant(undefined as unknown as null),
      fc.record({ name: fc.string({ minLength: 1, maxLength: 30 }) }),
    ),
    location: fc.oneof(
      fc.constant(null),
      fc.constant(undefined as unknown as null),
      fc.record({ name: fc.string({ minLength: 1, maxLength: 30 }) }),
    ),
    tax_exempt: fc.oneof(
      fc.constant(undefined as unknown as boolean),
      fc.boolean(),
    ),
    images: fc.oneof(
      fc.constant(undefined as unknown as Array<{ url: string }>),
      fc.array(fc.record({ url: fc.webUrl() }), { maxLength: 10 }),
    ),
    created: isoDateArb,
    deleted: deletedArb as fc.Arbitrary<string | null | undefined>,
  }) as fc.Arbitrary<ConsignCloudItem>;
}

describe("Property 3: Deleted items are always skipped", () => {
  /**
   * Validates: Requirements 5.6
   *
   * For any ConsignCloudItem with a non-null `deleted` field (any date string),
   * the item is identified as deleted and should be skipped, regardless of
   * whether other fields are valid or invalid.
   */
  it("items with non-null deleted field are identified as deleted", () => {
    const deletedItemArb = consignCloudItemArb(isoDateArb);

    fc.assert(
      fc.property(deletedItemArb, (item) => {
        expect(item.deleted).not.toBeNull();
        expect(item.deleted).not.toBeUndefined();
        expect(isDeletedItem(item)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.6
   *
   * For items with `deleted` set to null, isDeletedItem returns false
   * (these items should NOT be skipped due to deletion).
   */
  it("items with null deleted field are NOT identified as deleted", () => {
    const nonDeletedNullArb = consignCloudItemArb(fc.constant(null));

    fc.assert(
      fc.property(nonDeletedNullArb, (item) => {
        expect(item.deleted).toBeNull();
        expect(isDeletedItem(item)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.6
   *
   * For items with `deleted` set to undefined, isDeletedItem returns false
   * (these items should NOT be skipped due to deletion).
   */
  it("items with undefined deleted field are NOT identified as deleted", () => {
    const nonDeletedUndefinedArb = consignCloudItemArb(
      fc.constant(undefined as unknown as string | null | undefined),
    );

    fc.assert(
      fc.property(nonDeletedUndefinedArb, (item) => {
        expect(item.deleted).toBeUndefined();
        expect(isDeletedItem(item)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.6
   *
   * The deletion check is independent of other fields' validity.
   * Even if all other fields are invalid (empty name, negative price, etc.),
   * the deleted check still correctly identifies the item as deleted.
   */
  it("deleted check is independent of other fields validity", () => {
    const itemWithInvalidFieldsButDeleted = fc.record({
      id: fc.uuid(),
      name: fc.constant(""),
      price: fc.constant(-1),
      quantity: fc.constant(0),
      consignor_split: fc.constant(-5),
      account_id: fc.constant(""),
      created: isoDateArb,
      deleted: isoDateArb,
    }) as fc.Arbitrary<ConsignCloudItem>;

    fc.assert(
      fc.property(itemWithInvalidFieldsButDeleted, (item) => {
        expect(isDeletedItem(item)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
