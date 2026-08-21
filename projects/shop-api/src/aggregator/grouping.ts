/**
 * Groups items by brand × description and computes statistics for each group.
 *
 * This is the sole grouping dimension for pricing. Color, pattern, and size
 * are computed as adjustment ratios within each group — not as grouping keys.
 */

import {
  computeMedian,
  computeSellThrough,
  computeDiscountFrequency,
} from "./statistics.js";

export interface ComputeItem {
  brand: string;
  description: string;
  tagPrice: number;
  salePrice: number | null;
  status: string;
  daysOnShelf: number | null;
  color: string | null;
  pattern: string | null;
  size: string | null;
  discounted: boolean;
}

export interface GroupStatistics {
  groupKey: string;
  brand: string;
  description: string;
  medianTagPrice: number;
  medianSalePrice: number;
  sellThroughRate: number;
  medianDaysOnShelf: number;
  discountFrequency: number;
  sampleSize: number;
  totalItems: number;
  unsoldCount: number;
  colorAdjustments: Record<string, number>;
  patternAdjustments: Record<string, number>;
  sizeAdjustments: Record<string, number>;
}

const NONE_BRAND = "_NONE_";

export function canonicalizeBrand(brand: string | null | undefined): string {
  if (brand === null || brand === undefined || brand.trim() === "") {
    return NONE_BRAND;
  }
  return brand;
}

function buildGroupKey(brand: string, description: string): string {
  return `${brand}#${description}`;
}

export function groupItems(items: ComputeItem[]): Map<string, GroupStatistics> {
  const groups = new Map<string, ComputeItem[]>();

  for (const item of items) {
    const key = buildGroupKey(item.brand, item.description);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const result = new Map<string, GroupStatistics>();

  for (const [key, groupItems] of groups) {
    const soldItems = groupItems.filter(
      (item) => item.status === "sold" && item.salePrice !== null,
    );

    const brand = groupItems[0].brand;
    const description = groupItems[0].description;

    const medianTagPrice = computeMedian(
      groupItems.map((item) => item.tagPrice),
    );
    const medianSalePrice = computeMedian(
      soldItems.map((item) => item.salePrice as number),
    );

    const sellThroughRate = computeSellThrough(
      soldItems.length,
      groupItems.length,
    );

    const daysOnShelfValues = soldItems
      .map((item) => item.daysOnShelf)
      .filter((d): d is number => d !== null);
    const medianDaysOnShelf = computeMedian(daysOnShelfValues);

    const discountedCount = soldItems.filter((item) => item.discounted).length;
    const discountFrequency = computeDiscountFrequency(
      discountedCount,
      soldItems.length,
    );

    const colorAdjustments = computeAttributeAdjustments(
      soldItems,
      medianSalePrice,
      (item) => item.color,
    );

    const patternAdjustments = computeAttributeAdjustments(
      soldItems,
      medianSalePrice,
      (item) => item.pattern,
    );

    const sizeAdjustments = computeAttributeAdjustments(
      soldItems,
      medianSalePrice,
      (item) => item.size,
    );

    const totalItems = groupItems.length;
    const unsoldCount = totalItems - soldItems.length;

    result.set(key, {
      groupKey: key,
      brand,
      description,
      medianTagPrice,
      medianSalePrice,
      sellThroughRate,
      medianDaysOnShelf,
      discountFrequency,
      sampleSize: soldItems.length,
      totalItems,
      unsoldCount,
      colorAdjustments,
      patternAdjustments,
      sizeAdjustments,
    });
  }

  return result;
}

/**
 * Computes per-attribute-value price ratios relative to the group median.
 *
 * For each distinct value of the attribute (e.g., each color), computes
 * the median sale price of items with that value, then divides by the
 * group's overall median sale price to get a ratio.
 *
 * A ratio > 1.0 means items with that attribute sell above the group average.
 * A ratio < 1.0 means below.
 */
function computeAttributeAdjustments(
  soldItems: ComputeItem[],
  groupMedianSalePrice: number,
  getAttribute: (item: ComputeItem) => string | null,
): Record<string, number> {
  if (groupMedianSalePrice === 0) {
    return {};
  }

  const attributeGroups = new Map<string, number[]>();

  for (const item of soldItems) {
    const value = getAttribute(item);
    if (value === null || value.trim() === "") {
      continue;
    }
    const prices = attributeGroups.get(value);
    if (prices) {
      prices.push(item.salePrice as number);
    } else {
      attributeGroups.set(value, [item.salePrice as number]);
    }
  }

  const adjustments: Record<string, number> = {};

  for (const [value, prices] of attributeGroups) {
    const attributeMedian = computeMedian(prices);
    adjustments[value] = attributeMedian / groupMedianSalePrice;
  }

  return adjustments;
}
