import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportsPage } from "./imports-page";
import type { UseImportStatusResult } from "./use-import-status";
import type { ImportStatusResponse, ImportJobStatus } from "./imports-types";

vi.mock("./use-import-status");

import { useImportStatus } from "./use-import-status";

const mockUseImportStatus = vi.mocked(useImportStatus);

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

function createDefaultHookResult(
  overrides: Partial<UseImportStatusResult> = {},
): UseImportStatusResult {
  return {
    status: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    startImport: vi.fn().mockResolvedValue(undefined),
    resumeImport: vi.fn().mockResolvedValue(undefined),
    cancelImport: vi.fn().mockResolvedValue(undefined),
    actionError: null,
    clearActionError: vi.fn(),
    ...overrides,
  };
}

describe("ImportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("page heading", () => {
    it("renders 'Imports' heading", () => {
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({
          status: { items: null, sales: null, accounts: null },
        }),
      );

      render(<ImportsPage />);

      expect(
        screen.getByRole("heading", { name: "Imports" }),
      ).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("displays loading indicator when loading and no status", () => {
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({ loading: true, status: null }),
      );

      render(<ImportsPage />);

      expect(screen.getByText(/loading import status/i)).toBeInTheDocument();
    });

    it("still shows the Imports heading while loading", () => {
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({ loading: true, status: null }),
      );

      render(<ImportsPage />);

      expect(
        screen.getByRole("heading", { name: "Imports" }),
      ).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error message when error is set and no status", () => {
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({
          error: "Network request failed",
          status: null,
        }),
      );

      render(<ImportsPage />);

      expect(screen.getByText("Network request failed")).toBeInTheDocument();
    });

    it("shows Retry button when in error state", () => {
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({
          error: "Network request failed",
          status: null,
        }),
      );

      render(<ImportsPage />);

      expect(
        screen.getByRole("button", { name: /retry/i }),
      ).toBeInTheDocument();
    });

    it("calls refresh when Retry button is clicked", () => {
      const refresh = vi.fn();
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({
          error: "Network request failed",
          status: null,
          refresh,
        }),
      );

      render(<ImportsPage />);

      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe("success state", () => {
    it("renders three import type cards", () => {
      const status: ImportStatusResponse = {
        items: createMockJob({ state: "complete" }),
        sales: createMockJob({ state: "running" }),
        accounts: null,
      };

      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({ status }),
      );

      render(<ImportsPage />);

      expect(screen.getByText("Items")).toBeInTheDocument();
      expect(screen.getByText("Sales")).toBeInTheDocument();
      expect(screen.getByText("Accounts")).toBeInTheDocument();
    });

    it("renders manual refresh button", () => {
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({
          status: { items: null, sales: null, accounts: null },
        }),
      );

      render(<ImportsPage />);

      expect(
        screen.getByRole("button", { name: /refresh import status/i }),
      ).toBeInTheDocument();
    });

    it("calls refresh when manual refresh button is clicked", () => {
      const refresh = vi.fn();
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({
          status: { items: null, sales: null, accounts: null },
          refresh,
        }),
      );

      render(<ImportsPage />);

      fireEvent.click(
        screen.getByRole("button", { name: /refresh import status/i }),
      );
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe("action error", () => {
    it("shows action error alert when actionError is set", () => {
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({
          status: { items: null, sales: null, accounts: null },
          actionError: "An import is already running for items",
        }),
      );

      render(<ImportsPage />);

      expect(
        screen.getByText("An import is already running for items"),
      ).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("shows Dismiss button on action error alert", () => {
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({
          status: { items: null, sales: null, accounts: null },
          actionError: "An import is already running for items",
        }),
      );

      render(<ImportsPage />);

      expect(
        screen.getByRole("button", { name: /dismiss error/i }),
      ).toBeInTheDocument();
    });

    it("calls clearActionError when Dismiss is clicked", () => {
      const clearActionError = vi.fn();
      mockUseImportStatus.mockReturnValue(
        createDefaultHookResult({
          status: { items: null, sales: null, accounts: null },
          actionError: "An import is already running for items",
          clearActionError,
        }),
      );

      render(<ImportsPage />);

      fireEvent.click(
        screen.getByRole("button", { name: /dismiss error/i }),
      );
      expect(clearActionError).toHaveBeenCalledTimes(1);
    });
  });
});
