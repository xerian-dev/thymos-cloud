import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolvePricingRef } from "../../src/pricing/fallback-lookup.js";
import type { PricingRefData } from "../../src/pricing/fallback-lookup.js";

/**
 * Feature: description-pricing, Property: 6-level fallback chain
 *
 * Validates: Requirements FR-2
 *
 * For any item with brand B, description D, and category C:
 * - Tier 1 (sold): brand×desc → desc → brand×cat → cat
 * - Tier 2 (unsold): brand×desc → desc
 * - The fallback never skips a level
 */

/** Arbitrary for non-empty brand strings (alphanumeric, no hash characters) */
const arbBrand = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0 && !s.includes("#"));

/** Arbitrary for category IDs (UUID-like strings) */
const arbCategoryId = fc.uuid();

/** Arbitrary for description strings */
const arbDescription = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0 && !s.includes("#"));

function makeSoldRef(price: number): PricingRefData {
  return { sampleSize: 10, unsoldCount: 0 };
}

function makeUnsoldRef(): PricingRefData {
  return { sampleSize: 0, unsoldCount: 5 };
}

describe("6-level fallback chain properties", () => {
  it("level 1: returns brand×description when it exists with sampleSize > 0", () => {
    fc.assert(
      fc.property(
        arbBrand,
        arbDescription,
        arbCategoryId,
        (brand, description, categoryId) => {
          const refData = makeSoldRef(50);
          const refs = new Map<string, PricingRefData>();
          refs.set(`PRICING_REF#${brand}#DESC#${description}`, refData);
          // Also add lower-priority keys to confirm they're not chosen
          refs.set(`PRICING_REF#_NONE_#DESC#${description}`, makeSoldRef(40));
          refs.set(`PRICING_REF#${brand}#${categoryId}`, makeSoldRef(30));

          const result = resolvePricingRef(
            { brand, description, categoryId },
            refs,
          );

          expect(result.found).toBe(true);
          if (result.found) {
            expect(result.source).toBe("sold");
            expect(result.level).toBe(1);
            expect(result.ref).toBe(refData);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("level 2: returns description-only when brand×desc not found", () => {
    fc.assert(
      fc.property(
        arbBrand,
        arbDescription,
        arbCategoryId,
        (brand, description, categoryId) => {
          const refData = makeSoldRef(40);
          const refs = new Map<string, PricingRefData>();
          // No brand×desc key
          refs.set(`PRICING_REF#_NONE_#DESC#${description}`, refData);
          refs.set(`PRICING_REF#${brand}#${categoryId}`, makeSoldRef(30));

          const result = resolvePricingRef(
            { brand, description, categoryId },
            refs,
          );

          expect(result.found).toBe(true);
          if (result.found) {
            expect(result.source).toBe("sold");
            expect(result.level).toBe(2);
            expect(result.ref).toBe(refData);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("level 3: returns brand×category when desc levels not found", () => {
    fc.assert(
      fc.property(
        arbBrand,
        arbDescription,
        arbCategoryId,
        (brand, description, categoryId) => {
          const refData = makeSoldRef(30);
          const refs = new Map<string, PricingRefData>();
          // No desc-based keys
          refs.set(`PRICING_REF#${brand}#${categoryId}`, refData);
          refs.set(`PRICING_REF#_NONE_#${categoryId}`, makeSoldRef(20));

          const result = resolvePricingRef(
            { brand, description, categoryId },
            refs,
          );

          expect(result.found).toBe(true);
          if (result.found) {
            expect(result.source).toBe("sold");
            expect(result.level).toBe(3);
            expect(result.ref).toBe(refData);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("level 4: returns category-only when brand×cat not found", () => {
    fc.assert(
      fc.property(
        arbBrand,
        arbDescription,
        arbCategoryId,
        (brand, description, categoryId) => {
          const refData = makeSoldRef(20);
          const refs = new Map<string, PricingRefData>();
          // No brand×cat key
          refs.set(`PRICING_REF#_NONE_#${categoryId}`, refData);

          const result = resolvePricingRef(
            { brand, description, categoryId },
            refs,
          );

          expect(result.found).toBe(true);
          if (result.found) {
            expect(result.source).toBe("sold");
            expect(result.level).toBe(4);
            expect(result.ref).toBe(refData);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("level 5: returns unsold brand×description when all Tier 1 miss", () => {
    fc.assert(
      fc.property(
        arbBrand,
        arbDescription,
        arbCategoryId,
        (brand, description, categoryId) => {
          const refData = makeUnsoldRef();
          const refs = new Map<string, PricingRefData>();
          // Only unsold brand×desc exists
          refs.set(`PRICING_REF#${brand}#DESC#${description}`, refData);

          const result = resolvePricingRef(
            { brand, description, categoryId },
            refs,
          );

          expect(result.found).toBe(true);
          if (result.found) {
            expect(result.source).toBe("unsold");
            expect(result.level).toBe(5);
            expect(result.ref).toBe(refData);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("level 6: returns unsold description-only when brand×desc unsold not found", () => {
    fc.assert(
      fc.property(
        arbBrand,
        arbDescription,
        arbCategoryId,
        (brand, description, categoryId) => {
          const refData = makeUnsoldRef();
          const refs = new Map<string, PricingRefData>();
          // Only unsold desc-only exists
          refs.set(`PRICING_REF#_NONE_#DESC#${description}`, refData);

          const result = resolvePricingRef(
            { brand, description, categoryId },
            refs,
          );

          expect(result.found).toBe(true);
          if (result.found) {
            expect(result.source).toBe("unsold");
            expect(result.level).toBe(6);
            expect(result.ref).toBe(refData);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns found=false when no refs exist at any level", () => {
    fc.assert(
      fc.property(
        arbBrand,
        arbDescription,
        arbCategoryId,
        (brand, description, categoryId) => {
          const refs = new Map<string, PricingRefData>();

          const result = resolvePricingRef(
            { brand, description, categoryId },
            refs,
          );

          expect(result.found).toBe(false);
          expect(result.source).toBeNull();
          expect(result.level).toBe(0);
          expect(result.ref).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("never skips a higher-priority level (consistency)", () => {
    fc.assert(
      fc.property(
        arbBrand,
        arbDescription,
        arbCategoryId,
        fc.boolean(),
        (brand, description, categoryId, includeLowerLevels) => {
          const level1Ref = makeSoldRef(50);
          const refs = new Map<string, PricingRefData>();

          // Always include level 1
          refs.set(`PRICING_REF#${brand}#DESC#${description}`, level1Ref);

          // Optionally include lower levels
          if (includeLowerLevels) {
            refs.set(`PRICING_REF#_NONE_#DESC#${description}`, makeSoldRef(40));
            refs.set(`PRICING_REF#${brand}#${categoryId}`, makeSoldRef(30));
            refs.set(`PRICING_REF#_NONE_#${categoryId}`, makeSoldRef(20));
          }

          const result = resolvePricingRef(
            { brand, description, categoryId },
            refs,
          );

          // Must always pick level 1
          expect(result.found).toBe(true);
          if (result.found) {
            expect(result.level).toBe(1);
            expect(result.ref).toBe(level1Ref);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("skips desc levels when description is null", () => {
    fc.assert(
      fc.property(arbBrand, arbCategoryId, (brand, categoryId) => {
        const refData = makeSoldRef(30);
        const refs = new Map<string, PricingRefData>();
        refs.set(`PRICING_REF#${brand}#${categoryId}`, refData);

        const result = resolvePricingRef(
          { brand, description: null, categoryId },
          refs,
        );

        expect(result.found).toBe(true);
        if (result.found) {
          expect(result.source).toBe("sold");
          expect(result.level).toBe(3);
          expect(result.ref).toBe(refData);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("skips category levels when categoryId is null", () => {
    fc.assert(
      fc.property(arbBrand, arbDescription, (brand, description) => {
        const refData = makeSoldRef(50);
        const refs = new Map<string, PricingRefData>();
        refs.set(`PRICING_REF#${brand}#DESC#${description}`, refData);

        const result = resolvePricingRef(
          { brand, description, categoryId: null },
          refs,
        );

        expect(result.found).toBe(true);
        if (result.found) {
          expect(result.source).toBe("sold");
          expect(result.level).toBe(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
