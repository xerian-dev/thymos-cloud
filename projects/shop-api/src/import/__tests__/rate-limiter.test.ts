import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRateLimiter } from "../rate-limiter";

describe("rate-limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should resolve immediately when tokens are available", async () => {
    const limiter = createRateLimiter({ capacity: 5, drainRate: 1 });

    for (let i = 0; i < 5; i++) {
      const promise = limiter.acquire();
      await expect(promise).resolves.toBeUndefined();
    }
  });

  it("should block when tokens are exhausted", async () => {
    const limiter = createRateLimiter({ capacity: 2, drainRate: 1 });

    // Exhaust all tokens
    await limiter.acquire();
    await limiter.acquire();

    // Next acquire should not resolve immediately
    let resolved = false;
    const pending = limiter.acquire().then(() => {
      resolved = true;
    });

    // Flush microtasks without advancing time
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    // Advance time to allow token replenishment (1 token per second at drainRate=1)
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(resolved).toBe(true);
  });

  it("should replenish tokens over time", async () => {
    const limiter = createRateLimiter({ capacity: 2, drainRate: 2 });

    // Exhaust all tokens
    await limiter.acquire();
    await limiter.acquire();

    // Advance time by 1 second — at drainRate=2, this should refill 2 tokens
    await vi.advanceTimersByTimeAsync(1000);

    // Should resolve immediately since tokens have been replenished
    const promise = limiter.acquire();
    await expect(promise).resolves.toBeUndefined();
  });
});
