import { describe, it, expect } from "vitest";
import {
  getStatusColor,
  getActionButtonStates,
  shouldPoll,
  sanitizeErrorMessage,
  formatElapsedTime,
} from "./imports-utils";
import type {
  ImportJobStatus,
  ImportStatusResponse,
  JobState,
} from "./imports-types";

function makeJob(overrides: Partial<ImportJobStatus> = {}): ImportJobStatus {
  return {
    jobId: "job-123",
    state: "running",
    phase: "fetch",
    startedAt: "2024-01-01T00:00:00Z",
    lastUpdatedAt: "2024-01-01T00:01:00Z",
    progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
    ...overrides,
  };
}

describe("getStatusColor", () => {
  const states: JobState[] = ["running", "paused", "failed", "complete"];

  it("returns a non-empty string for each state", () => {
    for (const state of states) {
      const color = getStatusColor(state);
      expect(color).toBeTruthy();
      expect(color.length).toBeGreaterThan(0);
    }
  });

  it("returns distinct values for each state", () => {
    const colors = states.map((s) => getStatusColor(s));
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(states.length);
  });

  it("returns expected color for running", () => {
    expect(getStatusColor("running")).toBe("text-blue-600");
  });

  it("returns expected color for paused", () => {
    expect(getStatusColor("paused")).toBe("text-yellow-600");
  });

  it("returns expected color for failed", () => {
    expect(getStatusColor("failed")).toBe("text-red-600");
  });

  it("returns expected color for complete", () => {
    expect(getStatusColor("complete")).toBe("text-green-600");
  });
});

describe("getActionButtonStates", () => {
  it("returns start only when job is null", () => {
    const result = getActionButtonStates(null);
    expect(result).toEqual({
      startEnabled: true,
      resumeVisible: false,
      cancelVisible: false,
    });
  });

  it("returns cancel only when job is running", () => {
    const result = getActionButtonStates(makeJob({ state: "running" }));
    expect(result).toEqual({
      startEnabled: false,
      resumeVisible: false,
      cancelVisible: true,
    });
  });

  it("returns start and resume when job is paused", () => {
    const result = getActionButtonStates(makeJob({ state: "paused" }));
    expect(result).toEqual({
      startEnabled: true,
      resumeVisible: true,
      cancelVisible: false,
    });
  });

  it("returns start and resume when job is failed", () => {
    const result = getActionButtonStates(makeJob({ state: "failed" }));
    expect(result).toEqual({
      startEnabled: true,
      resumeVisible: true,
      cancelVisible: false,
    });
  });

  it("returns start only when job is complete", () => {
    const result = getActionButtonStates(makeJob({ state: "complete" }));
    expect(result).toEqual({
      startEnabled: true,
      resumeVisible: false,
      cancelVisible: false,
    });
  });
});

describe("shouldPoll", () => {
  it("returns false when status is null", () => {
    expect(shouldPoll(null)).toBe(false);
  });

  it("returns false when all jobs are null", () => {
    const status: ImportStatusResponse = {
      items: null,
      sales: null,
      accounts: null,
    };
    expect(shouldPoll(status)).toBe(false);
  });

  it("returns true when one job is running", () => {
    const status: ImportStatusResponse = {
      items: makeJob({ state: "running" }),
      sales: null,
      accounts: null,
    };
    expect(shouldPoll(status)).toBe(true);
  });

  it("returns false when all jobs are complete", () => {
    const status: ImportStatusResponse = {
      items: makeJob({ state: "complete" }),
      sales: makeJob({ state: "complete" }),
      accounts: makeJob({ state: "complete" }),
    };
    expect(shouldPoll(status)).toBe(false);
  });

  it("returns true with mixed states including one running", () => {
    const status: ImportStatusResponse = {
      items: makeJob({ state: "complete" }),
      sales: makeJob({ state: "running" }),
      accounts: makeJob({ state: "failed" }),
    };
    expect(shouldPoll(status)).toBe(true);
  });

  it("returns false when jobs are paused or failed but none running", () => {
    const status: ImportStatusResponse = {
      items: makeJob({ state: "paused" }),
      sales: makeJob({ state: "failed" }),
      accounts: null,
    };
    expect(shouldPoll(status)).toBe(false);
  });
});

describe("sanitizeErrorMessage", () => {
  it("strips stack trace lines", () => {
    const error = `Error: Something went wrong
    at Object.<anonymous> (/app/src/handler.ts:42:5)
    at Module._compile (node:internal/modules/cjs/loader:1234:14)`;
    const result = sanitizeErrorMessage(error);
    expect(result).not.toContain("at Object");
    expect(result).not.toContain("at Module");
  });

  it("strips file paths", () => {
    const error = "Failed to read /home/user/project/src/data.ts:123";
    const result = sanitizeErrorMessage(error);
    expect(result).not.toMatch(/\/[\w./\-]+\.\w+:\d+/);
  });

  it("strips internal error prefixes", () => {
    const error = "TypeError: Cannot read property 'x' of undefined";
    const result = sanitizeErrorMessage(error);
    expect(result).not.toMatch(/^TypeError:/);
  });

  it("truncates messages longer than 200 characters", () => {
    const longMessage = "A".repeat(300);
    const result = sanitizeErrorMessage(longMessage);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it("preserves a simple error message", () => {
    const error = "Connection timeout while fetching data";
    const result = sanitizeErrorMessage(error);
    expect(result).toBe("Connection timeout while fetching data");
  });

  it("handles empty string", () => {
    const result = sanitizeErrorMessage("");
    expect(result).toBe("");
  });
});

describe("formatElapsedTime", () => {
  it("formats 0 seconds", () => {
    expect(formatElapsedTime(0)).toBe("0s");
  });

  it("formats seconds only", () => {
    expect(formatElapsedTime(45)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsedTime(300)).toBe("5m");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatElapsedTime(3661)).toBe("1h 1m 1s");
  });

  it("formats exact minutes without trailing seconds", () => {
    expect(formatElapsedTime(120)).toBe("2m");
  });

  it("formats exact hours", () => {
    expect(formatElapsedTime(3600)).toBe("1h");
  });

  it("handles negative values as 0", () => {
    expect(formatElapsedTime(-10)).toBe("0s");
  });

  it("handles fractional seconds by flooring", () => {
    expect(formatElapsedTime(45.9)).toBe("45s");
  });
});
