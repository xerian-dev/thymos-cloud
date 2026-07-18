import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportTypeCard } from "./import-type-card";
import type { ImportJobStatus, ImportReport } from "./imports-types";

function createMockJob(
  overrides: Partial<ImportJobStatus> = {},
): ImportJobStatus {
  return {
    jobId: "job-123",
    state: "running",
    phase: "sync",
    startedAt: "2024-01-15T10:00:00.000Z",
    lastUpdatedAt: "2024-01-15T10:05:30.000Z",
    progress: {
      processed: 100,
      imported: 80,
      skipped: 15,
      failed: 5,
    },
    ...overrides,
  };
}

function createMockReport(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    jobId: "job-123",
    totalProcessed: 500,
    imported: 480,
    skipped: 15,
    failed: 5,
    elapsedSeconds: 2700,
    failures: [],
    truncated: false,
    totalFailures: 5,
    completedAt: "2024-01-15T10:45:00.000Z",
    ...overrides,
  };
}

const defaultHandlers = {
  onStart: vi.fn().mockResolvedValue(undefined),
  onResume: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn().mockResolvedValue(undefined),
};

describe("ImportTypeCard", () => {
  describe("null job state", () => {
    it("shows 'No job available' when job is null", () => {
      render(<ImportTypeCard type="items" job={null} {...defaultHandlers} />);

      expect(screen.getByText("No job available")).toBeInTheDocument();
    });

    it("shows Start button enabled when job is null", () => {
      render(<ImportTypeCard type="items" job={null} {...defaultHandlers} />);

      const startButton = screen.getByRole("button", {
        name: /start items import/i,
      });
      expect(startButton).toBeInTheDocument();
      expect(startButton).not.toBeDisabled();
    });

    it("does not show Resume or Cancel buttons when job is null", () => {
      render(<ImportTypeCard type="items" job={null} {...defaultHandlers} />);

      expect(
        screen.queryByRole("button", { name: /resume/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /cancel/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("running job state", () => {
    it("shows blue status indicator for running state", () => {
      const job = createMockJob({ state: "running" });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      const statusIndicator = screen.getByLabelText("Status: running");
      expect(statusIndicator).toBeInTheDocument();
      expect(statusIndicator.className).toContain("text-blue-600");
    });

    it("disables Start button when job is running", () => {
      const job = createMockJob({ state: "running" });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      const startButton = screen.getByRole("button", {
        name: /start items import/i,
      });
      expect(startButton).toBeDisabled();
    });

    it("shows Cancel button when job is running", () => {
      const job = createMockJob({ state: "running" });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      expect(
        screen.getByRole("button", { name: /cancel items import/i }),
      ).toBeInTheDocument();
    });

    it("does not show Resume button when job is running", () => {
      const job = createMockJob({ state: "running" });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      expect(
        screen.queryByRole("button", { name: /resume/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("paused job state", () => {
    it("shows yellow status indicator for paused state", () => {
      const job = createMockJob({ state: "paused" });

      render(<ImportTypeCard type="sales" job={job} {...defaultHandlers} />);

      const statusIndicator = screen.getByLabelText("Status: paused");
      expect(statusIndicator).toBeInTheDocument();
      expect(statusIndicator.className).toContain("text-yellow-600");
    });

    it("enables Start button when job is paused", () => {
      const job = createMockJob({ state: "paused" });

      render(<ImportTypeCard type="sales" job={job} {...defaultHandlers} />);

      const startButton = screen.getByRole("button", {
        name: /start sales import/i,
      });
      expect(startButton).not.toBeDisabled();
    });

    it("shows Resume button when job is paused", () => {
      const job = createMockJob({ state: "paused" });

      render(<ImportTypeCard type="sales" job={job} {...defaultHandlers} />);

      expect(
        screen.getByRole("button", { name: /resume sales import/i }),
      ).toBeInTheDocument();
    });

    it("does not show Cancel button when job is paused", () => {
      const job = createMockJob({ state: "paused" });

      render(<ImportTypeCard type="sales" job={job} {...defaultHandlers} />);

      expect(
        screen.queryByRole("button", { name: /cancel/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("failed job state", () => {
    it("shows red status indicator for failed state", () => {
      const job = createMockJob({
        state: "failed",
        error: "Connection timeout",
      });

      render(<ImportTypeCard type="accounts" job={job} {...defaultHandlers} />);

      const statusIndicator = screen.getByLabelText("Status: failed");
      expect(statusIndicator).toBeInTheDocument();
      expect(statusIndicator.className).toContain("text-red-600");
    });

    it("displays error message when job has failed", () => {
      const job = createMockJob({
        state: "failed",
        error: "Connection timeout",
      });

      render(<ImportTypeCard type="accounts" job={job} {...defaultHandlers} />);

      expect(screen.getByText("Connection timeout")).toBeInTheDocument();
    });

    it("enables Start button when job is failed", () => {
      const job = createMockJob({
        state: "failed",
        error: "Connection timeout",
      });

      render(<ImportTypeCard type="accounts" job={job} {...defaultHandlers} />);

      const startButton = screen.getByRole("button", {
        name: /start accounts import/i,
      });
      expect(startButton).not.toBeDisabled();
    });

    it("shows Resume button when job is failed", () => {
      const job = createMockJob({
        state: "failed",
        error: "Connection timeout",
      });

      render(<ImportTypeCard type="accounts" job={job} {...defaultHandlers} />);

      expect(
        screen.getByRole("button", { name: /resume accounts import/i }),
      ).toBeInTheDocument();
    });
  });

  describe("complete job state", () => {
    it("shows green status indicator for complete state", () => {
      const job = createMockJob({ state: "complete" });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      const statusIndicator = screen.getByLabelText("Status: complete");
      expect(statusIndicator).toBeInTheDocument();
      expect(statusIndicator.className).toContain("text-green-600");
    });

    it("enables Start button when job is complete", () => {
      const job = createMockJob({ state: "complete" });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      const startButton = screen.getByRole("button", {
        name: /start items import/i,
      });
      expect(startButton).not.toBeDisabled();
    });

    it("does not show Resume or Cancel buttons when job is complete", () => {
      const job = createMockJob({ state: "complete" });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      expect(
        screen.queryByRole("button", { name: /resume/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /cancel/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("progress counters", () => {
    it("shows progress counters for a running job", () => {
      const job = createMockJob({
        state: "running",
        progress: { processed: 1500, imported: 1200, skipped: 250, failed: 50 },
      });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      expect(screen.getByText("1500")).toBeInTheDocument();
      expect(screen.getByText("1200")).toBeInTheDocument();
      expect(screen.getByText("250")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });

    it("shows progress counters for a paused job", () => {
      const job = createMockJob({
        state: "paused",
        progress: { processed: 300, imported: 280, skipped: 12, failed: 8 },
      });

      render(<ImportTypeCard type="sales" job={job} {...defaultHandlers} />);

      expect(screen.getByText("300")).toBeInTheDocument();
      expect(screen.getByText("280")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
    });

    it("shows progress counters for a failed job", () => {
      const job = createMockJob({
        state: "failed",
        error: "Timeout",
        progress: { processed: 50, imported: 40, skipped: 5, failed: 5 },
      });

      render(<ImportTypeCard type="accounts" job={job} {...defaultHandlers} />);

      expect(screen.getByText("50")).toBeInTheDocument();
      expect(screen.getByText("40")).toBeInTheDocument();
    });

    it("shows progress counters for a complete job", () => {
      const job = createMockJob({
        state: "complete",
        progress: { processed: 1000, imported: 950, skipped: 30, failed: 20 },
      });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      expect(screen.getByText("1000")).toBeInTheDocument();
      expect(screen.getByText("950")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
    });

    it("shows counter labels", () => {
      const job = createMockJob({ state: "running" });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      expect(screen.getByText("Processed")).toBeInTheDocument();
      expect(screen.getByText("Imported")).toBeInTheDocument();
      expect(screen.getByText("Skipped")).toBeInTheDocument();
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });
  });

  describe("failure details", () => {
    it("shows failure details when report has failures", () => {
      const report = createMockReport({
        failures: [
          { itemId: "ext-123", error: "Missing required field: amount" },
          { itemId: "ext-456", error: "Invalid date format" },
        ],
      });
      const job = createMockJob({ state: "complete", report });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      expect(screen.getByText("ext-123")).toBeInTheDocument();
      expect(
        screen.getByText("Missing required field: amount"),
      ).toBeInTheDocument();
      expect(screen.getByText("ext-456")).toBeInTheDocument();
      expect(screen.getByText("Invalid date format")).toBeInTheDocument();
    });

    it("shows truncation message when report is truncated", () => {
      const report = createMockReport({
        failures: [{ itemId: "ext-001", error: "Error 1" }],
        truncated: true,
        totalFailures: 150,
      });
      const job = createMockJob({ state: "complete", report });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      expect(
        screen.getByText(/showing 1 of 150 failures/i),
      ).toBeInTheDocument();
    });

    it("does not show failure details when report has no failures", () => {
      const report = createMockReport({ failures: [] });
      const job = createMockJob({ state: "complete", report });

      render(<ImportTypeCard type="items" job={job} {...defaultHandlers} />);

      expect(
        screen.queryByRole("list", { name: /failure entries/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("action button interactions", () => {
    it("calls onStart with the import type when Start is clicked", () => {
      const onStart = vi.fn().mockResolvedValue(undefined);

      render(
        <ImportTypeCard
          type="items"
          job={null}
          onStart={onStart}
          onResume={vi.fn().mockResolvedValue(undefined)}
          onCancel={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: /start items import/i }),
      );
      expect(onStart).toHaveBeenCalledWith("items");
    });

    it("calls onResume with the import type when Resume is clicked", () => {
      const onResume = vi.fn().mockResolvedValue(undefined);
      const job = createMockJob({ state: "paused" });

      render(
        <ImportTypeCard
          type="sales"
          job={job}
          onStart={vi.fn().mockResolvedValue(undefined)}
          onResume={onResume}
          onCancel={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: /resume sales import/i }),
      );
      expect(onResume).toHaveBeenCalledWith("sales");
    });

    it("calls onCancel with the import type when Cancel is clicked", () => {
      const onCancel = vi.fn().mockResolvedValue(undefined);
      const job = createMockJob({ state: "running" });

      render(
        <ImportTypeCard
          type="accounts"
          job={job}
          onStart={vi.fn().mockResolvedValue(undefined)}
          onResume={vi.fn().mockResolvedValue(undefined)}
          onCancel={onCancel}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: /cancel accounts import/i }),
      );
      expect(onCancel).toHaveBeenCalledWith("accounts");
    });
  });
});
