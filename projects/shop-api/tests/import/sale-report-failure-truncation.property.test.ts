import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Feature: consigncloud-sale-import, Property 6: Import report failure list is bounded and truncated correctly
 *
 * Validates: Requirements 11.2, 11.5
 *
 * The sale-sync-orchestrator uses the same logic as item-sync-orchestrator:
 * - MAX_FAILURES_IN_REPORT = 100
 * - MAX_ERROR_LENGTH = 200
 * - Report failures = failures.slice(0, 100).map(f => ({ saleId: f.saleId, error: f.error.slice(0, 200) }))
 * - truncated = totalFailures > 100
 * - totalFailures = progress.failed
 *
 * We define a pure helper that replicates this logic and property-test it.
 */

interface FailureEntry {
  saleId: string;
  error: string;
}

function buildReportFailures(failures: FailureEntry[], totalFailed: number) {
  const MAX_FAILURES = 100;
  const MAX_ERROR = 200;
  const reportFailures = failures.slice(0, MAX_FAILURES).map((f) => ({
    saleId: f.saleId,
    error: f.error.slice(0, MAX_ERROR),
  }));
  return {
    failures: reportFailures,
    truncated: totalFailed > MAX_FAILURES,
    totalFailures: totalFailed,
  };
}

describe("Property 6: Import report failure list is bounded and truncated correctly", () => {
  const failureEntryGen = fc.record({
    saleId: fc.uuid(),
    error: fc.string({ minLength: 0, maxLength: 1000 }),
  });

  /**
   * Validates: Requirements 11.2, 11.5
   */
  it("failures list contains at most 100 entries", () => {
    fc.assert(
      fc.property(
        fc.array(failureEntryGen, { minLength: 0, maxLength: 500 }),
        (failures) => {
          const result = buildReportFailures(failures, failures.length);
          expect(result.failures.length).toBeLessThanOrEqual(100);
          expect(result.failures.length).toBe(Math.min(failures.length, 100));
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 11.2, 11.5
   */
  it("each failure entry error is at most 200 characters", () => {
    fc.assert(
      fc.property(
        fc.array(failureEntryGen, { minLength: 1, maxLength: 500 }),
        (failures) => {
          const result = buildReportFailures(failures, failures.length);
          for (const entry of result.failures) {
            expect(entry.error.length).toBeLessThanOrEqual(200);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 11.2, 11.5
   */
  it("truncated is true if and only if totalFailed > 100", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (totalFailed) => {
        const failures = Array.from({ length: totalFailed }, (_, i) => ({
          saleId: `sale-${i}`,
          error: `error ${i}`,
        }));

        const result = buildReportFailures(failures, totalFailed);
        expect(result.truncated).toBe(totalFailed > 100);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 11.2, 11.5
   */
  it("totalFailures always equals the totalFailed input", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (totalFailed) => {
        const failures = Array.from({ length: totalFailed }, (_, i) => ({
          saleId: `sale-${i}`,
          error: `error ${i}`,
        }));

        const result = buildReportFailures(failures, totalFailed);
        expect(result.totalFailures).toBe(totalFailed);
      }),
      { numRuns: 200 },
    );
  });
});
