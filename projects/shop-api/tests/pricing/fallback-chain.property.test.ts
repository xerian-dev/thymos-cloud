import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolvePricingRef } from "../../src/pricing/fallback-lookup.js";

/**
 * Feature: auto-tag-price, Property 7: Fallback chain
 *
 * Validates: Requirements 5.4, 5.5, 5.6
 *
 * For any item with brand B and category C:
 * - If `PRICING_REF#B#C` exists → use it (brand×category match)
 * - If not, if `PRICING_REF#_NONE_#C` exists → use it (category-only fallback)
 * - If neither exists → return null suggestion
 * - The fallback never skips a level (never returns category-only when brand×category exists)
 */

/** Arbitrary for non-empty brand strings (alphanumeric, no hash characters) */
const arbBrand = fc.string({ minLength: 1, maxLength: 30 }).filter(
  (s) => s.trim().length > 0 && !s.includes("#"),
);

/** Arbitrary for category IDs (UUID-like strings) */
const arbCategoryId = fc.uuid();

describe("Fallback chain properties", () => {
  it("returns brand_category when brand×category key exists in the map", () => {
    fc.assert(
      fc.property(arbBrand, arbCategoryId, (brand: string, categoryId: string) => {
        const refData = { referencePrice: 50 };
        const refs = new Map<string, unknown>();
        refs.set(`PRICING_REF#${brand}#${categoryId}`, refData);
        // Also add a category-only key to ensure it's not chosen
        refs.set(`PRICING_REF#_NONE_#${categoryId}`, { referencePrice: 30 });

        const result = resolvePricingRef({ brand, categoryId }, refs);

        expect(result.found).toBe(true);
        if (result.found) {
          expect(result.source).toBe("brand_category");
          expect(result.ref).toBe(refData);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("returns category_only when brand×category doesn't exist but category-only does", () => {
    fc.assert(
      fc.property(arbBrand, arbCategoryId, (brand: string, categoryId: string) => {
        const refData = { referencePrice: 30 };
        const refs = new Map<string, unknown>();
        // No brand×category key, only category-only
        refs.set(`PRICING_REF#_NONE_#${categoryId}`, refData);

        const result = resolvePricingRef({ brand, categoryId }, refs);

        expect(result.found).toBe(true);
        if (result.found) {
          expect(result.source).toBe("category_only");
          expect(result.ref).toBe(refData);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("returns found=false when neither brand×category nor category-only exists", () => {
    fc.assert(
      fc.property(arbBrand, arbCategoryId, (brand: string, categoryId: string) => {
        const refs = new Map<string, unknown>();
        // Empty map — nothing exists

        const result = resolvePricingRef({ brand, categoryId }, refs);

        expect(result.found).toBe(false);
        expect(result.source).toBeNull();
        expect(result.ref).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("never returns category_only when brand×category is available (consistency)", () => {
    fc.assert(
      fc.property(
        arbBrand,
        arbCategoryId,
        fc.boolean(),
        (brand: string, categoryId: string, includeCategoryOnly: boolean) => {
          const brandCategoryRef = { referencePrice: 50 };
          const categoryOnlyRef = { referencePrice: 30 };
          const refs = new Map<string, unknown>();

          // Always include brand×category
          refs.set(`PRICING_REF#${brand}#${categoryId}`, brandCategoryRef);

          // Optionally include category-only as well
          if (includeCategoryOnly) {
            refs.set(`PRICING_REF#_NONE_#${categoryId}`, categoryOnlyRef);
          }

          const result = resolvePricingRef({ brand, categoryId }, refs);

          // Must always pick brand×category, never category-only
          expect(result.found).toBe(true);
          if (result.found) {
            expect(result.source).toBe("brand_category");
            expect(result.ref).toBe(brandCategoryRef);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("falls back to category_only when brand is null", () => {
    fc.assert(
      fc.property(arbCategoryId, (categoryId: string) => {
        const refData = { referencePrice: 25 };
        const refs = new Map<string, unknown>();
        refs.set(`PRICING_REF#_NONE_#${categoryId}`, refData);

        const result = resolvePricingRef({ brand: null, categoryId }, refs);

        expect(result.found).toBe(true);
        if (result.found) {
          expect(result.source).toBe("category_only");
          expect(result.ref).toBe(refData);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("returns found=false when brand is null and no category-only exists", () => {
    fc.assert(
      fc.property(arbCategoryId, (categoryId: string) => {
        const refs = new Map<string, unknown>();

        const result = resolvePricingRef({ brand: null, categoryId }, refs);

        expect(result.found).toBe(false);
        expect(result.source).toBeNull();
        expect(result.ref).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
