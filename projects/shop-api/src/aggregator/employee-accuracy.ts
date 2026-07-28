import { computeMedian } from "./statistics.js";

export interface EmployeeSaleRecord {
  employeeId: string;
  employeeName: string;
  tagPrice: number; // CHF
  salePrice: number; // CHF
  soldAt: string; // ISO datetime
}

export interface EmployeePricingResult {
  employeeId: string;
  employeeName: string;
  pricingAccuracy: number; // median ratio of salePrice/tagPrice
  sampleSize: number;
  creatorAdjustment: number; // inverse of accuracy deviation
}

export function computeEmployeeAccuracy(
  employeeItems: EmployeeSaleRecord[],
  now?: Date,
): EmployeePricingResult {
  const referenceDate = now ?? new Date();

  if (employeeItems.length === 0) {
    return {
      employeeId: "",
      employeeName: "",
      pricingAccuracy: 1.0,
      sampleSize: 0,
      creatorAdjustment: 1.0,
    };
  }

  const { employeeId, employeeName } = employeeItems[0];

  const threeMonthsAgo = new Date(referenceDate);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const sixMonthsAgo = new Date(referenceDate);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const weightedRatios: number[] = [];

  for (const item of employeeItems) {
    if (item.tagPrice === 0) {
      continue;
    }

    const ratio = item.salePrice / item.tagPrice;
    const soldDate = new Date(item.soldAt);

    if (soldDate >= threeMonthsAgo) {
      // Last 3 months: weighted 3x (replicate 3 times)
      weightedRatios.push(ratio, ratio, ratio);
    } else if (soldDate >= sixMonthsAgo) {
      // 3-6 months ago: weighted 1x
      weightedRatios.push(ratio);
    }
    // Items older than 6 months are excluded
  }

  if (weightedRatios.length === 0) {
    return {
      employeeId,
      employeeName,
      pricingAccuracy: 1.0,
      sampleSize: 0,
      creatorAdjustment: 1.0,
    };
  }

  const pricingAccuracy = computeMedian(weightedRatios);

  return {
    employeeId,
    employeeName,
    pricingAccuracy,
    sampleSize: employeeItems.length,
    creatorAdjustment: pricingAccuracy,
  };
}
