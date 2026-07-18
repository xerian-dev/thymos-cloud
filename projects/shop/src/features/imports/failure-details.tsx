import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportReport } from "./imports-types";

export interface FailureDetailsProps {
  report: ImportReport;
}

const COLLAPSE_THRESHOLD = 3;

export function FailureDetails({
  report,
}: FailureDetailsProps): React.ReactNode {
  const [expanded, setExpanded] = React.useState(false);

  if (report.failures.length === 0) {
    return null;
  }

  const collapsible = report.failures.length > COLLAPSE_THRESHOLD;
  const regionId = "failure-details-list";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        {collapsible ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls={regionId}
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            <span>
              Failures ({report.failures.length}
              {report.truncated ? ` of ${report.totalFailures}` : ""})
            </span>
          </Button>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">
            Failures ({report.failures.length}
            {report.truncated ? ` of ${report.totalFailures}` : ""})
          </span>
        )}
      </div>

      {(!collapsible || expanded) && (
        <ul
          id={regionId}
          role="list"
          className="space-y-1 text-sm"
          aria-label="Failure entries"
        >
          {report.failures.map((entry, index) => (
            <li
              key={`${entry.itemId}-${index}`}
              className="rounded border border-border px-3 py-2"
            >
              <span className="font-medium text-foreground">
                {entry.itemId}
              </span>
              <span className="mx-2 text-muted-foreground">&mdash;</span>
              <span className="text-destructive">{entry.error}</span>
            </li>
          ))}
        </ul>
      )}

      {report.truncated && (
        <p className="text-xs text-muted-foreground">
          Showing {report.failures.length} of {report.totalFailures} failures
        </p>
      )}
    </div>
  );
}
