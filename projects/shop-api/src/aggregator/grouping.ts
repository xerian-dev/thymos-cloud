import {
  computeMedian,
  computeSellThrough,
  computeDiscountFrequency,
} from "./statistics.js";

export interface AggregatorItem {
  brand: string | null;
  categoryId: string;
  categoryName: string;
  tagPrice: number;
  salePrice: number | null;
  status: string;
  daysOnShelf: number | null;
  color: string | null;
  size: string | null;
  createdBy: string | null;
  soldAt: string | null;
  discounted: boolean;
}

export interface GroupStatistics {
  groupKey: string;
  brand: string;
  categoryId: string;
  categoryName: string;
  medianTagPrice: number;
  medianSalePrice: number;
  sellThroughRate: number;
  medianDaysOnShelf: number;
  discountFrequency: number;
  sampleSize: number;
  colorAdjustments: Record<string, number>;
  sizeAdjustments: Record<string, number>;
}

const NONE_BRAND = "_NONE_";

function canonicalizeBrand(brand: string | null): string {
  if (brand === null || brand.trim() === "") {
    return NONE_BRAND;
  }
  return brand;
}

function buildGroupKey(brand: string, categoryId: string): string {
  return `${brand}#${categoryId}`;
}

export function groupItemsByBrandCategory(
  items: AggregatorItem[],
): Map<string, GroupStatistics> {
  const groups = new Map<string, AggregatorItem[]>();

  for (const item of items) {
    const brand = canonicalizeBrand(item.brand);
    const key = buildGroupKey(brand, item.categoryId);

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

    const brand = canonicalizeBrand(groupItems[0].brand);
    const categoryId = groupItems[0].categoryId;
    const categoryName = groupItems[0].categoryName;

    const medianTagPrice = computeMedian(
      soldItems.map((item) => item.tagPrice),
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

    const colorAdjustments = computeColorAdjustments(
      soldItems,
      medianSalePrice,
    );
    const sizeAdjustments = computeSizeAdjustments(soldItems, medianSalePrice);

    result.set(key, {
      groupKey: key,
      brand,
      categoryId,
      categoryName,
      medianTagPrice,
      medianSalePrice,
      sellThroughRate,
      medianDaysOnShelf,
      discountFrequency,
      sampleSize: soldItems.length,
      colorAdjustments,
      sizeAdjustments,
    });
  }

  return result;
}

function computeColorAdjustments(
  soldItems: AggregatorItem[],
  groupMedianSalePrice: number,
): Record<string, number> {
  if (groupMedianSalePrice === 0) {
    return {};
  }

  const colorGroups = new Map<string, number[]>();

  for (const item of soldItems) {
    if (item.color === null || item.color.trim() === "") {
      continue;
    }
    const prices = colorGroups.get(item.color);
    if (prices) {
      prices.push(item.salePrice as number);
    } else {
      colorGroups.set(item.color, [item.salePrice as number]);
    }
  }

  const adjustments: Record<string, number> = {};

  for (const [color, prices] of colorGroups) {
    const colorMedian = computeMedian(prices);
    adjustments[color] = colorMedian / groupMedianSalePrice;
  }

  return adjustments;
}

function computeSizeAdjustments(
  soldItems: AggregatorItem[],
  groupMedianSalePrice: number,
): Record<string, number> {
  if (groupMedianSalePrice === 0) {
    return {};
  }

  const sizeGroups = new Map<string, number[]>();

  for (const item of soldItems) {
    if (item.size === null || item.size.trim() === "") {
      continue;
    }
    const prices = sizeGroups.get(item.size);
    if (prices) {
      prices.push(item.salePrice as number);
    } else {
      sizeGroups.set(item.size, [item.salePrice as number]);
    }
  }

  const adjustments: Record<string, number> = {};

  for (const [size, prices] of sizeGroups) {
    const sizeMedian = computeMedian(prices);
    adjustments[size] = sizeMedian / groupMedianSalePrice;
  }

  return adjustments;
}
