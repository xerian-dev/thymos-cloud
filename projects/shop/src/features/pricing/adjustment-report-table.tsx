import * as React from "react";
import type { AdjustmentEvent } from "./pricing-types";

export interface AdjustmentReportTableProps {
  adjustments: AdjustmentEvent[];
  isLoading: boolean;
}

function formatPrice(price: number): string {
  return `CHF ${price.toFixed(2)}`;
}

function formatChange(percentageChange: number): string {
  const sign = percentageChange >= 0 ? "+" : "";
  return `${sign}${percentageChange.toFixed(1)}%`;
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString();
}

function LoadingSkeleton(): React.ReactNode {
  return (
    <div className="w-full space-y-3" aria-busy="true" aria-label="Loading adjustments">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 w-full animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function MetricsDetail({ metrics }: { metrics: AdjustmentEvent["metrics"] }): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-2 px-4 py-3 text-sm text-muted-foreground sm:grid-cols-4">
      <div>
        <span className="font-medium text-foreground">Sell-through:</span>{" "}
        {(metrics.sellThroughRate * 100).toFixed(1)}%
      </div>
      <div>
        <span className="font-medium text-foreground">Days on shelf:</span>{" "}
        {metrics.medianDaysOnShelf}
      </div>
      <div>
        <span className="font-medium text-foreground">Sample size:</span>{" "}
        {metrics.sampleSize}
      </div>
      <div>
        <span className="font-medium text-foreground">Discount frequency:</span>{" "}
        {(metrics.discountFrequency * 100).toFixed(1)}%
      </div>
    </div>
  );
}

export function AdjustmentReportTable({
  adjustments,
  isLoading,
}: AdjustmentReportTableProps): React.ReactNode {
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const toggleRow = (id: string): void => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (adjustments.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No adjustments found
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto" role="region" aria-label="Adjustment report table">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-2 text-left font-medium text-foreground">
              Date
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium text-foreground">
              Brand
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium text-foreground">
              Category
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium text-foreground">
              Previous Price
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium text-foreground">
              New Price
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium text-foreground">
              Change
            </th>
            <th scope="col" className="px-4 py-2 text-center font-medium text-foreground">
              Direction
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium text-foreground">
              Reason
            </th>
          </tr>
        </thead>
        <tbody>
          {adjustments.map((adjustment) => {
            const isExpanded = expandedRows.has(adjustment.id);

            return (
              <React.Fragment key={adjustment.id}>
                <tr
                  className="cursor-pointer border-b border-border hover:bg-muted/50"
                  onClick={() => toggleRow(adjustment.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`metrics-${adjustment.id}`}
                >
                  <td className="px-4 py-2">{formatDate(adjustment.timestamp)}</td>
                  <td className="px-4 py-2">{adjustment.brand}</td>
                  <td className="px-4 py-2">{adjustment.category}</td>
                  <td className="px-4 py-2 text-right">
                    {formatPrice(adjustment.previousPrice)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatPrice(adjustment.newPrice)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatChange(adjustment.percentageChange)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {adjustment.direction === "increase" ? (
                      <span className="text-green-600" aria-label="Price increase">
                        ↑
                      </span>
                    ) : (
                      <span className="text-red-600" aria-label="Price decrease">
                        ↓
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{adjustment.reason}</td>
                </tr>
                {isExpanded && (
                  <tr id={`metrics-${adjustment.id}`}>
                    <td colSpan={8} className="border-b border-border bg-muted/30">
                      <MetricsDetail metrics={adjustment.metrics} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
