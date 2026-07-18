import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  shouldPoll,
  getActionButtonStates,
  sanitizeErrorMessage,
} from "./imports-utils";
import type {
  ImportJobStatus,
  ImportStatusResponse,
  JobState,
  ImportPhase,
} from "./imports-types";

// Shared arbitraries

const jobStateArb: fc.Arbitrary<JobState> = fc.constantFrom(
  "running",
  "paused",
  "failed",
  "complete",
);

const importPhaseArb: fc.Arbitrary<ImportPhase> = fc.constantFrom(
  "fetch",
  "sync",
);

const validDateArb: fc.Arbitrary<string> = fc
  .integer({ min: 946684800000, max: 1924905600000 })
  .map((ms) => new Date(ms).toISOString());

const progressCountsArb = fc.record({
  processed: fc.nat(),
  imported: fc.nat(),
  skipped: fc.nat(),
  failed: fc.nat(),
});

const importJobStatusArb: fc.Arbitrary<ImportJobStatus> = fc.record({
  jobId: fc.uuid(),
  state: jobStateArb,
  phase: importPhaseArb,
  startedAt: validDateArb,
  lastUpdatedAt: validDateArb,
  progress: progressCountsArb,
});

const importJobSlotArb: fc.Arbitrary<ImportJobStatus | null> = fc.oneof(
  fc.constant(null),
  importJobStatusArb,
);

const importStatusResponseArb: fc.Arbitrary<ImportStatusResponse> = fc.record({
  items: importJobSlotArb,
  sales: importJobSlotArb,
  accounts: importJobSlotArb,
});

// Feature: import-monitor, Property 4: Polling active iff at least one job running

/**
 * Property 4: Polling is active if and only if at least one job is running
 *
 * For any ImportStatusResponse (where each of the three type slots is either null
 * or an ImportJobStatus with any valid state), the shouldPoll function SHALL return
 * true if and only if at least one non-null job has state "running".
 *
 * Validates: Requirements 4.1, 4.2
 */

