import type { AdjustmentEvent } from "./pricing-types";

export interface AdjustmentSummaryBannerProps {
  adjustments: AdjustmentEvent[];
}

interface StatCardProps {
  label: string;
  value: string | number;
}

function StatCard({ label, value }: StatCardProps): React.ReactNode {
  return (
    <div className="flex flex-col items-center rounded-lg border border-gray-200 bg-white px-4 py-3">
      <span className="text-2xl font-semibold text-gray-900">{value}</span>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}

function computeSummary(adjustments: AdjustmentEvent[]): {
  total: number;
  increases: number;
  decreases: number;
  averageMagnitude: string;
} {
  const total = adjustments.length;

  if (total === 0) {
    return { total: 0, increases: 0, decreases: 0, averageMagnitude: "—" };
  }

  const increases = adjustments.filter(
    (a) => a.direction === "increase",
  ).length;
  const decreases = adjustments.filter(
    (a) => a.direction === "decrease",
  ).length;

  const sumMagnitude = adjustments.reduce(
    (sum, a) => sum + Math.abs(a.percentageChange),
    0,
  );
  const averageMagnitude = (sumMagnitude / total).toFixed(1);

  return { total, increases, decreases, averageMagnitude };
}

export function AdjustmentSummaryBanner({
  adjustments,
}: AdjustmentSummaryBannerProps): React.ReactNode {
  const { total, increases, decreases, averageMagnitude } =
    computeSummary(adjustments);

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      role="region"
      aria-label="Adjustment summary"
    >
      <StatCard label="Total Adjustments" value={total} />
      <StatCard label="Increases" value={increases} />
      <StatCard label="Decreases" value={decreases} />
      <StatCard label="Avg. Magnitude" value={`${averageMagnitude}%`} />
    </div>
  );
}
