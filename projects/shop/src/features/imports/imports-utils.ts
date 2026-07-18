import type {
  ActionButtonStates,
  ImportJobStatus,
  ImportStatusResponse,
  JobState,
} from "./imports-types";

/**
 * Returns a distinct Tailwind color class for each job state.
 * Property 1: No two distinct states map to the same color.
 */
export function getStatusColor(state: JobState): string {
  switch (state) {
    case "running":
      return "text-blue-600";
    case "paused":
      return "text-yellow-600";
    case "failed":
      return "text-red-600";
    case "complete":
      return "text-green-600";
  }
}

/**
 * Derives action button states from the current job status.
 * Property 5:
 * - startEnabled: true when job is null, complete, paused, or failed; false when running
 * - resumeVisible: true when state is paused or failed; false otherwise
 * - cancelVisible: true when state is running; false otherwise
 */
export function getActionButtonStates(
  job: ImportJobStatus | null,
): ActionButtonStates {
  if (job === null) {
    return {
      startEnabled: true,
      resumeVisible: false,
      cancelVisible: false,
    };
  }

  return {
    startEnabled: job.state !== "running",
    resumeVisible: job.state === "paused" || job.state === "failed",
    cancelVisible: job.state === "running",
  };
}

/**
 * Returns true if any non-null job in the status response has state "running".
 * Property 4: shouldPoll returns true iff at least one non-null job has state "running".
 */
export function shouldPoll(status: ImportStatusResponse | null): boolean {
  if (status === null) {
    return false;
  }

  const jobs = [status.items, status.sales, status.accounts];
  return jobs.some((job) => job !== null && job.state === "running");
}

/**
 * Sanitizes an error message by stripping stack traces, file paths,
 * and internal error prefixes, then truncating to 200 characters.
 * Property 6: Result does not contain stack traces, file paths, or internal prefixes.
 */
export function sanitizeErrorMessage(error: string): string {
  // Split into lines and filter out stack trace lines (lines with "at ")
  const lines = error.split("\n");
  const filtered = lines.filter(
    (line) => !/ at /.test(line) && !/^\s*at /.test(line),
  );

  let message = filtered.join(" ").trim();

  // Remove file paths (e.g., /path/to/file.ts:123)
  message = message.replace(/\/[\w./\-]+\.\w+:\d+/g, "");

  // Remove internal error prefixes (e.g., "Error: ", "InternalError: ", "TypeError: ")
  message = message.replace(/^(\w*Error):\s*/i, "");

  // Clean up extra whitespace
  message = message.replace(/\s+/g, " ").trim();

  // Truncate to 200 characters
  if (message.length > 200) {
    message = message.slice(0, 200);
  }

  return message;
}

/**
 * Formats elapsed seconds into a human-readable duration string.
 * Examples: "1h 23m 45s", "5m 30s", "45s"
 */
export function formatElapsedTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs}s`);
  }

  return parts.join(" ");
}
