import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  mapItem,
  deriveItemStatus,
  STATUS_PRIORITY,
  SOLD_VARIANTS,
  ItemStatus,
} from "./item-mapper";

/**
 * Property tests for deriveItemStatus
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */
describe("deriveItemStatus property tests", () => {
  const allStatusKeys: ItemStatus[] = [...STATUS_PRIORITY];
  const soldVariantKeys = [...SOLD_VARIANTS];

  const statusBreakdownArb = fc.dictionary(
    fc.constantFrom(...allStatusKeys, ...soldVariantKeys),
    fc.integer({ min: 0, max: 100 }),
  );

  /**
   * Property 1: Status derivation returns highest-priority non-zero status
   * For any status breakdown object with at least one entry having a positive count,
   * deriveItemStatus SHALL return the status that appears earliest in STATUS_PRIORITY
   * among all entries with count > 0.
   *
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  it("Property 1: returns highest-priority non-zero status", () => {
    fc.assert(
      fc.property(statusBreakdownArb, (breakdown) => {
        const result = deriveItemStatus(breakdown);

        // Normalize the breakdown the same way deriveItemStatus does
        const normalized = new Map<ItemStatus, number>();
        for (const [key, count] of Object.entries(breakdown)) {
          if (count <= 0) continue;
          const normalizedKey: ItemStatus = SOLD_VARIANTS.has(key)
            ? "sold"
            : (key as ItemStatus);
          normalized.set(
            normalizedKey,
            (normalized.get(normalizedKey) ?? 0) + count,
          );
        }

        // If no positive counts, should default to "active"
        if (normalized.size === 0) {
          expect(result).toBe("active");
          return;
        }

        // Find expected: earliest STATUS_PRIORITY entry with non-zero normalized count
        const expected = STATUS_PRIORITY.find(
          (s) => (normalized.get(s) ?? 0) > 0,
        );
        expect(result).toBe(expected);
      }),
    );
  });

  /**
   * Property 1 edge cases: null, undefined, empty object, and all-zero counts
   * return "active".
   *
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  it("Property 1: defaults to active for null/undefined/empty/all-zero", () => {
    expect(deriveItemStatus(null)).toBe("active");
    expect(deriveItemStatus(undefined)).toBe("active");
    expect(deriveItemStatus({})).toBe("active");
    expect(deriveItemStatus({ active: 0, sold: 0, parked: 0 })).toBe("active");
  });

  /**
   * Property 2: Sold variant normalization
   * For any status breakdown object where only sold variant keys have positive counts,
   * deriveItemStatus SHALL return "sold".
   *
   * **Validates: Requirements 1.4**
   */
  it("Property 2: sold variant normalization collapses all variants to sold", () => {
    const soldOnlyBreakdownArb = fc
      .record({
        sold: fc.integer({ min: 0, max: 50 }),
        sold_on_shopify: fc.integer({ min: 0, max: 50 }),
        sold_on_square: fc.integer({ min: 0, max: 50 }),
        sold_on_third_party: fc.integer({ min: 0, max: 50 }),
      })
      .filter((obj) =>
        // At least one sold variant must have a positive count
        Object.values(obj).some((v) => v > 0),
      );

    fc.assert(
      fc.property(soldOnlyBreakdownArb, (breakdown) => {
        const result = deriveItemStatus(breakdown);
        expect(result).toBe("sold");
      }),
    );
  });
});

const validRawArb = fc.record({
  id: fc.uuid(),
  created: fc.constant("2024-01-15T10:30:00Z"),
  title: fc.string({ minLength: 1, maxLength: 200 }),
  tag_price: fc.integer({ min: 0, max: 99_999_999 }),
  quantity: fc.integer({ min: 0, max: 100 }),
  split: fc.double({ min: 0, max: 1, noNaN: true }),
  inventory_type: fc.constantFrom("consignment", "buy_outright", "retail"),
  terms: fc.constantFrom("return_to_consignor", "donate", "discard"),
  tax_exempt: fc.boolean(),
  status: fc.dictionary(
    fc.constantFrom(
      ...STATUS_PRIORITY,
      "sold_on_shopify",
      "sold_on_square",
      "sold_on_third_party",
    ),
    fc.integer({ min: 0, max: 10 }),
  ),
});

