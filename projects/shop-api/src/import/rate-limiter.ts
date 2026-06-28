export interface RateLimiter {
  acquire(): Promise<void>;
}

export interface RateLimiterConfig {
  capacity: number;
  drainRate: number;
}

export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  let availableTokens: number = config.capacity;
  let lastRefillTimestamp: number = Date.now();

  function refillTokens(): void {
    const now: number = Date.now();
    const elapsedSeconds: number = (now - lastRefillTimestamp) / 1000;
    const tokensToAdd: number = elapsedSeconds * config.drainRate;

    if (tokensToAdd > 0) {
      availableTokens = Math.min(
        config.capacity,
        availableTokens + tokensToAdd,
      );
      lastRefillTimestamp = now;
    }
  }

  function acquire(): Promise<void> {
    refillTokens();

    if (availableTokens >= 1) {
      availableTokens -= 1;
      return Promise.resolve();
    }

    const waitTimeMs: number = (1 / config.drainRate) * 1000;

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        refillTokens();
        availableTokens -= 1;
        resolve();
      }, waitTimeMs);
    });
  }

  return { acquire };
}
