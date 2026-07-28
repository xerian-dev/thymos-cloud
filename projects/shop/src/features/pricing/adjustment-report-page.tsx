import * as React from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

import type { AdjustmentFilters } from "./pricing-types";
import { useAdjustments } from "./use-adjustments";
import { AdjustmentReportFilters } from "./adjustment-report-filters";
import { AdjustmentSummaryBanner } from "./adjustment-summary-banner";
import { AdjustmentReportTable } from "./adjustment-report-table";

export function AdjustmentReportPage(): React.ReactNode {
  const [filters, setFilters] = React.useState<AdjustmentFilters>({});

  const { adjustments, isLoading, error, hasMore, loadMore, refresh } =
    useAdjustments({ filters });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Pricing Adjustments</h1>

      <AdjustmentReportFilters filters={filters} onFiltersChange={setFilters} />

      <AdjustmentSummaryBanner adjustments={adjustments} />

      {error ? (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-6"
          role="alert"
        >
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <AdjustmentReportTable
            adjustments={adjustments}
            isLoading={isLoading && adjustments.length === 0}
          />

          {isLoading && adjustments.length > 0 && (
            <div className="flex justify-center py-4" aria-busy="true">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {hasMore && !isLoading && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore}>
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