describe("Feature: import-monitor, Property 4: Polling active iff at least one job running", () => {
  it("shouldPoll returns true iff at least one non-null job has state 'running'", () => {
    fc.assert(
      fc.property(importStatusResponseArb, (status) => {
        const result = shouldPoll(status);

        const hasRunningJob = [
          status.items,
          status.sales,
          status.accounts,
        ].some((job) => job !== null && job.state === "running");

        expect(result).toBe(hasRunningJob);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: import-monitor, Property 5: Action button states derived from job state

/**
 * Property 5: Action button states are correctly derived from job state
 *
 * For any ImportJobStatus or null value, the getActionButtonStates function SHALL return:
 * - startEnabled: true when job is null, complete, paused, or failed; false when running
 * - resumeVisible: true when state is paused or failed; false otherwise
 * - cancelVisible: true when state is running; false otherwise
 *
 * Validates: Requirements 6.4, 7.1, 7.3
 */

const importJobStatusOrNullArb: fc.Arbitrary<ImportJobStatus | null> = fc.oneof(
  fc.constant(null),
  importJobStatusArb,
);

describe("Feature: import-monitor, Property 5: Action button states derived from job state", () => {
  it("startEnabled is true when job is null, complete, paused, or failed; false when running", () => {
    fc.assert(
      fc.property(importJobStatusOrNullArb, (job) => {
        const result = getActionButtonStates(job);
        if (job === null) {
          expect(result.startEnabled).toBe(true);
        } else if (job.state === "running") {
          expect(result.startEnabled).toBe(false);
        } else {
          expect(result.startEnabled).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("resumeVisible is true when state is paused or failed; false otherwise", () => {
    fc.assert(
      fc.property(importJobStatusOrNullArb, (job) => {
        const result = getActionButtonStates(job);
        if (job === null) {
          expect(result.resumeVisible).toBe(false);
        } else if (job.state === "paused" || job.state === "failed") {
          expect(result.resumeVisible).toBe(true);
        } else {
          expect(result.resumeVisible).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("cancelVisible is true when state is running; false otherwise", () => {
    fc.assert(
      fc.property(importJobStatusOrNullArb, (job) => {
        const result = getActionButtonStates(job);
        if (job !== null && job.state === "running") {
          expect(result.cancelVisible).toBe(true);
        } else {
          expect(result.cancelVisible).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("all three button states are correctly derived for any job state", () => {
    fc.assert(
      fc.property(importJobStatusOrNullArb, (job) => {
        const result = getActionButtonStates(job);

        if (job === null) {
          expect(result).toEqual({
            startEnabled: true,
            resumeVisible: false,
            cancelVisible: false,
          });
        } else {
          switch (job.state) {
            case "running":
              expect(result).toEqual({
                startEnabled: false,
                resumeVisible: false,
                cancelVisible: true,
              });
              break;
            case "paused":
              expect(result).toEqual({
                startEnabled: true,
                resumeVisible: true,
                cancelVisible: false,
              });
              break;
            case "failed":
              expect(result).toEqual({
                startEnabled: true,
                resumeVisible: true,
                cancelVisible: false,
              });
              break;
            case "complete":
              expect(result).toEqual({
                startEnabled: true,
                resumeVisible: false,
                cancelVisible: false,
              });
              break;
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: import-monitor, Property 6: Error messages are sanitized

/**
 * Property 6: Error messages are sanitized
 *
 * For any string containing stack trace patterns (lines starting with "    at ",
 * file path references, or "Error:" prefixed internal details), the sanitizeErrorMessage
 * function SHALL return a string that does not contain those patterns while preserving
 * a meaningful user-facing message.
 *
 * Validates: Requirements 8.3
 */

// Generators for realistic error message components
const identifierCharArb = fc.constantFrom(
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
);

const identifierArb: fc.Arbitrary<string> = fc
  .array(identifierCharArb, { minLength: 1, maxLength: 15 })
  .map((chars) => chars.join(""));

const stackTraceLineArb: fc.Arbitrary<string> = fc
  .tuple(
    identifierArb,
    identifierArb,
    fc.constantFrom("ts", "js", "tsx"),
    fc.nat({ max: 999 }),
  )
  .map(
    ([fnName, file, ext, line]) =>
      `    at ${fnName} (/src/${file}.${ext}:${line})`,
  );

const filePathArb: fc.Arbitrary<string> = fc
  .tuple(
    identifierArb,
    identifierArb,
    fc.constantFrom("ts", "js", "tsx", "jsx"),
    fc.nat({ max: 999 }),
  )
  .map(([dir, file, ext, line]) => `/path/to/${dir}/${file}.${ext}:${line}`);

const errorPrefixArb: fc.Arbitrary<string> = fc.constantFrom(
  "TypeError: ",
  "Error: ",
  "ReferenceError: ",
  "SyntaxError: ",
  "RangeError: ",
);

const userMessageCharArb = fc.constantFrom(
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  " ",
  ".",
  ",",
);

const userMessageArb: fc.Arbitrary<string> = fc
  .array(userMessageCharArb, { minLength: 1, maxLength: 50 })
  .map((chars) => chars.join(""));

// Compose error messages with stack traces, file paths, and prefixes
const errorWithStackTraceArb: fc.Arbitrary<string> = fc
  .tuple(
    errorPrefixArb,
    userMessageArb,
    fc.array(stackTraceLineArb, { minLength: 1, maxLength: 5 }),
  )
  .map(
    ([prefix, msg, stackLines]) => `${prefix}${msg}\n${stackLines.join("\n")}`,
  );

const errorWithFilePathArb: fc.Arbitrary<string> = fc
  .tuple(userMessageArb, filePathArb)
  .map(([msg, path]) => `${msg} at ${path}`);

const errorMessageArb: fc.Arbitrary<string> = fc.oneof(
  errorWithStackTraceArb,
  errorWithFilePathArb,
  fc
    .tuple(errorPrefixArb, userMessageArb)
    .map(([prefix, msg]) => `${prefix}${msg}`),
);

describe("Feature: import-monitor, Property 6: Error messages are sanitized", () => {
  it("result length is always <= 200 characters", () => {
    fc.assert(
      fc.property(errorMessageArb, (errorMsg) => {
        const result = sanitizeErrorMessage(errorMsg);
        expect(result.length).toBeLessThanOrEqual(200);
      }),
      { numRuns: 100 },
    );
  });

  it("result does not contain stack trace patterns (lines with '    at ' followed by code reference)", () => {
    fc.assert(
      fc.property(errorMessageArb, (errorMsg) => {
        const result = sanitizeErrorMessage(errorMsg);
        // Stack trace pattern: "    at " followed by any code reference
        const stackTracePattern = /\s+at\s+\S+/;
        expect(result).not.toMatch(stackTracePattern);
      }),
      { numRuns: 100 },
    );
  });

  it("result does not contain file path patterns (/path/to/file.ext:number)", () => {
    fc.assert(
      fc.property(errorMessageArb, (errorMsg) => {
        const result = sanitizeErrorMessage(errorMsg);
        // File path pattern: /something/something.ext:digits
        const filePathPattern = /\/[\w./\-]+\.\w+:\d+/;
        expect(result).not.toMatch(filePathPattern);
      }),
      { numRuns: 100 },
    );
  });

  it("result does not start with an internal error prefix pattern", () => {
    fc.assert(
      fc.property(errorMessageArb, (errorMsg) => {
        const result = sanitizeErrorMessage(errorMsg);
        // Internal error prefix: word followed by "Error: " at the start
        const errorPrefixPattern = /^\w*Error:\s/i;
        expect(result).not.toMatch(errorPrefixPattern);
      }),
      { numRuns: 100 },
    );
  });
});
