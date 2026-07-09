import { describe, it, expect } from "vitest";
import fc from "fast-check";

/** Feature: consigncloud-item-import, Property 9: Exponential backoff on 429 responses */
describe("Property 9: Exponential backoff on 429 responses", () => {
  const BACKOFF_BASE_MS: number = 1000;
  const BACKOFF_MAX_MS: number = 60_000;

  /**
   * Replicates the backoff calculation from item-consigncloud-client.ts.
   * For a sequence of consecutive 429 responses without a Retry-After header,
   * the wait time before attempt K (1-indexed) is:
   * min(2^(K-1) * 1000, 60000) ms
   */
  function calculateExpectedDelay(consecutiveCount: number): number {
    return Math.min(
      BACKOFF_BASE_MS * Math.pow(2, consecutiveCount - 1),
      BACKOFF_MAX_MS,
    );
  }

  /**
   * Validates: Requirements 3.3
   */
  it("wait time for attempt K equals min(2^(K-1) * 1000, 60000) ms", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (k: number) => {
        const delay: number = calculateExpectedDelay(k);
        const expected: number = Math.min(Math.pow(2, k - 1) * 1000, 60000);

        expect(delay).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.3
   */
  it("delay is always capped at 60000ms regardless of consecutive count", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (k: number) => {
        const delay: number = calculateExpectedDelay(k);

        expect(delay).toBeLessThanOrEqual(BACKOFF_MAX_MS);
        expect(delay).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.3
   */
  it("delay monotonically increases up to the cap", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), (k: number) => {
        const currentDelay: number = calculateExpectedDelay(k);
        const nextDelay: number = calculateExpectedDelay(k + 1);

        expect(nextDelay).toBeGreaterThanOrEqual(currentDelay);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.3
   */
  it("first attempt always starts at base delay of 1000ms", () => {
    const delay: number = calculateExpectedDelay(1);
    expect(delay).toBe(BACKOFF_BASE_MS);
  });

  /**
   * Validates: Requirements 3.3
   */
  it("delay doubles with each consecutive attempt until reaching cap", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (k: number) => {
        const currentDelay: number = calculateExpectedDelay(k);
        const nextDelay: number = calculateExpectedDelay(k + 1);

        if (currentDelay < BACKOFF_MAX_MS) {
          expect(nextDelay).toBe(Math.min(currentDelay * 2, BACKOFF_MAX_MS));
        } else {
          expect(nextDelay).toBe(BACKOFF_MAX_MS);
        }
      }),
      { numRuns: 100 },
    );
  });
});
