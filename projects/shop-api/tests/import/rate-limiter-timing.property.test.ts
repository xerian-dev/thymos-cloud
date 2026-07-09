import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { createRateLimiter } from "../../src/import/rate-limiter";

/** Feature: consigncloud-item-import, Property 8: Rate limiter respects capacity and drain rate */
describe("Property 8: Rate limiter respects capacity and drain rate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Validates: Requirements 3.1
   *
   * For any sequence of N requests through a rate limiter with capacity C=100
   * and drain rate R=10, the elapsed time is at least max(0, (N - C) / R) seconds.
   */
  it("elapsed time is at least max(0, (N - C) / R) seconds for N requests", async () => {
    const capacity = 100;
    const drainRate = 10;

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 200 }),
        async (numRequests) => {
          vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

          const limiter = createRateLimiter({ capacity, drainRate });
          const startTime = Date.now();

          for (let i = 0; i < numRequests; i++) {
            const promise = limiter.acquire();

            let resolved = false;
            promise.then(() => {
              resolved = true;
            });

            // Flush microtasks to check if it resolved immediately
            await Promise.resolve();
            await Promise.resolve();

            if (!resolved) {
              // Advance time to allow the token to become available
              vi.advanceTimersByTime(1000 / drainRate);
              await promise;
            }
          }

          const elapsedMs = Date.now() - startTime;
          const elapsedSeconds = elapsedMs / 1000;
          const expectedMinSeconds = Math.max(
            0,
            (numRequests - capacity) / drainRate,
          );

          expect(elapsedSeconds).toBeGreaterThanOrEqual(expectedMinSeconds);
        },
      ),
      { numRuns: 100 },
    );
  });
});
