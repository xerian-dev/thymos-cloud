import { describe, it, expect } from "vitest";
import {
  computeMedian,
  computeSellThrough,
  computeDiscountFrequency,
} from "../../src/aggregator/statistics";

describe("aggregator/statistics", () => {
  describe("computeMedian", () => {
    it("returns 0 for empty array", () => {
      expect(computeMedian([])).toBe(0);
    });

    it("returns the single value for a one-element array", () => {
      expect(computeMedian([42])).toBe(42);
    });

    it("returns the middle value for odd-count arrays", () => {
      expect(computeMedian([1, 3, 5])).toBe(3);
      expect(computeMedian([10, 20, 30, 40, 50])).toBe(30);
    });

    it("returns average of two middle values for even-count arrays", () => {
      expect(computeMedian([1, 2, 3, 4])).toBe(2.5);
      expect(computeMedian([10, 20, 30, 40])).toBe(25);
    });

    it("handles unsorted input", () => {
      expect(computeMedian([5, 1, 3])).toBe(3);
      expect(computeMedian([40, 10, 30, 20])).toBe(25);
    });

    it("does not mutate the input array", () => {
      const input = [5, 1, 3];
      computeMedian(input);
      expect(input).toEqual([5, 1, 3]);
    });

    it("handles duplicate values", () => {
      expect(computeMedian([5, 5, 5])).toBe(5);
      expect(computeMedian([1, 1, 5, 5])).toBe(3);
    });
  });

  describe("computeSellThrough", () => {
    it("returns 0 when totalCount is 0", () => {
      expect(computeSellThrough(0, 0)).toBe(0);
      expect(computeSellThrough(5, 0)).toBe(0);
    });

    it("returns the ratio of sold to total", () => {
      expect(computeSellThrough(50, 100)).toBe(0.5);
      expect(computeSellThrough(3, 10)).toBe(0.3);
    });

    it("returns 1 when all items are sold", () => {
      expect(computeSellThrough(10, 10)).toBe(1);
    });

    it("returns 0 when no items are sold", () => {
      expect(computeSellThrough(0, 100)).toBe(0);
    });
  });

  describe("computeDiscountFrequency", () => {
    it("returns 0 when totalSales is 0", () => {
      expect(computeDiscountFrequency(0, 0)).toBe(0);
      expect(computeDiscountFrequency(5, 0)).toBe(0);
    });

    it("returns the ratio of discounted to total sales", () => {
      expect(computeDiscountFrequency(25, 100)).toBe(0.25);
      expect(computeDiscountFrequency(1, 4)).toBe(0.25);
    });

    it("returns 1 when all sales are discounted", () => {
      expect(computeDiscountFrequency(10, 10)).toBe(1);
    });

    it("returns 0 when no sales are discounted", () => {
      expect(computeDiscountFrequency(0, 50)).toBe(0);
    });
  });
});
