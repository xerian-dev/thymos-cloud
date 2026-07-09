import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildImportReport } from "../../src/import/import-report";

/** Feature: consigncloud-item-import, Property 10: Report failure list is bounded and ordered */
describe("Property 10: Report failure list is bounded and ordered", () => {
  const failureEntryGen = fc.record({
    itemId: fc.uuid(),
    error: fc.string({ minLength: 0, maxLength: 500 }),
  });

  /**
   * Validates: Requirements 7.2, 7.5
   */
  it("failures list contains min(F, 100) entries", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.uuid(),
        (totalFailures, jobId) => {
          const failures = Array.from({ length: totalFailures }, (_, i) => ({
            itemId: `item-${i}`,
            error: `error ${i}`,
          }));

          const report = buildImportReport(
            jobId,
            {
              processed: totalFailures,
              imported: 0,
              skipped: 0,
              failed: totalFailures,
            },
            new Date(Date.now() - 60000).toISOString(),
            failures,
            totalFailures,
          );

          expect(report.failures.length).toBe(Math.min(totalFailures, 100));
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 7.2, 7.5
   */
  it("each error is truncated to at most 200 characters", () => {
    fc.assert(
      fc.property(
        fc.array(failureEntryGen, { minLength: 1, maxLength: 200 }),
        fc.uuid(),
        (failures, jobId) => {
          const report = buildImportReport(
            jobId,
            {
              processed: failures.length,
              imported: 0,
              skipped: 0,
              failed: failures.length,
            },
            new Date(Date.now() - 60000).toISOString(),
            failures,
            failures.length,
          );

          for (const entry of report.failures) {
            expect(entry.error.length).toBeLessThanOrEqual(200);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 7.2, 7.5
   */
  it("truncated is true if and only if F > 100", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.uuid(),
        (totalFailures, jobId) => {
          const failures = Array.from({ length: totalFailures }, (_, i) => ({
            itemId: `item-${i}`,
            error: `error ${i}`,
          }));

          const report = buildImportReport(
            jobId,
            {
              processed: totalFailures,
              imported: 0,
              skipped: 0,
              failed: totalFailures,
            },
            new Date(Date.now() - 60000).toISOString(),
            failures,
            totalFailures,
          );

          expect(report.truncated).toBe(totalFailures > 100);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 7.2, 7.5
   */
  it("totalFailures always equals F", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.uuid(),
        (totalFailures, jobId) => {
          const failures = Array.from({ length: totalFailures }, (_, i) => ({
            itemId: `item-${i}`,
            error: `error ${i}`,
          }));

          const report = buildImportReport(
            jobId,
            {
              processed: totalFailures,
              imported: 0,
              skipped: 0,
              failed: totalFailures,
            },
            new Date(Date.now() - 60000).toISOString(),
            failures,
            totalFailures,
          );

          expect(report.totalFailures).toBe(totalFailures);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 7.2, 7.5
   */
  it("failures are in processing order (first 100 from the input)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.uuid(),
        (totalFailures, jobId) => {
          const failures = Array.from({ length: totalFailures }, (_, i) => ({
            itemId: `item-${i}`,
            error: `error-${i}`,
          }));

          const report = buildImportReport(
            jobId,
            {
              processed: totalFailures,
              imported: 0,
              skipped: 0,
              failed: totalFailures,
            },
            new Date(Date.now() - 60000).toISOString(),
            failures,
            totalFailures,
          );

          const expectedCount = Math.min(totalFailures, 100);
          for (let i = 0; i < expectedCount; i++) {
            expect(report.failures[i].itemId).toBe(`item-${i}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
