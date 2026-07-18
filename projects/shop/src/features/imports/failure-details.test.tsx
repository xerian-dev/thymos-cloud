import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FailureDetails } from "./failure-details";
import type { FailureEntry, ImportReport } from "./imports-types";

function makeReport(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    jobId: "test-job-id",
    totalProcessed: 100,
    imported: 90,
    skipped: 5,
    failed: 5,
    elapsedSeconds: 120,
    failures: [],
    truncated: false,
    totalFailures: 0,
    completedAt: "2024-01-15T10:00:00.000Z",
    ...overrides,
  };
}

function makeFailures(count: number): FailureEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    itemId: `item-${i + 1}`,
    error: `Error message ${i + 1}`,
  }));
}

function renderFailureDetails(
  reportOverrides: Partial<ImportReport> = {},
): void {
  render(<FailureDetails report={makeReport(reportOverrides)} />);
}

describe("FailureDetails", () => {
  describe("rendering failure entries", () => {
    it("renders nothing when failures array is empty", () => {
      const { container } = render(
        <FailureDetails report={makeReport({ failures: [] })} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders each failure entry with itemId and error message", () => {
      const failures: FailureEntry[] = [
        { itemId: "SKU-001", error: "Missing required field: price" },
        { itemId: "SKU-002", error: "Invalid category" },
      ];

      renderFailureDetails({ failures, totalFailures: 2 });

      expect(screen.getByText("SKU-001")).toBeInTheDocument();
      expect(
        screen.getByText("Missing required field: price"),
      ).toBeInTheDocument();
      expect(screen.getByText("SKU-002")).toBeInTheDocument();
      expect(screen.getByText("Invalid category")).toBeInTheDocument();
    });

    it("displays failure list without collapse button when 3 or fewer entries", () => {
      const failures = makeFailures(3);
      renderFailureDetails({ failures, totalFailures: 3 });

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByRole("list")).toBeInTheDocument();
      expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });
  });

  describe("truncation message", () => {
    it("shows truncation message when truncated is true", () => {
      const failures = makeFailures(2);
      renderFailureDetails({
        failures,
        truncated: true,
        totalFailures: 50,
      });

      expect(screen.getByText("Showing 2 of 50 failures")).toBeInTheDocument();
    });

    it("does not show truncation message when truncated is false", () => {
      const failures = makeFailures(2);
      renderFailureDetails({
        failures,
        truncated: false,
        totalFailures: 2,
      });

      expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    });
  });

  describe("collapsible behavior", () => {
    it("shows collapse button when more than 3 failures", () => {
      const failures = makeFailures(5);
      renderFailureDetails({ failures, totalFailures: 5 });

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("hides the list by default when collapsible", () => {
      const failures = makeFailures(5);
      renderFailureDetails({ failures, totalFailures: 5 });

      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("shows the list when expand button is clicked", () => {
      const failures = makeFailures(5);
      renderFailureDetails({ failures, totalFailures: 5 });

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("list")).toBeInTheDocument();
      expect(screen.getAllByRole("listitem")).toHaveLength(5);
    });

    it("collapses the list when expand button is clicked again", () => {
      const failures = makeFailures(5);
      renderFailureDetails({ failures, totalFailures: 5 });

      const button = screen.getByRole("button");
      fireEvent.click(button);
      fireEvent.click(button);

      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("has aria-controls pointing to the list region", () => {
      const failures = makeFailures(5);
      renderFailureDetails({ failures, totalFailures: 5 });

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-controls", "failure-details-list");
    });

    it("shows truncated count in the button label when truncated", () => {
      const failures = makeFailures(5);
      renderFailureDetails({
        failures,
        truncated: true,
        totalFailures: 25,
      });

      const button = screen.getByRole("button");
      expect(button).toHaveTextContent("Failures (5 of 25)");
    });
  });
});
