import * as React from "react";
import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { PaginationControls } from "@/components/shared/pagination-controls";
import type { ImportType, HistoryJobSummary } from "./imports-types";
import { useImportHistory } from "./use-import-history";
import { getStatusColor } from "./imports-utils";
import { ImportHistoryDetail } from "./import-history-detail";

export interface ImportHistorySectionProps {
  type: ImportType;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function ExpandableRow({ job }: { job: HistoryJobSummary }): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const detailId = `history-detail-${job.jobId}`;

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-sm hover:bg-muted/50 rounded px-1 py-0.5"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`Expand details for job started ${formatDateTime(job.startedAt)}`}
      >
        {expanded ? (
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="flex-1">{formatDateTime(job.startedAt)}</span>
        <span
          className={`font-medium ${getStatusColor(job.state)}`}
          aria-label={`Status: ${job.state}`}
        >
          {capitalize(job.state)}
        </span>
        <span className="text-muted-foreground ml-4 tabular-nums">
          {job.progress.processed}/{job.progress.imported}/{job.progress.skipped}/{job.progress.failed}
        </span>
      </button>
      {expanded && (
        <div id={detailId} className="ml-6 mt-2 mb-2">
          <ImportHistoryDetail job={job} />
        </div>
      )}
    </div>
  );
}

const historyColumns: ColumnDef<HistoryJobSummary, unknown>[] = [
  {
    id: "summary",
    header: "Job History",
    cell: ({ row }) => <ExpandableRow job={row.original} />,
  },
];

export function ImportHistorySection({
  type,
}: ImportHistorySectionProps): React.ReactNode {
  const {
    expanded,
    toggle,
    jobs,
    loading,
    error,
    retry,
    hasMore,
    hasPrevious,
    pageSize,
    setPageSize,
    goNext,
    goPrevious,
  } = useImportHistory(type);

  return (
    <section aria-label={`${capitalize(type)} import history`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`history-panel-${type}`}
      >
        {expanded ? (
          <ChevronDown className="size-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4" aria-hidden="true" />
        )}
        <span>History</span>
      </Button>

      {expanded && (
        <div id={`history-panel-${type}`} className="mt-2 space-y-2">
          {loading && (
            <div
              className="flex items-center justify-center py-6"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2
                className="size-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
              <span className="sr-only">Loading history…</span>
            </div>
          )}

          {error && !loading && (
            <div
              className="flex flex-col items-center gap-2 py-6 text-center"
              role="alert"
            >
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={retry}>
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && jobs.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No historical jobs found.
            </p>
          )}

          {!loading && !error && jobs.length > 0 && (
            <>
              <DataTable<HistoryJobSummary>
                columns={historyColumns}
                data={jobs}
                loading={false}
                error={null}
                aria-label={`${capitalize(type)} import history table`}
                emptyMessage="No historical jobs found."
              />

              <PaginationControls
                hasPrevious={hasPrevious}
                hasMore={hasMore}
                onNext={goNext}
                onPrevious={goPrevious}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                disabled={loading}
              />
            </>
          )}

          {loading && jobs.length > 0 && (
            <PaginationControls
              hasPrevious={hasPrevious}
              hasMore={hasMore}
              onNext={goNext}
              onPrevious={goPrevious}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              disabled={true}
            />
          )}
        </div>
      )}
    </section>
  );
}
