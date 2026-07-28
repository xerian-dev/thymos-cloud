import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { mapItem } from "../../src/stream/item-mapper.js";

/**
 * Feature: auto-tag-price, Property 9: Import mapping correctness
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 *
 * For any item imported with a brand value:
 * - If it has an exact match or alias in the canonical list → the stored brand
 *   is the canonical name AND sourceBrand contains the original CC value
 * - If no match → the stored brand is the original value unchanged AND no
 *   sourceBrand is set
 */
describe("Import mapping properties", () => {
  // Test canonical brand map with known entries and aliases
  const canonicalBrands = new Map<string, string>([
    ["gucci", "Gucci"],
    ["guccy", "Gucci"], // alias/misspelling
    ["prada", "Prada"],
    ["louis vuitton", "Louis Vuitton"],
    ["lv", "Louis Vuitton"], // alias
    ["chanel", "Chanel"],
    ["hermès", "Hermès"],
    ["hermes", "Hermès"], // alias without accent
  ]);

  const canonicalColors = new Map<string, string>([
    ["black", "Black"],
    ["schwarz", "Black"], // German alias
    ["red", "Red"],
    ["rot", "Red"], // German alias
    ["blue", "Blue"],
    ["blau", "Blue"], // German alias
    ["white", "White"],
    ["weiss", "White"], // German alias
  ]);

  const canonicalMappings = { brands: canonicalBrands, colors: canonicalColors };

  // Arbitrary for generating valid raw items
  const validRawItem = (brand: string) => ({
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Test Item",
    tag_price: 1000,
    created: "2024-01-01",
    inventory_type: "consignment",
    brand,
  });

  // Known canonical brand keys (what we can match)
  const knownBrandKeys = [...canonicalBrands.keys()];

  it("brand with canonical match → stored as canonical name + sourceBrand set", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...knownBrandKeys),
        (brandKey: string) => {
          const raw = validRawItem(brandKey);
          const result = mapItem(raw, canonicalMappings);

          expect(result.success).toBe(true);
          if (!result.success) return;

          const expectedCanonical = canonicalBrands.get(brandKey.toLowerCase());
          expect(result.mapped.brand).toBe(expectedCanonical);
          expect(result.mapped.sourceBrand).toBe(brandKey);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("brand with no canonical match → stored as-is, no sourceBrand", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(
          (s) => !canonicalBrands.has(s.toLowerCase()),
        ),
        (brand: string) => {
          const raw = validRawItem(brand);
          const result = mapItem(raw, canonicalMappings);

          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.mapped.brand).toBe(brand);
          expect(result.mapped.sourceBrand).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("color with canonical match → stored as canonical name + sourceColor set", () => {
    const knownColorKeys = [...canonicalColors.keys()];

    fc.assert(
      fc.property(
        fc.constantFrom(...knownColorKeys),
        (colorKey: string) => {
          const raw = {
            ...validRawItem("UnknownBrand"),
            color: colorKey,
          };
          const result = mapItem(raw, canonicalMappings);

          expect(result.success).toBe(true);
          if (!result.success) return;

          const expectedCanonical = canonicalColors.get(colorKey.toLowerCase());
          expect(result.mapped.color).toBe(expectedCanonical);
          expect(result.mapped.sourceColor).toBe(colorKey);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("color with no canonical match → stored as-is, no sourceColor", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (s) => !canonicalColors.has(s.toLowerCase()),
        ),
        (color: string) => {
          const raw = {
            ...validRawItem("SomeBrand"),
            color,
          };
          const result = mapItem(raw, canonicalMappings);

          expect(result.success).toBe(true);
          if (!result.success) return;

          expect(result.mapped.color).toBe(color);
          expect(result.mapped.sourceColor).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("case-insensitive matching: any casing of a known brand maps to canonical", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...knownBrandKeys),
        fc.constantFrom("upper", "lower", "mixed"),
        (brandKey: string, casing: string) => {
          let cased: string;
          switch (casing) {
            case "upper":
              cased = brandKey.toUpperCase();
              break;
            case "lower":
              cased = brandKey.toLowerCase();
              break;
            default:
              // mixed: alternate upper/lower
              cased = brandKey
                .split("")
                .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
                .join("");
              break;
          }

          const raw = validRawItem(cased);
          const result = mapItem(raw, canonicalMappings);

          expect(result.success).toBe(true);
          if (!result.success) return;

          const expectedCanonical = canonicalBrands.get(brandKey.toLowerCase());
          expect(result.mapped.brand).toBe(expectedCanonical);
          expect(result.mapped.sourceBrand).toBe(cased);
        },
      ),
      { numRuns: 100 },
    );
  });
});
