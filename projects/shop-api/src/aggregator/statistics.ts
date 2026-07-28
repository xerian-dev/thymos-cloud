export function computeMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

export function computeSellThrough(
  soldCount: number,
  totalCount: number,
): number {
  if (totalCount === 0) {
    return 0;
  }

  return soldCount / totalCount;
}

export function computeDiscountFrequency(
  discountedCount: number,
  totalSales: number,
): number {
  if (totalSales === 0) {
    return 0;
  }

  return discountedCount / totalSales;
}
