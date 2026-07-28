import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  levenshteinDistance,
  fuzzyMatchBrands,
} from "../../src/pricing/fuzzy-match.js";

/**
 * Feature: auto-tag-price, Property 10: Brand fuzzy matching
 *
 * **Validates: Requirements 11.3**
 *
 * For any input brand string and canonical brand:
 * - If Levenshtein distance <= 2: the canonical brand IS included in fuzzyMatchBrands result
 * - If Levenshtein distance > 2: the canonical brand is NOT included
 */
describe("Brand fuzzy matching properties", () => {
  const shortString = fc.string({ minLength: 1, maxLength: 10 });

  it("canonical brand IS included when Levenshtein distance <= 2", () => {
    fc.assert(
      fc.property(shortString, shortString, (input: string, canonical: string) => {
        const dist = levenshteinDistance(input, canonical);
        if (dist <= 2) {
          const result = fuzzyMatchBrands(input, [canonical]);
          expect(result).toContain(canonical);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("canonical brand is NOT included when Levenshtein distance > 2", () => {
    fc.assert(
      fc.property(shortString, shortString, (input: string, canonical: string) => {
        const dist = levenshteinDistance(input, canonical);
        if (dist > 2) {
          const result = fuzzyMatchBrands(input, [canonical]);
          expect(result).not.toContain(canonical);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("fuzzyMatchBrands result is consistent with levenshteinDistance for a list of brands", () => {
    fc.assert(
      fc.property(
        shortString,
        fc.array(shortString, { minLength: 1, maxLength: 5 }),
        (input: string, brands: string[]) => {
          const result = fuzzyMatchBrands(input, brands);
          for (const brand of brands) {
            const dist = levenshteinDistance(input, brand);
            if (dist <= 2) {
              expect(result).toContain(brand);
            } else {
              expect(result).not.toContain(brand);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
