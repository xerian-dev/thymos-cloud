import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { encodeCursor, decodeCursor } from "../src/cursor-utils";

/**
 * Feature: item-creation, Property 10: Pagination cursor correctness
 *
 * Validates: Requirements 6.3, 6.4
 */

interface SimulatedItem {
  sku: number;
  uuid: string;
  GSI1PK: string;
  GSI1SK: string;
  PK: string;
  SK: string;
}

/**
 * Simulates the DynamoDB GSI1 query pagination logic used by list-items.
 * Given a sorted array of items, a page size, and an optional start key (cursor),
 * returns the page of items and the next cursor (or null if no more pages).
 */
function simulatePagination(
  sortedItems: SimulatedItem[],
  pageSize: number,
  exclusiveStartKey?: Record<string, unknown>,
): { page: SimulatedItem[]; nextCursor: string | null } {
  let startIndex = 0;

  if (exclusiveStartKey) {
    // Find the item matching the exclusive start key's GSI1SK and skip past it
    const startGsi1sk = exclusiveStartKey["GSI1SK"] as string;
    const idx = sortedItems.findIndex((item) => item.GSI1SK === startGsi1sk);
    if (idx >= 0) {
      startIndex = idx + 1;
    }
  }

  const page = sortedItems.slice(startIndex, startIndex + pageSize);

  const hasMore = startIndex + pageSize < sortedItems.length;
  const nextCursor = hasMore
    ? encodeCursor({
        GSI1PK: "ITEMS",
        GSI1SK: page[page.length - 1].GSI1SK,
        PK: page[page.length - 1].PK,
        SK: page[page.length - 1].SK,
      })
    : null;

  return { page, nextCursor };
}

/**
 * Paginates through all items collecting every page.
 */
function collectAllPages(
  sortedItems: SimulatedItem[],
  pageSize: number,
): SimulatedItem[][] {
  const pages: SimulatedItem[][] = [];
  let cursor: string | null = null;
  let isFirstPage = true;

  // Safety limit to prevent infinite loops
  const maxIterations = Math.ceil(sortedItems.length / pageSize) + 1;
  let iterations = 0;

  while (iterations < maxIterations) {
    const exclusiveStartKey = cursor ? decodeCursor(cursor) : undefined;
    const { page, nextCursor } = simulatePagination(
      sortedItems,
      pageSize,
      exclusiveStartKey,
    );

    if (page.length === 0 && !isFirstPage) {
      break;
    }

    pages.push(page);
    cursor = nextCursor;
    isFirstPage = false;
    iterations++;

    if (nextCursor === null) {
      break;
    }
  }

  return pages;
}

describe("Property 10: Pagination cursor correctness", () => {
  const PAD_LENGTH = 7;

  /** Generates a unique set of SKUs and builds sorted simulated items */
  const sortedItemsArb = fc
    .uniqueArray(fc.integer({ min: 1, max: 9999999 }), {
      minLength: 1,
      maxLength: 200,
    })
    .map((skus) =>
      skus
        .sort((a, b) => a - b)
        .map((sku) => ({
          sku,
          uuid: `uuid-${sku}`,
          GSI1PK: "ITEMS",
          GSI1SK: `ITEM#${String(sku).padStart(PAD_LENGTH, "0")}`,
          PK: `ITEM#uuid-${sku}`,
          SK: "METADATA",
        })),
    );

  const pageSizeArb = fc.constantFrom(20, 50, 100);

  it("consecutive pages cover all items without gaps or duplicates", () => {
    fc.assert(
      fc.property(sortedItemsArb, pageSizeArb, (sortedItems, pageSize) => {
        const pages = collectAllPages(sortedItems, pageSize);

        // Flatten all pages into a single array
        const allCollected = pages.flat();

        // Total items collected must equal original count (no gaps, no duplicates)
        expect(allCollected.length).toBe(sortedItems.length);

        // Items must appear in the exact original order
        for (let i = 0; i < sortedItems.length; i++) {
          expect(allCollected[i].sku).toBe(sortedItems[i].sku);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("each page's first item SKU is greater than previous page's last item SKU", () => {
    fc.assert(
      fc.property(sortedItemsArb, pageSizeArb, (sortedItems, pageSize) => {
        const pages = collectAllPages(sortedItems, pageSize);

        for (let i = 1; i < pages.length; i++) {
          const prevPage = pages[i - 1];
          const currPage = pages[i];

          if (prevPage.length > 0 && currPage.length > 0) {
            const prevLastSku = prevPage[prevPage.length - 1].sku;
            const currFirstSku = currPage[0].sku;
            expect(currFirstSku).toBeGreaterThan(prevLastSku);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("each page has at most pageSize items", () => {
    fc.assert(
      fc.property(sortedItemsArb, pageSizeArb, (sortedItems, pageSize) => {
        const pages = collectAllPages(sortedItems, pageSize);

        for (const page of pages) {
          expect(page.length).toBeLessThanOrEqual(pageSize);
        }
      }),
      { numRuns: 100 },
    );
  });
});
