/**
 * Pricing reference fallback lookup.
 *
 * Resolves the correct pricing reference for an item by following the
 * 6-level fallback chain:
 *
 * Tier 1 (sold items — strong signal):
 *   1. brand × description (sampleSize > 0)
 *   2. description-only (sampleSize > 0)
 *   3. brand × categoryId (sampleSize > 0)
 *   4. category-only (sampleSize > 0)
 *
 * Tier 2 (unsold items — weak signal):
 *   5. brand × description (unsoldCount > 0)
 *   6. description-only (unsoldCount > 0)
 */

/**
 * Query parameters for a pricing reference lookup.
 */
export interface PricingRefLookup {
  brand: string | null;
  description: string | null;
  categoryId: string | null;
}

/**
 * A pricing reference record (subset of fields relevant to lookup).
 */
export interface PricingRefData {
  sampleSize: number;
  unsoldCount: number;
  [key: string]: unknown;
}

/**
 * Result of a pricing reference lookup.
 */
export type LookupResult =
  | {
      found: true;
      source: "sold" | "unsold";
      level: number;
      ref: PricingRefData;
    }
  | { found: false; source: null; level: 0; ref: null };

/**
 * Builds the DynamoDB PK for a description-based pricing reference.
 */
export function buildDescriptionKey(
  brand: string,
  description: string,
): string {
  return `PRICING_REF#${brand}#DESC#${description}`;
}

/**
 * Builds the DynamoDB PK for a category-based pricing reference.
 */
export function buildCategoryKey(brand: string, categoryId: string): string {
  return `PRICING_REF#${brand}#${categoryId}`;
}

/**
 * Resolves the pricing reference for a given brand/description/category combination
 * using an in-memory map of refs.
 *
 * @param query - The brand, description, and category to look up
 * @param refs - Map of pricing reference keys to their data
 * @returns The resolved pricing reference or a not-found result
 */
export function resolvePricingRef(
  query: PricingRefLookup,
  refs: Map<string, PricingRefData>,
): LookupResult {
  const { brand, description, categoryId } = query;

  // Tier 1: sold items
  if (description) {
    if (brand) {
      const key = buildDescriptionKey(brand, description);
      const ref = refs.get(key);
      if (ref && ref.sampleSize > 0) {
        return { found: true, source: "sold", level: 1, ref };
      }
    }
    const key = buildDescriptionKey("_NONE_", description);
    const ref = refs.get(key);
    if (ref && ref.sampleSize > 0) {
      return { found: true, source: "sold", level: 2, ref };
    }
  }

  if (categoryId) {
    if (brand) {
      const key = buildCategoryKey(brand, categoryId);
      const ref = refs.get(key);
      if (ref && ref.sampleSize > 0) {
        return { found: true, source: "sold", level: 3, ref };
      }
    }
    const key = buildCategoryKey("_NONE_", categoryId);
    const ref = refs.get(key);
    if (ref && ref.sampleSize > 0) {
      return { found: true, source: "sold", level: 4, ref };
    }
  }

  // Tier 2: unsold items
  if (description) {
    if (brand) {
      const key = buildDescriptionKey(brand, description);
      const ref = refs.get(key);
      if (ref && ref.unsoldCount > 0) {
        return { found: true, source: "unsold", level: 5, ref };
      }
    }
    const key = buildDescriptionKey("_NONE_", description);
    const ref = refs.get(key);
    if (ref && ref.unsoldCount > 0) {
      return { found: true, source: "unsold", level: 6, ref };
    }
  }

  // Nothing found
  return { found: false, source: null, level: 0, ref: null };
}
