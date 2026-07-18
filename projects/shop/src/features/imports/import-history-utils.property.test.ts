import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  sortJobsByDate,
  normalizePageSize,
  isValidImportType,
  createPageStack,
} from "./import-history-utils";
import type { HistoryJobSummary } from "./imports-types";

// Feature: import-history, Property 1: Jobs sorted by date descending
describe("Feature: import-history, Property 1: Jobs sorted by date descending", () => {
  /**
   * For any array of HistoryJobSummary objects with valid ISO 8601
   * lastUpdatedAt timestamps, sortJobsByDate returns an array where each
   * element's lastUpdatedAt is >= the next element's lastUpdatedAt.
   *
   * Validates: Requirements 2.1, 5.2
   */

  // Generate a valid ISO timestamp within a reasonable range
  const isoDateArb = fc
    .integer({
      min: new Date("2020-01-01").getTime(),
      max: new Date("2030-12-31").getTime(),
    })
    .map((ts) => new Date(ts).toISOString());

  const historyJobSummaryArb = fc
    .record({
      jobId: fc.uuid(),
      state: fc.constantFrom(
        "running",
        "paused",
        "failed",
        "complete",
      ) as fc.Arbitrary<"running" | "paused" | "failed" | "complete">,
      phase: fc.constantFrom("fetch", "sync") as fc.Arbitrary<"fetch" | "sync">,
      startedAt: isoDateArb,
      lastUpdatedAt: isoDateArb,
      progress: fc.record({
        processed: fc.nat({ max: 10000 }),
        imported: fc.nat({ max: 10000 }),
        skipped: fc.nat({ max: 10000 }),
        failed: fc.nat({ max: 10000 }),
      }),
    })
    .map((r) => r as HistoryJobSummary);

  it("sorted result has each element's lastUpdatedAt >= the next element's lastUpdatedAt", () => {
    fc.assert(
      fc.property(
        fc.array(historyJobSummaryArb, { minLength: 0, maxLength: 50 }),
        (jobs) => {
          const sorted = sortJobsByDate(jobs);

          // Length is preserved
          expect(sorted).toHaveLength(jobs.length);

          // Each element's date >= next element's date (descending order)
          for (let i = 0; i < sorted.length - 1; i++) {
            const current = new Date(sorted[i].lastUpdatedAt).getTime();
            const next = new Date(sorted[i + 1].lastUpdatedAt).getTime();
            expect(current).toBeGreaterThanOrEqual(next);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does not mutate the original array", () => {
    fc.assert(
      fc.property(
        fc.array(historyJobSummaryArb, { minLength: 1, maxLength: 20 }),
        (jobs) => {
          const original = [...jobs];
          sortJobsByDate(jobs);
          expect(jobs).toEqual(original);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: import-history, Property 4: PageSize normalisation
describe("Feature: import-history, Property 4: PageSize normalisation", () => {
  /**
   * For any input that is not exactly 20, 50, or 100, normalizePageSize
   * returns 20. For any input that is exactly 20, 50, or 100, it returns
   * that value unchanged.
   *
   * Validates: Requirements 4.1, 5.8
   */

  it("returns 20 for any value that is not 20, 50, or 100", () => {
    const invalidArb = fc.oneof(
      fc.integer().filter((n) => n !== 20 && n !== 50 && n !== 100),
      fc.double().filter((n) => n !== 20 && n !== 50 && n !== 100),
      fc.string(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.array(fc.integer()),
      fc.object(),
    );

    fc.assert(
      fc.property(invalidArb, (value) => {
        expect(normalizePageSize(value)).toBe(20);
      }),
      { numRuns: 100 },
    );
  });

  it("returns the value unchanged when it is exactly 20, 50, or 100", () => {
    fc.assert(
      fc.property(fc.constantFrom(20, 50, 100), (value) => {
        expect(normalizePageSize(value)).toBe(value);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: import-history, Property 8: Invalid import type returns error
describe("Feature: import-history, Property 8: Invalid import type returns error", () => {
  /**
   * For any string that is not one of "items", "sales", or "accounts",
   * isValidImportType returns false.
   *
   * Validates: Requirements 5.7
   */

  it("returns false for any string that is not items, sales, or accounts", () => {
    const invalidTypeArb = fc
      .string()
      .filter((s) => s !== "items" && s !== "sales" && s !== "accounts");

    fc.assert(
      fc.property(invalidTypeArb, (type) => {
        expect(isValidImportType(type)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("returns true for valid import types", () => {
    fc.assert(
      fc.property(fc.constantFrom("items", "sales", "accounts"), (type) => {
        expect(isValidImportType(type)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: import-history, Property 10: Page stack navigation integrity
describe("Feature: import-history, Property 10: Page stack navigation integrity", () => {
  /**
   * For any sequence of push operations, pop returns cursors in reverse
   * order (LIFO), and the stack size never goes negative.
   *
   * Validates: Requirements 4.6
   */

  it("pop returns cursors in reverse order of push (LIFO)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
          minLength: 1,
          maxLength: 30,
        }),
        (cursors) => {
          const stack = createPageStack();

          // Push all cursors
          for (const cursor of cursors) {
            stack.push(cursor);
          }

          expect(stack.size()).toBe(cursors.length);

          // Pop all and verify LIFO order
          const popped: string[] = [];
          while (stack.size() > 0) {
            const val = stack.pop();
            expect(val).toBeDefined();
            popped.push(val!);
          }

          // Popped order should be reverse of pushed order
          expect(popped).toEqual([...cursors].reverse());
        },
      ),
      { numRuns: 100 },
    );
  });

  it("stack size never goes negative after any sequence of push/pop operations", () => {
    const operationArb = fc.oneof(
      fc.record({
        type: fc.constant("push" as const),
        value: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      fc.record({
        type: fc.constant("pop" as const),
        value: fc.constant(""),
      }),
    );

    fc.assert(
      fc.property(
        fc.array(operationArb, { minLength: 1, maxLength: 50 }),
        (operations) => {
          const stack = createPageStack();

          for (const op of operations) {
            if (op.type === "push") {
              stack.push(op.value);
            } else {
              stack.pop();
            }

            // Size must never be negative
            expect(stack.size()).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("peek returns the most recently pushed item without removing it", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (cursors) => {
          const stack = createPageStack();

          for (const cursor of cursors) {
            stack.push(cursor);
          }

          const peeked = stack.peek();
          expect(peeked).toBe(cursors[cursors.length - 1]);
          // Peek does not change size
          expect(stack.size()).toBe(cursors.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
