/**
 * Pricing reference fallback lookup.
 *
 * Resolves the correct pricing reference for an item by following the
 * fallback chain: brand×category → category-only → null.
 */

/**
 * Query parameters for a pricing reference lookup.
 */
export interface PricingRefLookup {
  brand: string | null;
  categoryId: string;
}

/**
 * Result of a pricing reference lookup.
 */
export type LookupResult =
  | { found: true; source: "brand_category" | "category_only"; ref: unknown }
  | { found: false; source: null; ref: null };

/**
 * Resolves the pricing reference for a given brand/category combination.
 *
 * Fallback chain:
 * 1. If brand is provided, try `PRICING_REF#<brand>#<categoryId>` (brand×category match)
 * 2. If not found (or brand is null), try `PRICING_REF#_NONE_#<categoryId>` (category-only fallback)
 * 3. If neither exists, return { found: false }
 *
 * The fallback never skips a level: it never returns category-only when brand×category exists.
 *
 * @param query - The brand and category to look up
 * @param refs - Map of pricing reference keys to their data
 * @returns The resolved pricing reference or a not-found result
 */
export function resolvePricingRef(
  query: PricingRefLookup,
  refs: Map<string, unknown>,
): LookupResult {
  // Try brand×category first
  if (query.brand) {
    const brandCategoryKey = `PRICING_REF#${query.brand}#${query.categoryId}`;
    const ref = refs.get(brandCategoryKey);
    if (ref) {
      return { found: true, source: "brand_category", ref };
    }
  }

  // Fallback to category-only
  const categoryOnlyKey = `PRICING_REF#_NONE_#${query.categoryId}`;
  const ref = refs.get(categoryOnlyKey);
  if (ref) {
    return { found: true, source: "category_only", ref };
  }

  // Nothing found
  return { found: false, source: null, ref: null };
}
