import type { HistoryJobSummary } from "./imports-types";
import { formatElapsedTime, sanitizeErrorMessage } from "./imports-utils";
import { FailureDetails } from "./failure-details";

export interface ImportHistoryDetailProps {
  job: HistoryJobSummary;
}

/**
 * Expanded detail view for a single historical import job.
 * Shows elapsed time, progress counts, failure entries, and error messages
 * depending on the job state and available report data.
 */
export function ImportHistoryDetail({
  job,
}: ImportHistoryDetailProps): React.ReactNode {
  // Complete job with a report — show full report data
  if (job.state === "complete" && job.report) {
    return (
      <div className="space-y-3 p-3" aria-label="Job detail">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            Duration:{" "}
            <span className="font-medium text-foreground">
              {formatElapsedTime(job.report.elapsedSeconds)}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded border p-2 text-center">
            <p className="text-xs text-muted-foreground">Processed</p>
            <p className="text-lg font-semibold">{job.report.totalProcessed}</p>
          </div>
          <div className="rounded border p-2 text-center">
            <p className="text-xs text-muted-foreground">Imported</p>
            <p className="text-lg font-semibold">{job.report.imported}</p>
          </div>
          <div className="rounded border p-2 text-center">
            <p className="text-xs text-muted-foreground">Skipped</p>
            <p className="text-lg font-semibold">{job.report.skipped}</p>
          </div>
          <div className="rounded border p-2 text-center">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-lg font-semibold text-destructive">
              {job.report.failed}
            </p>
          </div>
        </div>

        {job.report.failures.length > 0 && (
          <FailureDetails report={job.report} />
        )}

        {job.report.truncated && job.report.failures.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Showing {job.report.failures.length} of {job.report.totalFailures}{" "}
            failures
          </p>
        )}
      </div>
    );
  }

  // Failed job with an error — show sanitized error
  if (job.state === "failed" && job.error) {
    return (
      <div className="space-y-3 p-3" aria-label="Job detail">
        <div className="rounded border border-destructive/50 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">
            {sanitizeErrorMessage(job.error)}
          </p>
        </div>
      </div>
    );
  }

  // Jobs without report data (running/paused) — show current progress counts
  return (
    <div className="space-y-3 p-3" aria-label="Job detail">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded border p-2 text-center">
          <p className="text-xs text-muted-foreground">Processed</p>
          <p className="text-lg font-semibold">{job.progress.processed}</p>
        </div>
        <div className="rounded border p-2 text-center">
          <p className="text-xs text-muted-foreground">Imported</p>
          <p className="text-lg font-semibold">{job.progress.imported}</p>
        </div>
        <div className="rounded border p-2 text-center">
          <p className="text-xs text-muted-foreground">Skipped</p>
          <p className="text-lg font-semibold">{job.progress.skipped}</p>
        </div>
        <div className="rounded border p-2 text-center">
          <p className="text-xs text-muted-foreground">Failed</p>
          <p className="text-lg font-semibold text-destructive">
            {job.progress.failed}
          </p>
        </div>
      </div>
    </div>
  );
}
