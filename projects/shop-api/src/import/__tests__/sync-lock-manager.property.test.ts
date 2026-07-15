import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

/**
 * Feature: scheduled-consigncloud-sync, Property 1: Lock acquisition prevents concurrent execution
 * Feature: scheduled-consigncloud-sync, Property 2: Stale lock detection uses correct threshold
 * Validates: Requirements 3.1, 3.3, 3.4, 3.5
 */

const mockSend = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.IMPORT_TABLE_NAME = "test-import-table";
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class ConditionalCheckFailedException extends Error {
    override name = "ConditionalCheckFailedException";
    constructor(opts?: { message?: string; $metadata?: unknown }) {
      super(opts?.message ?? "ConditionalCheckFailedException");
    }
  }
  return {
    DynamoDBClient: class {
      send = mockSend;
    },
    ConditionalCheckFailedException,
  };
});

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
  PutCommand: class {
    constructor(public input: unknown) {}
  },
  GetCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { acquireLock } from "../sync-lock-manager";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

describe("Property 1: Lock acquisition prevents concurrent execution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    mockSend.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("for any two concurrent lock attempts, at most one acquires the lock", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (correlationIdA, correlationIdB) => {
          // Ensure distinct correlation IDs
          fc.pre(correlationIdA !== correlationIdB);

          mockSend.mockReset();

          // Simulate: first caller wins the PutItem, second gets ConditionalCheckFailedException
          let lockAcquiredCount = 0;
          let firstCallerWon = false;

          // First call succeeds (lock acquired), second gets conditional check failure
          mockSend.mockImplementation(() => {
            if (!firstCallerWon) {
              firstCallerWon = true;
              lockAcquiredCount++;
              return Promise.resolve({});
            }
            // Second caller: PutItem fails, then GetItem returns existing lock
            const error = new ConditionalCheckFailedException({
              message: "The conditional request failed",
              $metadata: {},
            });
            return Promise.reject(error);
          });

          // First attempt acquires
          const resultA = await acquireLock(correlationIdA);

          // Reset mock for second caller scenario - PutItem fails, GetItem returns fresh lock
          mockSend.mockReset();
          const error = new ConditionalCheckFailedException({
            message: "The conditional request failed",
            $metadata: {},
          });
          mockSend
            .mockRejectedValueOnce(error) // PutItem fails
            .mockResolvedValueOnce({
              // GetItem returns existing lock (fresh, held by A)
              Item: {
                lockedAt: new Date().toISOString(),
                correlationId: correlationIdA,
                ttl: Math.floor(Date.now() / 1000) + 3600,
              },
            });

          const resultB = await acquireLock(correlationIdB);

          // At most one acquired
          const acquiredCount =
            (resultA.acquired ? 1 : 0) + (resultB.acquired ? 1 : 0);
          expect(acquiredCount).toBeLessThanOrEqual(1);

          // The first one acquired
          expect(resultA.acquired).toBe(true);

          // The second one did NOT acquire
          expect(resultB.acquired).toBe(false);
          if (!resultB.acquired) {
            expect(resultB.stale).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("when the lock is fresh, the second caller gets acquired=false and stale=false", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        // Lock age between 0 and 59 minutes (fresh)
        fc.integer({ min: 0, max: 59 }),
        async (correlationIdA, correlationIdB, lockAgeMinutes) => {
          fc.pre(correlationIdA !== correlationIdB);
          mockSend.mockReset();

          const now = new Date("2025-01-15T12:00:00.000Z");
          vi.setSystemTime(now);

          const lockedAt = new Date(
            now.getTime() - lockAgeMinutes * 60 * 1000,
          ).toISOString();

          // PutItem fails (lock exists), GetItem returns existing lock
          const error = new ConditionalCheckFailedException({
            message: "The conditional request failed",
            $metadata: {},
          });
          mockSend.mockRejectedValueOnce(error).mockResolvedValueOnce({
            Item: {
              lockedAt,
              correlationId: correlationIdA,
              ttl: Math.floor(new Date(lockedAt).getTime() / 1000) + 3600,
            },
          });

          const result = await acquireLock(correlationIdB);

          expect(result.acquired).toBe(false);
          if (!result.acquired) {
            expect(result.stale).toBe(false);
            expect(result.existingLock.correlationId).toBe(correlationIdA);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 2: Stale lock detection uses correct threshold", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSend.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lock is stale if and only if age exceeds 60 minutes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        // Lock age in minutes from 0 to 120
        fc.integer({ min: 0, max: 120 }),
        async (correlationId, lockAgeMinutes) => {
          mockSend.mockReset();

          const now = new Date("2025-01-15T12:00:00.000Z");
          vi.setSystemTime(now);

          const lockedAt = new Date(
            now.getTime() - lockAgeMinutes * 60 * 1000,
          ).toISOString();

          // Simulate: PutItem fails with ConditionalCheckFailedException,
          // then GetItem returns the existing lock record
          const error = new ConditionalCheckFailedException({
            message: "The conditional request failed",
            $metadata: {},
          });
          mockSend.mockRejectedValueOnce(error).mockResolvedValueOnce({
            Item: {
              lockedAt,
              correlationId: "existing-owner",
              ttl: Math.floor(new Date(lockedAt).getTime() / 1000) + 3600,
            },
          });

          const result = await acquireLock(correlationId);

          expect(result.acquired).toBe(false);
          if (!result.acquired) {
            // The stale threshold is STRICTLY greater than 60 minutes
            // lockedAt > 60 minutes ago => stale = true
            // lockedAt <= 60 minutes ago => stale = false
            const expectedStale = lockAgeMinutes > 60;
            expect(result.stale).toBe(expectedStale);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("lock exactly 60 minutes old is classified as fresh (not stale)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (correlationId) => {
        mockSend.mockReset();

        const now = new Date("2025-01-15T12:00:00.000Z");
        vi.setSystemTime(now);

        // Exactly 60 minutes old
        const lockedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

        const error = new ConditionalCheckFailedException({
          message: "The conditional request failed",
          $metadata: {},
        });
        mockSend.mockRejectedValueOnce(error).mockResolvedValueOnce({
          Item: {
            lockedAt,
            correlationId: "existing-owner",
            ttl: Math.floor(new Date(lockedAt).getTime() / 1000) + 3600,
          },
        });

        const result = await acquireLock(correlationId);

        expect(result.acquired).toBe(false);
        if (!result.acquired) {
          // Exactly 60 minutes = NOT stale (threshold is strictly greater than)
          expect(result.stale).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("lock 60 minutes + 1 millisecond old is classified as stale", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        // Additional milliseconds beyond 60 minutes (1 to 60000ms = up to 1 more minute)
        fc.integer({ min: 1, max: 60000 }),
        async (correlationId, extraMs) => {
          mockSend.mockReset();

          const now = new Date("2025-01-15T12:00:00.000Z");
          vi.setSystemTime(now);

          // 60 minutes + some extra milliseconds
          const lockedAt = new Date(
            now.getTime() - (60 * 60 * 1000 + extraMs),
          ).toISOString();

          const error = new ConditionalCheckFailedException({
            message: "The conditional request failed",
            $metadata: {},
          });
          mockSend.mockRejectedValueOnce(error).mockResolvedValueOnce({
            Item: {
              lockedAt,
              correlationId: "existing-owner",
              ttl: Math.floor(new Date(lockedAt).getTime() / 1000) + 3600,
            },
          });

          const result = await acquireLock(correlationId);

          expect(result.acquired).toBe(false);
          if (!result.acquired) {
            expect(result.stale).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
