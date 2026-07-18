import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportHistorySection } from "./import-history-section";
import type { UseImportHistoryResult } from "./use-import-history";
import type { HistoryJobSummary } from "./imports-types";

const mockUseImportHistory = vi.fn<() => UseImportHistoryResult>();

vi.mock("./use-import-history", () => ({
  useImportHistory: (...args: unknown[]) => mockUseImportHistory(...args),
}));

vi.mock("./import-history-detail", () => ({
  ImportHistoryDetail: ({ job }: { job: HistoryJobSummary }) => (
    <div data-testid={`detail-${job.jobId}`}>Detail for {job.jobId}</div>
  ),
}));

function createDefaultHookResult(
  overrides: Partial<UseImportHistoryResult> = {},
): UseImportHistoryResult {
  return {
    expanded: false,
    toggle: vi.fn(),
    jobs: [],
    loading: false,
    error: null,
    retry: vi.fn(),
    hasMore: false,
    hasPrevious: false,
    pageSize: 20,
    setPageSize: vi.fn(),
    goNext: vi.fn(),
    goPrevious: vi.fn(),
    ...overrides,
  };
}

function createMockJob(
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
    ...overrides,
  };
}

describe("ImportHistorySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("collapsed state", () => {
    it("renders toggle button with 'History' label", () => {
      mockUseImportHistory.mockReturnValue(createDefaultHookResult());

      render(<ImportHistorySection type="items" />);

      const button = screen.getByRole("button", { name: /history/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("does not render history panel when collapsed", () => {
      mockUseImportHistory.mockReturnValue(createDefaultHookResult());

      render(<ImportHistorySection type="items" />);

      expect(
        screen.queryByText("No historical jobs found."),
      ).not.toBeInTheDocument();
    });

    it("calls toggle when button is clicked", () => {
      const toggle = vi.fn();
      mockUseImportHistory.mockReturnValue(createDefaultHookResult({ toggle }));

      render(<ImportHistorySection type="items" />);

      fireEvent.click(screen.getByRole("button", { name: /history/i }));
      expect(toggle).toHaveBeenCalledTimes(1);
    });
  });

  describe("expanded state - loading", () => {
    it("shows loading indicator when loading", () => {
      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({ expanded: true, loading: true }),
      );

      render(<ImportHistorySection type="items" />);

      expect(screen.getByText("Loading history…")).toBeInTheDocument();
    });

    it("has aria-busy=true on loading container", () => {
      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({ expanded: true, loading: true }),
      );

      render(<ImportHistorySection type="items" />);

      const loadingContainer = screen
        .getByText("Loading history…")
        .closest("[aria-busy]");
      expect(loadingContainer).toHaveAttribute("aria-busy", "true");
    });

    it("sets aria-expanded to true on toggle button", () => {
      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({ expanded: true, loading: true }),
      );

      render(<ImportHistorySection type="items" />);

      const button = screen.getByRole("button", { name: /history/i });
      expect(button).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("expanded state - error", () => {
    it("shows error message and retry button", () => {
      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({
          expanded: true,
          error: "Unable to load import history",
        }),
      );

      render(<ImportHistorySection type="items" />);

      expect(
        screen.getByText("Unable to load import history"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /retry/i }),
      ).toBeInTheDocument();
    });

    it("calls retry when retry button is clicked", () => {
      const retry = vi.fn();
      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({
          expanded: true,
          error: "Unable to load import history",
          retry,
        }),
      );

      render(<ImportHistorySection type="items" />);

      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
      expect(retry).toHaveBeenCalledTimes(1);
    });
  });

  describe("expanded state - empty", () => {
    it("shows empty state message when no jobs", () => {
      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({ expanded: true, jobs: [] }),
      );

      render(<ImportHistorySection type="items" />);

      expect(screen.getByText("No historical jobs found.")).toBeInTheDocument();
    });
  });

  describe("expanded state - with jobs", () => {
    it("renders job rows with status colours", () => {
      const jobs: HistoryJobSummary[] = [
        createMockJob({ jobId: "job-1", state: "complete" }),
        createMockJob({ jobId: "job-2", state: "failed" }),
      ];

      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({ expanded: true, jobs }),
      );

      render(<ImportHistorySection type="items" />);

      expect(screen.getByText("Complete")).toBeInTheDocument();
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("renders pagination controls", () => {
      const jobs: HistoryJobSummary[] = [createMockJob()];

      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({ expanded: true, jobs, hasMore: true }),
      );

      render(<ImportHistorySection type="items" />);

      expect(
        screen.getByRole("button", { name: /go to next page/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /go to previous page/i }),
      ).toBeInTheDocument();
    });

    it("disables previous button when hasPrevious is false", () => {
      const jobs: HistoryJobSummary[] = [createMockJob()];

      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({
          expanded: true,
          jobs,
          hasMore: true,
          hasPrevious: false,
        }),
      );

      render(<ImportHistorySection type="items" />);

      expect(
        screen.getByRole("button", { name: /go to previous page/i }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /go to next page/i }),
      ).toBeEnabled();
    });

    it("disables next button when hasMore is false", () => {
      const jobs: HistoryJobSummary[] = [createMockJob()];

      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({
          expanded: true,
          jobs,
          hasMore: false,
          hasPrevious: true,
        }),
      );

      render(<ImportHistorySection type="items" />);

      expect(
        screen.getByRole("button", { name: /go to next page/i }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /go to previous page/i }),
      ).toBeEnabled();
    });

    it("renders expandable rows that show detail on click", () => {
      const jobs: HistoryJobSummary[] = [
        createMockJob({ jobId: "job-expand" }),
      ];

      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({ expanded: true, jobs }),
      );

      render(<ImportHistorySection type="items" />);

      // Detail not visible initially
      expect(screen.queryByTestId("detail-job-expand")).not.toBeInTheDocument();

      // Click to expand row
      const expandButton = screen.getByRole("button", {
        name: /expand details/i,
      });
      fireEvent.click(expandButton);

      expect(screen.getByTestId("detail-job-expand")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has section with appropriate aria-label", () => {
      mockUseImportHistory.mockReturnValue(createDefaultHookResult());

      render(<ImportHistorySection type="items" />);

      expect(
        screen.getByRole("region", { name: /items import history/i }),
      ).toBeInTheDocument();
    });

    it("uses aria-controls to associate toggle with panel", () => {
      mockUseImportHistory.mockReturnValue(
        createDefaultHookResult({ expanded: true }),
      );

      render(<ImportHistorySection type="sales" />);

      const button = screen.getByRole("button", { name: /history/i });
      expect(button).toHaveAttribute("aria-controls", "history-panel-sales");
    });
  });
});
