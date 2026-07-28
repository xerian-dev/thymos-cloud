import { describe, it, expect } from "vitest";
import {
  computeEmployeeAccuracy,
  EmployeeSaleRecord,
} from "../../src/aggregator/employee-accuracy";

function makeRecord(
  overrides: Partial<EmployeeSaleRecord> = {},
): EmployeeSaleRecord {
  return {
    employeeId: "emp-1",
    employeeName: "Alice",
    tagPrice: 100,
    salePrice: 85,
    soldAt: "2025-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("aggregator/employee-accuracy", () => {
  const now = new Date("2025-02-01T00:00:00Z");

  describe("empty input", () => {
    it("returns default result with accuracy 1.0 for empty array", () => {
      const result = computeEmployeeAccuracy([], now);
      expect(result.pricingAccuracy).toBe(1.0);
      expect(result.creatorAdjustment).toBe(1.0);
      expect(result.sampleSize).toBe(0);
    });
  });

  describe("basic ratio computation", () => {
    it("computes median salePrice/tagPrice ratio", () => {
      const items: EmployeeSaleRecord[] = [
        makeRecord({ tagPrice: 100, salePrice: 85, soldAt: "2025-01-10T00:00:00Z" }),
        makeRecord({ tagPrice: 100, salePrice: 90, soldAt: "2025-01-11T00:00:00Z" }),
        makeRecord({ tagPrice: 100, salePrice: 80, soldAt: "2025-01-12T00:00:00Z" }),
      ];
      const result = computeEmployeeAccuracy(items, now);
      // Ratios: 0.85, 0.90, 0.80 — all within 3 months so each weighted 3x
      // Weighted: [0.85, 0.85, 0.85, 0.90, 0.90, 0.90, 0.80, 0.80, 0.80]
      // Sorted: [0.80, 0.80, 0.80, 0.85, 0.85, 0.85, 0.90, 0.90, 0.90]
      // Median (9 items, mid=4): 0.85
      expect(result.pricingAccuracy).toBe(0.85);
    });

    it("sets creatorAdjustment equal to pricingAccuracy", () => {
      const items: EmployeeSaleRecord[] = [
        makeRecord({ tagPrice: 100, salePrice: 85, soldAt: "2025-01-10T00:00:00Z" }),
      ];
      const result = computeEmployeeAccuracy(items, now);
      expect(result.creatorAdjustment).toBe(result.pricingAccuracy);
    });

    it("returns sampleSize as the count of input records", () => {
      const items: EmployeeSaleRecord[] = [
        makeRecord({ soldAt: "2025-01-10T00:00:00Z" }),
        makeRecord({ soldAt: "2025-01-11T00:00:00Z" }),
        makeRecord({ soldAt: "2025-01-12T00:00:00Z" }),
      ];
      const result = computeEmployeeAccuracy(items, now);
      expect(result.sampleSize).toBe(3);
    });
  });

  describe("time-decay weighting", () => {
    it("weights items from last 3 months 3x", () => {
      // now = 2025-02-01, 3 months ago = 2024-11-01
      const items: EmployeeSaleRecord[] = [
        makeRecord({ tagPrice: 100, salePrice: 90, soldAt: "2025-01-15T00:00:00Z" }), // recent: 3x
        makeRecord({ tagPrice: 100, salePrice: 80, soldAt: "2024-10-15T00:00:00Z" }), // 3-6 months: 1x
      ];
      const result = computeEmployeeAccuracy(items, now);
      // Weighted ratios: [0.90, 0.90, 0.90, 0.80]
      // Sorted: [0.80, 0.90, 0.90, 0.90]
      // Median (4 items): (0.90 + 0.90) / 2 = 0.90
      expect(result.pricingAccuracy).toBe(0.9);
    });

    it("excludes items older than 6 months", () => {
      // now = 2025-02-01, 6 months ago = 2024-08-01
      const items: EmployeeSaleRecord[] = [
        makeRecord({ tagPrice: 100, salePrice: 90, soldAt: "2025-01-15T00:00:00Z" }), // recent
        makeRecord({ tagPrice: 100, salePrice: 50, soldAt: "2024-05-01T00:00:00Z" }), // older than 6mo — excluded
      ];
      const result = computeEmployeeAccuracy(items, now);
      // Only the recent item counts: ratio = 0.90
      expect(result.pricingAccuracy).toBe(0.9);
      // sampleSize is still 2 (total input records)
      expect(result.sampleSize).toBe(2);
    });

    it("returns default when all items are older than 6 months", () => {
      const items: EmployeeSaleRecord[] = [
        makeRecord({ tagPrice: 100, salePrice: 50, soldAt: "2024-01-01T00:00:00Z" }),
      ];
      const result = computeEmployeeAccuracy(items, now);
      expect(result.pricingAccuracy).toBe(1.0);
      expect(result.creatorAdjustment).toBe(1.0);
      expect(result.sampleSize).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("skips items with tagPrice of 0", () => {
      const items: EmployeeSaleRecord[] = [
        makeRecord({ tagPrice: 0, salePrice: 50, soldAt: "2025-01-10T00:00:00Z" }),
        makeRecord({ tagPrice: 100, salePrice: 110, soldAt: "2025-01-11T00:00:00Z" }),
      ];
      const result = computeEmployeeAccuracy(items, now);
      // Only the second item counts: ratio = 1.10
      expect(result.pricingAccuracy).toBe(1.1);
      expect(result.sampleSize).toBe(2);
    });

    it("handles employee who underprices (accuracy > 1.0)", () => {
      const items: EmployeeSaleRecord[] = [
        makeRecord({ tagPrice: 100, salePrice: 115, soldAt: "2025-01-10T00:00:00Z" }),
      ];
      const result = computeEmployeeAccuracy(items, now);
      expect(result.pricingAccuracy).toBe(1.15);
      expect(result.creatorAdjustment).toBe(1.15);
    });

    it("handles perfect pricing (accuracy = 1.0)", () => {
      const items: EmployeeSaleRecord[] = [
        makeRecord({ tagPrice: 100, salePrice: 100, soldAt: "2025-01-10T00:00:00Z" }),
      ];
      const result = computeEmployeeAccuracy(items, now);
      expect(result.pricingAccuracy).toBe(1.0);
      expect(result.creatorAdjustment).toBe(1.0);
    });

    it("uses employeeId and employeeName from the first record", () => {
      const items: EmployeeSaleRecord[] = [
        makeRecord({ employeeId: "emp-42", employeeName: "Bob", soldAt: "2025-01-10T00:00:00Z" }),
      ];
      const result = computeEmployeeAccuracy(items, now);
      expect(result.employeeId).toBe("emp-42");
      expect(result.employeeName).toBe("Bob");
    });

    it("defaults now to current date when not provided", () => {
      const recentItems: EmployeeSaleRecord[] = [
        makeRecord({ tagPrice: 100, salePrice: 95, soldAt: new Date().toISOString() }),
      ];
      const result = computeEmployeeAccuracy(recentItems);
      expect(result.pricingAccuracy).toBe(0.95);
    });
  });
});
