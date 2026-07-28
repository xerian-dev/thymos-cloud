import { describe, it, expect } from "vitest";
import {
  groupItemsByBrandCategory,
  AggregatorItem,
} from "../../src/aggregator/grouping";

function makeItem(overrides: Partial<AggregatorItem> = {}): AggregatorItem {
  return {
    brand: "TestBrand",
    categoryId: "cat-1",
    categoryName: "Shoes",
    tagPrice: 100,
    salePrice: 85,
    status: "sold",
    daysOnShelf: 10,
    color: null,
    size: null,
    createdBy: "emp-1",
    soldAt: "2025-01-10T00:00:00Z",
    discounted: false,
    ...overrides,
  };
}

describe("aggregator/grouping", () => {
  describe("groupItemsByBrandCategory", () => {
    it("groups items correctly by brand×category", () => {
      const items: AggregatorItem[] = [
        makeItem({ brand: "Nike", categoryId: "cat-1" }),
        makeItem({ brand: "Nike", categoryId: "cat-1" }),
        makeItem({ brand: "Adidas", categoryId: "cat-1" }),
        makeItem({ brand: "Nike", categoryId: "cat-2", categoryName: "Bags" }),
      ];

      const result = groupItemsByBrandCategory(items);
      expect(result.size).toBe(3);
      expect(result.has("Nike#cat-1")).toBe(true);
      expect(result.has("Adidas#cat-1")).toBe(true);
      expect(result.has("Nike#cat-2")).toBe(true);
    });

    it('uses "_NONE_" when brand is null', () => {
      const items: AggregatorItem[] = [
        makeItem({ brand: null, categoryId: "cat-1" }),
      ];

      const result = groupItemsByBrandCategory(items);
      expect(result.has("_NONE_#cat-1")).toBe(true);
      const group = result.get("_NONE_#cat-1")!;
      expect(group.brand).toBe("_NONE_");
    });

    it('uses "_NONE_" when brand is empty string', () => {
      const items: AggregatorItem[] = [
        makeItem({ brand: "", categoryId: "cat-1" }),
      ];

      const result = groupItemsByBrandCategory(items);
      expect(result.has("_NONE_#cat-1")).toBe(true);
    });

    it('uses "_NONE_" when brand is whitespace only', () => {
      const items: AggregatorItem[] = [
        makeItem({ brand: "   ", categoryId: "cat-1" }),
      ];

      const result = groupItemsByBrandCategory(items);
      expect(result.has("_NONE_#cat-1")).toBe(true);
    });

    it("computes medianTagPrice and medianSalePrice from sold items only", () => {
      const items: AggregatorItem[] = [
        makeItem({ tagPrice: 100, salePrice: 80, status: "sold" }),
        makeItem({ tagPrice: 120, salePrice: 100, status: "sold" }),
        makeItem({ tagPrice: 200, salePrice: null, status: "active" }),
      ];

      const result = groupItemsByBrandCategory(items);
      const group = result.get("TestBrand#cat-1")!;
      // Sold items tagPrices: [100, 120] → median = 110
      expect(group.medianTagPrice).toBe(110);
      // Sold items salePrices: [80, 100] → median = 90
      expect(group.medianSalePrice).toBe(90);
    });

    it("computes sellThrough correctly (sold/total)", () => {
      const items: AggregatorItem[] = [
        makeItem({ status: "sold", salePrice: 80 }),
        makeItem({ status: "sold", salePrice: 90 }),
        makeItem({ status: "active", salePrice: null }),
        makeItem({ status: "active", salePrice: null }),
      ];

      const result = groupItemsByBrandCategory(items);
      const group = result.get("TestBrand#cat-1")!;
      // 2 sold out of 4 total
      expect(group.sellThroughRate).toBe(0.5);
    });

    it("computes medianDaysOnShelf skipping nulls", () => {
      const items: AggregatorItem[] = [
        makeItem({ status: "sold", salePrice: 80, daysOnShelf: 5 }),
        makeItem({ status: "sold", salePrice: 90, daysOnShelf: null }),
        makeItem({ status: "sold", salePrice: 85, daysOnShelf: 15 }),
      ];

      const result = groupItemsByBrandCategory(items);
      const group = result.get("TestBrand#cat-1")!;
      // Only non-null values from sold items: [5, 15] → median = 10
      expect(group.medianDaysOnShelf).toBe(10);
    });

    it("computes color adjustments as ratio of color median to group median", () => {
      const items: AggregatorItem[] = [
        makeItem({ status: "sold", salePrice: 100, color: "Red" }),
        makeItem({ status: "sold", salePrice: 80, color: "Red" }),
        makeItem({ status: "sold", salePrice: 60, color: "Blue" }),
        makeItem({ status: "sold", salePrice: 40, color: "Blue" }),
      ];

      const result = groupItemsByBrandCategory(items);
      const group = result.get("TestBrand#cat-1")!;
      // Group medianSalePrice: median of [100, 80, 60, 40] = (80 + 60)/2 = 70
      // Red median: (100 + 80) / 2 = 90 → adjustment = 90/70
      // Blue median: (60 + 40) / 2 = 50 → adjustment = 50/70
      expect(group.colorAdjustments["Red"]).toBeCloseTo(90 / 70, 5);
      expect(group.colorAdjustments["Blue"]).toBeCloseTo(50 / 70, 5);
    });

    it("computes size adjustments as ratio of size median to group median", () => {
      const items: AggregatorItem[] = [
        makeItem({ status: "sold", salePrice: 120, size: "S" }),
        makeItem({ status: "sold", salePrice: 80, size: "S" }),
        makeItem({ status: "sold", salePrice: 50, size: "L" }),
        makeItem({ status: "sold", salePrice: 70, size: "L" }),
      ];

      const result = groupItemsByBrandCategory(items);
      const group = result.get("TestBrand#cat-1")!;
      // Group medianSalePrice: median of [120, 80, 50, 70] → sorted [50, 70, 80, 120] → (70+80)/2 = 75
      // S median: (120 + 80)/2 = 100 → adjustment = 100/75
      // L median: (50 + 70)/2 = 60 → adjustment = 60/75
      expect(group.sizeAdjustments["S"]).toBeCloseTo(100 / 75, 5);
      expect(group.sizeAdjustments["L"]).toBeCloseTo(60 / 75, 5);
    });

    it("handles group with no sold items (sampleSize = 0)", () => {
      const items: AggregatorItem[] = [
        makeItem({ status: "active", salePrice: null }),
        makeItem({ status: "active", salePrice: null }),
      ];

      const result = groupItemsByBrandCategory(items);
      const group = result.get("TestBrand#cat-1")!;
      expect(group.sampleSize).toBe(0);
      expect(group.medianTagPrice).toBe(0);
      expect(group.medianSalePrice).toBe(0);
      expect(group.sellThroughRate).toBe(0);
      expect(group.medianDaysOnShelf).toBe(0);
    });

    it("skips null/empty colors and sizes for adjustments", () => {
      const items: AggregatorItem[] = [
        makeItem({ status: "sold", salePrice: 100, color: null, size: "" }),
        makeItem({ status: "sold", salePrice: 80, color: "Red", size: "M" }),
      ];

      const result = groupItemsByBrandCategory(items);
      const group = result.get("TestBrand#cat-1")!;
      // Only "Red" should appear in color adjustments (null is skipped)
      expect(Object.keys(group.colorAdjustments)).toEqual(["Red"]);
      // Only "M" should appear in size adjustments (empty is skipped)
      expect(Object.keys(group.sizeAdjustments)).toEqual(["M"]);
    });

    it("returns empty adjustments when group median sale price is 0", () => {
      const items: AggregatorItem[] = [
        makeItem({ status: "sold", salePrice: 0, color: "Red", size: "M" }),
      ];

      const result = groupItemsByBrandCategory(items);
      const group = result.get("TestBrand#cat-1")!;
      expect(group.colorAdjustments).toEqual({});
      expect(group.sizeAdjustments).toEqual({});
    });
  });
});
