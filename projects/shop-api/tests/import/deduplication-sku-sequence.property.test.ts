import { describe, it, expect } from "vitest";
import fc from "fast-check";

/** Feature: consigncloud-item-import, Property 4: Deduplication prevents duplicates and preserves SKU sequence */
describe("Property 4: Deduplication prevents duplicates and preserves SKU sequence", () => {
  /**
   * Simulates page processing with deduplication logic.
   * Given a page of items and a set of existing sourceIds,
   * items whose ID is already in the existing set are skipped (duplicates),
   * while new items consume a SKU from the sequence counter.
   */
  interface PageProcessingResult {
    newRecordsCreated: number;
    duplicatesSkipped: number;
    skuCounterDelta: number;
    finalSkuCounter: number;
  }

  function processPageWithDeduplication(
    pageItemIds: string[],
    existingSourceIds: Set<string>,
    initialSkuCounter: number,
  ): PageProcessingResult {
    let skuCounter = initialSkuCounter;
    let newRecordsCreated = 0;
    let duplicatesSkipped = 0;

    for (const itemId of pageItemIds) {
      if (existingSourceIds.has(itemId)) {
        // Duplicate: skip without consuming SKU
        duplicatesSkipped++;
      } else {
        // New item: consume a SKU and create record
        skuCounter++;
        newRecordsCreated++;
      }
    }

    return {
      newRecordsCreated,
      duplicatesSkipped,
      skuCounterDelta: skuCounter - initialSkuCounter,
      finalSkuCounter: skuCounter,
    };
  }

  /** Generator for a page of item UUIDs with a controlled subset marked as existing */
  const pageWithDuplicatesGen = fc
    .array(fc.uuid(), { minLength: 1, maxLength: 50 })
    .chain((allIds) => {
      // Generate a subset of indices to mark as "already existing"
      const indicesGen = fc.subarray(
        allIds.map((_, i) => i),
        { minLength: 0, maxLength: allIds.length },
      );

      return indicesGen.map((existingIndices) => {
        const existingSourceIds = new Set(
          existingIndices.map((i) => allIds[i]),
        );
        return { pageItemIds: allIds, existingSourceIds };
      });
    });

  /** Generator for the initial SKU counter value */
  const initialSkuCounterGen = fc.integer({ min: 0, max: 100_000 });

  /**
   * Validates: Requirements 5.7, 8.1, 8.2, 8.5
   */
  it("SKU counter advances by exactly the count of newly imported items (total - duplicates)", () => {
    fc.assert(
      fc.property(
        pageWithDuplicatesGen,
        initialSkuCounterGen,
        ({ pageItemIds, existingSourceIds }, initialCounter) => {
          const result = processPageWithDeduplication(
            pageItemIds,
            existingSourceIds,
            initialCounter,
          );

          const expectedNewItems = pageItemIds.filter(
            (id) => !existingSourceIds.has(id),
          ).length;

          expect(result.skuCounterDelta).toBe(expectedNewItems);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.7, 8.1, 8.2, 8.5
   */
  it("number of created records equals total items minus duplicates", () => {
    fc.assert(
      fc.property(
        pageWithDuplicatesGen,
        initialSkuCounterGen,
        ({ pageItemIds, existingSourceIds }, initialCounter) => {
          const result = processPageWithDeduplication(
            pageItemIds,
            existingSourceIds,
            initialCounter,
          );

          const expectedDuplicates = pageItemIds.filter((id) =>
            existingSourceIds.has(id),
          ).length;
          const expectedNew = pageItemIds.length - expectedDuplicates;

          expect(result.newRecordsCreated).toBe(expectedNew);
          expect(result.duplicatesSkipped).toBe(expectedDuplicates);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.7, 8.1, 8.2, 8.5
   */
  it("duplicates do not consume SKU sequence numbers", () => {
    fc.assert(
      fc.property(
        pageWithDuplicatesGen,
        initialSkuCounterGen,
        ({ pageItemIds, existingSourceIds }, initialCounter) => {
          const result = processPageWithDeduplication(
            pageItemIds,
            existingSourceIds,
            initialCounter,
          );

          // The final SKU counter should equal initial + newRecordsCreated
          // (not initial + total items)
          expect(result.finalSkuCounter).toBe(
            initialCounter + result.newRecordsCreated,
          );

          // Specifically: if all items are duplicates, counter doesn't move
          if (result.duplicatesSkipped === pageItemIds.length) {
            expect(result.finalSkuCounter).toBe(initialCounter);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.7, 8.1, 8.2, 8.5
   */
  it("newRecordsCreated + duplicatesSkipped always equals total page items", () => {
    fc.assert(
      fc.property(
        pageWithDuplicatesGen,
        initialSkuCounterGen,
        ({ pageItemIds, existingSourceIds }, initialCounter) => {
          const result = processPageWithDeduplication(
            pageItemIds,
            existingSourceIds,
            initialCounter,
          );

          expect(result.newRecordsCreated + result.duplicatesSkipped).toBe(
            pageItemIds.length,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.7, 8.1, 8.2, 8.5
   */
  it("processing a page with no duplicates advances counter by total item count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 50 }),
        initialSkuCounterGen,
        (pageItemIds, initialCounter) => {
          // No existing sourceIds — all items are new
          const existingSourceIds = new Set<string>();

          const result = processPageWithDeduplication(
            pageItemIds,
            existingSourceIds,
            initialCounter,
          );

          expect(result.skuCounterDelta).toBe(pageItemIds.length);
          expect(result.newRecordsCreated).toBe(pageItemIds.length);
          expect(result.duplicatesSkipped).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.7, 8.1, 8.2, 8.5
   */
  it("processing a page where all items are duplicates does not advance counter", () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 50 }),
        initialSkuCounterGen,
        (pageItemIds, initialCounter) => {
          // All items already exist
          const existingSourceIds = new Set(pageItemIds);

          const result = processPageWithDeduplication(
            pageItemIds,
            existingSourceIds,
            initialCounter,
          );

          expect(result.skuCounterDelta).toBe(0);
          expect(result.newRecordsCreated).toBe(0);
          expect(result.duplicatesSkipped).toBe(pageItemIds.length);
          expect(result.finalSkuCounter).toBe(initialCounter);
        },
      ),
      { numRuns: 100 },
    );
  });
});