describe("mapItem property tests", () => {
  /**
   * Property 3: mapItem status integration
   * For any valid raw item record containing a status field that is a Record<string, number>,
   * the mapped item's status field SHALL equal deriveItemStatus(raw.status).
   *
   * **Validates: Requirements 1.6**
   */
  it("Property 3: mapped status equals deriveItemStatus(raw.status)", () => {
    fc.assert(
      fc.property(validRawArb, (raw) => {
        const result = mapItem(raw as Record<string, unknown>);
        expect(result.success).toBe(true);
        if (!result.success) return;

        const expectedStatus = deriveItemStatus(raw.status);
        expect(result.mapped.status).toBe(expectedStatus);
      }),
    );
  });

  /**
   * Property 4: Optional field passthrough
   * For any valid raw item record where optional fields are present as their expected types,
   * the corresponding mapped fields SHALL be present in the output with correct values.
   *
   * **Validates: Requirements 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15**
   */
  it("Property 4: optional fields are passed through correctly when present", () => {
    const optionalFieldsArb = fc.record({
      details: fc.string({ minLength: 1, maxLength: 6000 }),
      schedule_start: fc.string({ minLength: 1 }),
      expires: fc.string({ minLength: 1 }),
      last_sold: fc.string({ minLength: 1 }),
      last_viewed: fc.string({ minLength: 1 }),
      printed: fc.string({ minLength: 1 }),
      days_on_shelf: fc.integer(),
      deleted: fc.string({ minLength: 1 }),
      location: fc.record({ name: fc.string({ minLength: 1 }) }),
    });

    fc.assert(
      fc.property(validRawArb, optionalFieldsArb, (base, optionalFields) => {
        const raw = {
          ...base,
          ...optionalFields,
        } as Record<string, unknown>;

        const result = mapItem(raw);
        expect(result.success).toBe(true);
        if (!result.success) return;

        // details: string, max 5000 chars
        expect(result.mapped.details).toBe(
          optionalFields.details.slice(0, 5000),
        );

        // scheduleStart from raw.schedule_start
        expect(result.mapped.scheduleStart).toBe(optionalFields.schedule_start);

        // expirationDate from raw.expires
        expect(result.mapped.expirationDate).toBe(optionalFields.expires);

        // lastSold from raw.last_sold
        expect(result.mapped.lastSold).toBe(optionalFields.last_sold);

        // lastViewed from raw.last_viewed
        expect(result.mapped.lastViewed).toBe(optionalFields.last_viewed);

        // labelPrintedAt from raw.printed
        expect(result.mapped.labelPrintedAt).toBe(optionalFields.printed);

        // daysOnShelf from raw.days_on_shelf
        expect(result.mapped.daysOnShelf).toBe(optionalFields.days_on_shelf);

        // deleted from raw.deleted
        expect(result.mapped.deleted).toBe(optionalFields.deleted);

        // location from raw.location.name
        expect(result.mapped.location).toBe(optionalFields.location.name);
      }),
    );
  });

  /**
   * Property 5: Type-safe mapping never throws
   * For any Record<string, unknown> input (including arbitrary keys and value types),
   * mapItem SHALL either return { success: true } or { success: false } — it SHALL never
   * throw an uncaught exception.
   *
   * **Validates: Requirements 1.16**
   */
  it("Property 5: mapItem never throws for any Record<string, unknown> input", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.anything()),
        (arbitraryInput) => {
          const result = mapItem(arbitraryInput);
          expect(result).toHaveProperty("success");
          expect(typeof result.success).toBe("boolean");
          if (result.success) {
            expect(result).toHaveProperty("mapped");
          } else {
            expect(result).toHaveProperty("error");
          }
        },
      ),
    );
  });
});
