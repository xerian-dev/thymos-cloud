import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  normalizeItemAttributes,
  ValidatedItemInput,
} from "../src/item-validation";

/**
 * Feature: item-creation, Property 6: Optional field normalization
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11
 */
describe("Property 6: Optional field normalization", () => {
  const OPTIONAL_STRING_FIELDS = [
    "category",
    "brand",
    "color",
    "size",
    "shelf",
    "details",
    "description",
  ] as const;

  const inventoryTypeArb = fc.constantFrom(
    "Consignment" as const,
    "Retail" as const,
  );
  const termsArb = fc.constantFrom(
    "Return To Consignor" as const,
    "Donate" as const,
    "Discard" as const,
  );

  /** Generates a valid base ValidatedItemInput with required fields only */
  const baseInputArb: fc.Arbitrary<ValidatedItemInput> = fc.record({
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

  it("omitted or empty-string optional fields are NOT present in normalized output", () => {
    // For each optional string field, generate an input where the field is either
    // undefined or empty string — the normalized output must not include that attribute.
    const optionalFieldArb = fc.record({
      base: baseInputArb,
      fieldToTest: fc.constantFrom(...OPTIONAL_STRING_FIELDS),
      variant: fc.constantFrom("undefined", "empty-string"),
    });

    fc.assert(
      fc.property(optionalFieldArb, ({ base, fieldToTest, variant }) => {
        const input: ValidatedItemInput = { ...base };
        if (variant === "empty-string") {
          (input as Record<string, unknown>)[fieldToTest] = "";
        }
        // If variant is "undefined", the field is simply not set (already the case from baseInputArb)

        const result = normalizeItemAttributes(input);
        expect(fieldToTest in result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("taxExempt defaults to false when omitted", () => {
    fc.assert(
      fc.property(baseInputArb, (base) => {
        // Ensure taxExempt is not set
        const input: ValidatedItemInput = { ...base };
        delete input.taxExempt;

        const result = normalizeItemAttributes(input);
        expect(result.taxExempt).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("tags are NOT present in normalized output when undefined or empty array", () => {
    const variantArb = fc.constantFrom("undefined", "empty-array");

    fc.assert(
      fc.property(baseInputArb, variantArb, (base, variant) => {
        const input: ValidatedItemInput = { ...base };
        if (variant === "empty-array") {
          input.tags = [];
        }
        // If variant is "undefined", tags is not set

        const result = normalizeItemAttributes(input);
        expect("tags" in result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: item-creation, Property 7: Image key order preservation
 *
 * Validates: Requirements 11.5
 */
describe("Property 7: Image key order preservation", () => {
  const inventoryTypeArb = fc.constantFrom(
    "Consignment" as const,
    "Retail" as const,
  );
  const termsArb = fc.constantFrom(
    "Return To Consignor" as const,
    "Donate" as const,
    "Discard" as const,
  );

  const baseInputArb: fc.Arbitrary<ValidatedItemInput> = fc.record({
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

  /** Generates a valid S3 key string (e.g., "items/<uuid>/<randomId>.<ext>") */
  const s3KeyArb = fc
    .tuple(
      fc.uuid(),
      fc.stringMatching(/^[a-f0-9]{8,16}$/),
      fc.constantFrom("jpg", "png", "webp"),
    )
    .map(([uuid, randomId, ext]) => `items/${uuid}/${randomId}.${ext}`);

  it("normalized imageKeys contain the exact same elements in the exact same order", () => {
    const imageKeysArb = fc.array(s3KeyArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(baseInputArb, imageKeysArb, (base, imageKeys) => {
        const input: ValidatedItemInput = { ...base, imageKeys };

        const result = normalizeItemAttributes(input);

        // imageKeys must be present
        expect(result.imageKeys).toBeDefined();
        // Must have the same length
        expect(result.imageKeys!.length).toBe(imageKeys.length);
        // Each element must be identical and in the same position
        for (let i = 0; i < imageKeys.length; i++) {
          expect(result.imageKeys![i]).toBe(imageKeys[i]);
        }
      }),
      { numRuns: 100 },
    );
  });
});
