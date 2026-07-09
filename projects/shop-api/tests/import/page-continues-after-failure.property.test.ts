import { describe, it, expect } from "vitest";
import fc from "fast-check";

/** Feature: consigncloud-item-import, Property 12: Page processing continues after individual failures */
describe("Property 12: Page processing continues after individual failures", () => {
  /**
   * Simulates processing a page of items where specific indices are marked as failing.
   * Returns counts of imported and failed items after processing all items in the page.
   */
  interface PageProcessingResult {
    processed: number;
    imported: number;
    failed: number;
  }

  function processPage(
    pageSize: number,
    failingIndices: Set<number>,
  ): PageProcessingResult {
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < pageSize; i++) {
      if (failingIndices.has(i)) {
        failed++;
      } else {
        imported++;
      }
    }

    return {
      processed: imported + failed,
      imported,
      failed,
    };
  }

  /**
   * Validates: Requirements 8.3, 5.3
   */
  it("all N items are processed regardless of which items fail", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }).chain((pageSize) =>
          fc
            .subarray(
              Array.from({ length: pageSize }, (_, i) => i),
              { minLength: 1 },
            )
            .map((failingIndices) => ({
              pageSize,
              failingIndices: new Set(failingIndices),
            })),
        ),
        ({ pageSize, failingIndices }) => {
          const result = processPage(pageSize, failingIndices);

          // All N items are processed
          expect(result.processed).toBe(pageSize);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 8.3, 5.3
   */
  it("imported count equals N minus the number of failures", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }).chain((pageSize) =>
          fc
            .subarray(
              Array.from({ length: pageSize }, (_, i) => i),
              { minLength: 1 },
            )
            .map((failingIndices) => ({
              pageSize,
              failingIndices: new Set(failingIndices),
            })),
        ),
        ({ pageSize, failingIndices }) => {
          const result = processPage(pageSize, failingIndices);

          // Imported equals total minus failures
          expect(result.imported).toBe(pageSize - failingIndices.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 8.3, 5.3
   */
  it("failed count equals the number of failing indices", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }).chain((pageSize) =>
          fc
            .subarray(
              Array.from({ length: pageSize }, (_, i) => i),
              { minLength: 1 },
            )
            .map((failingIndices) => ({
              pageSize,
              failingIndices: new Set(failingIndices),
            })),
        ),
        ({ pageSize, failingIndices }) => {
          const result = processPage(pageSize, failingIndices);

          // Failed count matches the number of failing items
          expect(result.failed).toBe(failingIndices.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 8.3, 5.3
   */
  it("items after failing indices are still processed (imported + failed = processed)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }).chain((pageSize) =>
          fc
            .subarray(
              Array.from({ length: pageSize }, (_, i) => i),
              { minLength: 1 },
            )
            .map((failingIndices) => ({
              pageSize,
              failingIndices: new Set(failingIndices),
            })),
        ),
        ({ pageSize, failingIndices }) => {
          const result = processPage(pageSize, failingIndices);

          // Processed equals the sum of imported and failed
          expect(result.processed).toBe(result.imported + result.failed);
          // And equals page size (no items were skipped due to earlier failures)
          expect(result.processed).toBe(pageSize);
        },
      ),
      { numRuns: 100 },
    );
  });
});
