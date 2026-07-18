import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportHistoryDetail } from "./import-history-detail";
import type { HistoryJobSummary, ImportReport } from "./imports-types";

vi.mock("./failure-details", () => ({
  FailureDetails: ({ report }: { report: ImportReport }) => (
    <div data-testid="failure-details">Failures: {report.failures.length}</div>
  ),
}));

vi.mock("./imports-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./imports-utils")>();
  return {
    ...actual,
    sanitizeErrorMessage: vi.fn((msg: string) => `sanitized:${msg}`),
    formatElapsedTime: vi.fn((seconds: number) => `${seconds}s formatted`),
  };
});

function createCompleteJob(
  overrides: Partial<HistoryJobSummary> = {},
): HistoryJobSummary {
  return {
    jobId: "job-001",
    state: "complete",
    phase: "sync",
    startedAt: "2024-01-15T10:00:00.000Z",
    lastUpdatedAt: "2024-01-15T10:45:00.000Z",
    progress: {
      processed: 1500,
      imported: 1200,
      skipped: 250,
      failed: 50,
    },
    report: {
      jobId: "job-001",
      totalProcessed: 1500,
      imported: 1200,
      skipped: 250,
      failed: 50,
      elapsedSeconds: 2700,
      failures: [
        { itemId: "ext-123", error: "Missing required field: amount" },
      ],
      truncated: false,
      totalFailures: 1,
      completedAt: "2024-01-15T10:45:00.000Z",
    },
    ...overrides,
  };
}

function createFailedJob(
  overrides: Partial<HistoryJobSummary> = {},
): HistoryJobSummary {
  return {
    jobId: "job-002",
    state: "failed",
    phase: "fetch",
    startedAt: "2024-01-14T08:00:00.000Z",
    lastUpdatedAt: "2024-01-14T08:02:30.000Z",
    progress: {
      processed: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
    },
    error: "Connection timeout to external API",
    ...overrides,
  };
}

function createRunningJob(
  overrides: Partial<HistoryJobSummary> = {},
): HistoryJobSummary {
  return {
    jobId: "job-003",
    state: "running",
    phase: "sync",
    startedAt: "2024-01-16T09:00:00.000Z",
    lastUpdatedAt: "2024-01-16T09:10:00.000Z",
    progress: {
      processed: 500,
      imported: 400,
      skipped: 80,
      failed: 20,
    },
    ...overrides,
  };
}

describe("ImportHistoryDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("complete job with report", () => {
    it("renders elapsed time via formatElapsedTime", () => {
      const job = createCompleteJob();

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByText("2700s formatted")).toBeInTheDocument();
    });

    it("renders all 4 progress counts from report", () => {
      const job = createCompleteJob();

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByText("1500")).toBeInTheDocument(); // totalProcessed
      expect(screen.getByText("1200")).toBeInTheDocument(); // imported
      expect(screen.getByText("250")).toBeInTheDocument(); // skipped
      expect(screen.getByText("50")).toBeInTheDocument(); // failed
    });

    it("renders progress count labels", () => {
      const job = createCompleteJob();

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByText("Processed")).toBeInTheDocument();
      expect(screen.getByText("Imported")).toBeInTheDocument();
      expect(screen.getByText("Skipped")).toBeInTheDocument();
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("renders FailureDetails when failures exist", () => {
      const job = createCompleteJob();

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByTestId("failure-details")).toBeInTheDocument();
      expect(screen.getByText("Failures: 1")).toBeInTheDocument();
    });

    it("does not render FailureDetails when failures are empty", () => {
      const job = createCompleteJob({
        report: {
          jobId: "job-001",
          totalProcessed: 100,
          imported: 100,
          skipped: 0,
          failed: 0,
          elapsedSeconds: 60,
          failures: [],
          truncated: false,
          totalFailures: 0,
          completedAt: "2024-01-15T10:01:00.000Z",
        },
      });

      render(<ImportHistoryDetail job={job} />);

      expect(screen.queryByTestId("failure-details")).not.toBeInTheDocument();
    });
  });

  describe("complete job with truncated failures", () => {
    it("shows truncation message when failures are truncated and list is empty", () => {
      const job = createCompleteJob({
        report: {
          jobId: "job-001",
          totalProcessed: 1500,
          imported: 1200,
          skipped: 200,
          failed: 100,
          elapsedSeconds: 2700,
          failures: [],
          truncated: true,
          totalFailures: 100,
          completedAt: "2024-01-15T10:45:00.000Z",
        },
      });

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByText("Showing 0 of 100 failures")).toBeInTheDocument();
    });
  });

  describe("failed job with error", () => {
    it("renders sanitized error message", () => {
      const job = createFailedJob({
        error: "Connection timeout to external API",
      });

      render(<ImportHistoryDetail job={job} />);

      // sanitizeErrorMessage mock prepends "sanitized:"
      expect(
        screen.getByText("sanitized:Connection timeout to external API"),
      ).toBeInTheDocument();
    });

    it("displays the sanitized version of the error string", () => {
      const job = createFailedJob({ error: "Connection timeout" });

      render(<ImportHistoryDetail job={job} />);

      // The mock prepends "sanitized:" to prove the function was called
      expect(
        screen.getByText("sanitized:Connection timeout"),
      ).toBeInTheDocument();
    });
  });

  describe("running/paused job (no report)", () => {
    it("renders current progress counts from job.progress", () => {
      const job = createRunningJob();

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByText("500")).toBeInTheDocument(); // processed
      expect(screen.getByText("400")).toBeInTheDocument(); // imported
      expect(screen.getByText("80")).toBeInTheDocument(); // skipped
      expect(screen.getByText("20")).toBeInTheDocument(); // failed
    });

    it("renders progress count labels for running job", () => {
      const job = createRunningJob();

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByText("Processed")).toBeInTheDocument();
      expect(screen.getByText("Imported")).toBeInTheDocument();
      expect(screen.getByText("Skipped")).toBeInTheDocument();
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("renders paused job progress counts", () => {
      const job = createRunningJob({
        state: "paused",
        progress: {
          processed: 300,
          imported: 250,
          skipped: 30,
          failed: 20,
        },
      });

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByText("300")).toBeInTheDocument();
      expect(screen.getByText("250")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
    });

    it("does not render FailureDetails for running job", () => {
      const job = createRunningJob();

      render(<ImportHistoryDetail job={job} />);

      expect(screen.queryByTestId("failure-details")).not.toBeInTheDocument();
    });
  });

  describe("error sanitization", () => {
    it("passes error through sanitizeErrorMessage removing stack traces", () => {
      const errorWithStack =
        "TypeError: Cannot read property\n    at Object.handler (/app/src/handler.ts:45)\n    at processTicksAndRejections";
      const job = createFailedJob({ error: errorWithStack });

      render(<ImportHistoryDetail job={job} />);

      // The mock prepends "sanitized:" which proves sanitizeErrorMessage was invoked
      const element = screen.getByLabelText("Job detail");
      expect(element).toHaveTextContent(/sanitized:/);
    });
  });

  describe("accessibility", () => {
    it("has aria-label 'Job detail' for complete job", () => {
      const job = createCompleteJob();

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByLabelText("Job detail")).toBeInTheDocument();
    });

    it("has aria-label 'Job detail' for failed job", () => {
      const job = createFailedJob();

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByLabelText("Job detail")).toBeInTheDocument();
    });

    it("has aria-label 'Job detail' for running job", () => {
      const job = createRunningJob();

      render(<ImportHistoryDetail job={job} />);

      expect(screen.getByLabelText("Job detail")).toBeInTheDocument();
    });
  });
});
