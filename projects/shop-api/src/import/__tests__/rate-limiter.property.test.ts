import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { createRateLimiter } from "../rate-limiter";

/**
 * Feature: consigncloud-import, Property 2: Rate limiter respects capacity and drain rate
 * Validates: Requirements 1.5
 */
describe("Property 2: Rate limiter respects capacity and drain rate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("burst never exceeds capacity (100)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 200 }), async (numCalls) => {
        vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

        const capacity = 100;
        const drainRate = 10;
        const limiter = createRateLimiter({ capacity, drainRate });

        let immediateCount = 0;
        let delayedCount = 0;

        for (let i = 0; i < numCalls; i++) {
          const promise = limiter.acquire();
          // If the promise resolves immediately, it's a burst call
          let resolved = false;
          promise.then(() => {
            resolved = true;
          });

          // Flush microtasks only (no timer advancement)
          await Promise.resolve();
          await Promise.resolve();

          if (resolved) {
            immediateCount++;
          } else {
            delayedCount++;
            // Advance time to allow this call to complete
            vi.advanceTimersByTime(1000 / drainRate);
            await promise;
          }
        }

        // The burst (immediate) calls should never exceed capacity
        expect(immediateCount).toBeLessThanOrEqual(capacity);

        // If we requested more than capacity, some must be delayed
        if (numCalls > capacity) {
          expect(delayedCount).toBe(numCalls - capacity);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("sustained throughput does not exceed drain rate (10/sec)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 101, max: 200 }), async (numCalls) => {
        vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

        const capacity = 100;
        const drainRate = 10;
        const limiter = createRateLimiter({ capacity, drainRate });

        const completionTimes: number[] = [];

        for (let i = 0; i < numCalls; i++) {
          const promise = limiter.acquire();
          let resolved = false;
          promise.then(() => {
            resolved = true;
          });

          await Promise.resolve();
          await Promise.resolve();

          if (!resolved) {
            vi.advanceTimersByTime(1000 / drainRate);
            await promise;
          }

          completionTimes.push(Date.now());
        }

        // Check that after the initial burst, no 1-second window
        // has more than drainRate completions (beyond the burst)
        // We check windows starting after the burst is exhausted
        const burstEnd = completionTimes[capacity - 1];

        // For calls after burst, check throughput in each 1-second window
        const postBurstTimes = completionTimes.filter((t) => t > burstEnd);

        if (postBurstTimes.length > 0) {
          const windowStart = postBurstTimes[0];
          const windowEnd = postBurstTimes[postBurstTimes.length - 1];
          const totalDuration = (windowEnd - windowStart) / 1000;

          if (totalDuration > 0) {
            // Check sliding windows of 1 second
            for (
              let winStart = windowStart;
              winStart <= windowEnd;
              winStart += 100
            ) {
              const winEnd = winStart + 1000;
              const callsInWindow = postBurstTimes.filter(
                (t) => t >= winStart && t < winEnd,
              ).length;
              // Allow drainRate + 1 for boundary effects with token refill
              expect(callsInWindow).toBeLessThanOrEqual(drainRate + 1);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
