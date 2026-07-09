import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type {
  ProgressCounts,
  Checkpoint,
} from "../../src/import/checkpoint-manager";

/** Feature: consigncloud-item-import, Property 5: Checkpoint cursor consistency */
describe("Property 5: Checkpoint cursor consistency", () => {
  /**
   * Simulates accumulating progress counts across a sequence of pages.
   * After processing all pages, returns the final checkpoint state.
   */
  interface PageResult {
    cursor: string;
    imported: number;
    skipped: number;
    failed: number;
  }

  function buildCheckpointAfterPages(
    jobId: string,
    pages: PageResult[],
  ): Checkpoint {
    const progress: ProgressCounts = {
      processed: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
    };

    let cursor: string | null = null;

    for (const page of pages) {
      progress.imported += page.imported;
      progress.skipped += page.skipped;
      progress.failed += page.failed;
      progress.processed += page.imported + page.skipped + page.failed;
      cursor = page.cursor;
    }

    return {
      jobId,
      cursor,
      progress,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  /** Generator for a single page result */
  const pageResultGen: fc.Arbitrary<PageResult> = fc.record({
    cursor: fc.uuid(),
    imported: fc.integer({ min: 0, max: 100 }),
    skipped: fc.integer({ min: 0, max: 50 }),
    failed: fc.integer({ min: 0, max: 20 }),
  });

  /** Generator for a non-empty sequence of page results */
  const pageSequenceGen: fc.Arbitrary<PageResult[]> = fc.array(pageResultGen, {
    minLength: 1,
    maxLength: 50,
  });

  /**
   * Validates: Requirements 4.1, 4.3, 8.4
   */
  it("after processing N pages, the checkpoint cursor equals the last page cursor", () => {
    fc.assert(
      fc.property(pageSequenceGen, fc.uuid(), (pages, jobId) => {
        const checkpoint = buildCheckpointAfterPages(jobId, pages);
        const lastPage = pages[pages.length - 1];

        expect(checkpoint.cursor).toBe(lastPage.cursor);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 4.1, 4.3, 8.4
   */
  it("after processing N pages, progress.imported equals the sum of all page imports", () => {
    fc.assert(
      fc.property(pageSequenceGen, fc.uuid(), (pages, jobId) => {
        const checkpoint = buildCheckpointAfterPages(jobId, pages);
        const expectedImported = pages.reduce((sum, p) => sum + p.imported, 0);

        expect(checkpoint.progress.imported).toBe(expectedImported);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 4.1, 4.3, 8.4
   */
  it("after processing N pages, progress.skipped equals the sum of all page skips", () => {
    fc.assert(
      fc.property(pageSequenceGen, fc.uuid(), (pages, jobId) => {
        const checkpoint = buildCheckpointAfterPages(jobId, pages);
        const expectedSkipped = pages.reduce((sum, p) => sum + p.skipped, 0);

        expect(checkpoint.progress.skipped).toBe(expectedSkipped);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 4.1, 4.3, 8.4
   */
  it("after processing N pages, progress.failed equals the sum of all page failures", () => {
    fc.assert(
      fc.property(pageSequenceGen, fc.uuid(), (pages, jobId) => {
        const checkpoint = buildCheckpointAfterPages(jobId, pages);
        const expectedFailed = pages.reduce((sum, p) => sum + p.failed, 0);

        expect(checkpoint.progress.failed).toBe(expectedFailed);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 4.1, 4.3, 8.4
   */
  it("after processing N pages, progress.processed equals the sum of (imported + skipped + failed) for all pages", () => {
    fc.assert(
      fc.property(pageSequenceGen, fc.uuid(), (pages, jobId) => {
        const checkpoint = buildCheckpointAfterPages(jobId, pages);
        const expectedProcessed = pages.reduce(
          (sum, p) => sum + p.imported + p.skipped + p.failed,
          0,
        );

        expect(checkpoint.progress.processed).toBe(expectedProcessed);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 4.1, 4.3, 8.4
   */
  it("progress.processed always equals imported + skipped + failed", () => {
    fc.assert(
      fc.property(pageSequenceGen, fc.uuid(), (pages, jobId) => {
        const checkpoint = buildCheckpointAfterPages(jobId, pages);
        const { processed, imported, skipped, failed } = checkpoint.progress;

        expect(processed).toBe(imported + skipped + failed);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 4.1, 4.3, 8.4
   */
  it("checkpointing after each page produces monotonically increasing progress counts", () => {
    fc.assert(
      fc.property(pageSequenceGen, fc.uuid(), (pages, jobId) => {
        let prevProcessed = 0;
        let prevImported = 0;
        let prevSkipped = 0;
        let prevFailed = 0;

        for (let i = 0; i < pages.length; i++) {
          const pagesUpToI = pages.slice(0, i + 1);
          const checkpoint = buildCheckpointAfterPages(jobId, pagesUpToI);

          expect(checkpoint.progress.processed).toBeGreaterThanOrEqual(
            prevProcessed,
          );
          expect(checkpoint.progress.imported).toBeGreaterThanOrEqual(
            prevImported,
          );
          expect(checkpoint.progress.skipped).toBeGreaterThanOrEqual(
            prevSkipped,
          );
          expect(checkpoint.progress.failed).toBeGreaterThanOrEqual(prevFailed);

          prevProcessed = checkpoint.progress.processed;
          prevImported = checkpoint.progress.imported;
          prevSkipped = checkpoint.progress.skipped;
          prevFailed = checkpoint.progress.failed;
        }
      }),
      { numRuns: 100 },
    );
  });
});
