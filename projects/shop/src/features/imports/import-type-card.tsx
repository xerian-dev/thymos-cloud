import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  ImportType,
  ImportJobStatus,
  ActionButtonStates,
} from "./imports-types";
import {
  getStatusColor,
  getActionButtonStates,
  sanitizeErrorMessage,
  formatElapsedTime,
} from "./imports-utils";
import { FailureDetails } from "./failure-details";
import { ImportHistorySection } from "./import-history-section";

export interface ImportTypeCardProps {
  type: ImportType;
  job: ImportJobStatus | null;
  onStart: (type: ImportType) => Promise<void>;
  onResume: (type: ImportType) => Promise<void>;
  onCancel: (type: ImportType) => Promise<void>;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString();
}

export function ImportTypeCard({
  type,
  job,
  onStart,
  onResume,
  onCancel,
}: ImportTypeCardProps): React.ReactNode {
  const buttonStates: ActionButtonStates = getActionButtonStates(job);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{capitalize(type)}</CardTitle>
          {job && (
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${getStatusColor(job.state)}`}
              aria-label={`Status: ${job.state}`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full bg-current`}
                aria-hidden="true"
              />
              {capitalize(job.state)}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {job === null ? (
          <p className="text-sm text-muted-foreground">No job available</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                Phase:{" "}
                <span className="font-medium text-foreground">
                  {capitalize(job.phase)}
                </span>
              </span>
              <span>
                Started:{" "}
                <span className="font-medium text-foreground">
                  {formatTimestamp(job.startedAt)}
                </span>
              </span>
              <span>
                Updated:{" "}
                <span className="font-medium text-foreground">
                  {formatTimestamp(job.lastUpdatedAt)}
                </span>
              </span>
              {job.report && (
                <span>
                  Duration:{" "}
                  <span className="font-medium text-foreground">
                    {formatElapsedTime(job.report.elapsedSeconds)}
                  </span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded border p-2 text-center">
                <p className="text-xs text-muted-foreground">Processed</p>
                <p className="text-lg font-semibold">
                  {job.progress.processed}
                </p>
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

            {job.state === "failed" && job.error && (
              <div className="rounded border border-destructive/50 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">
                  {sanitizeErrorMessage(job.error)}
                </p>
              </div>
            )}

            {job.report && job.report.failures.length > 0 && (
              <FailureDetails report={job.report} />
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2">
        <Button
          variant="default"
          size="sm"
          disabled={!buttonStates.startEnabled}
          onClick={() => onStart(type)}
          aria-label={`Start ${type} import`}
        >
          Start
        </Button>
        {buttonStates.resumeVisible && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onResume(type)}
            aria-label={`Resume ${type} import`}
          >
            Resume
          </Button>
        )}
        {buttonStates.cancelVisible && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onCancel(type)}
            aria-label={`Cancel ${type} import`}
          >
            Cancel
          </Button>
        )}
      </CardFooter>

      <ImportHistorySection type={type} />
    </Card>
  );
}
