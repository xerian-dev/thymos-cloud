import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

/**
 * Feature: consigncloud-sale-import, Property 5: Error descriptions are bounded to 500 characters
 *
 * Validates: Requirements 10.5
 *
 * The transitionSaleJob function in sale-job-manager.ts truncates errors via:
 *   const truncatedError = error ? error.slice(0, 500) : undefined;
 *
 * We mock DynamoDB and call transitionSaleJob for each generated error string,
 * then verify the stored value in the UpdateCommand has the expected length
 * and is a prefix of the original.
 */

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDynamoDBClient {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: sendMock }),
  },
  GetCommand: class MockGetCommand {
    input: unknown;
    _type = "Get";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutCommand: class MockPutCommand {
    input: unknown;
    _type = "Put";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  ScanCommand: class MockScanCommand {
    input: unknown;
    _type = "Scan";
    constructor(input: unknown) {
      this.input = input;
    }
  },
  UpdateCommand: class MockUpdateCommand {
    input: unknown;
    _type = "Update";
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

describe("Property 5: Error descriptions are bounded to 500 characters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockReset();
  });

  /**
   * Validates: Requirements 10.5
   */
  it("stored error length equals min(L, 500) for any non-empty error string of length L", async () => {
    const { transitionSaleJob } =
      await import("../../src/import/sale-job-manager");

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 2000 }),
        async (errorString) => {
          sendMock.mockReset();

          // Mock getSaleJob returning a running job
          sendMock.mockResolvedValueOnce({
            Item: {
              jobId: "test-job",
              state: "running",
              phase: "fetch",
              startedAt: "2026-01-01T00:00:00.000Z",
              lastUpdatedAt: "2026-01-01T00:00:00.000Z",
              filterParams: {},
              progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
            },
          });
          // Mock UpdateCommand response
          sendMock.mockResolvedValueOnce({});

          const progress = {
            processed: 1,
            imported: 0,
            skipped: 0,
            failed: 1,
          };

          await transitionSaleJob("test-job", "failed", progress, errorString);

          const updateCmd = sendMock.mock.calls[1][0];
          const storedError =
            updateCmd.input.ExpressionAttributeValues[":error"];

          const expectedLength = Math.min(errorString.length, 500);
          expect(storedError.length).toBe(expectedLength);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 10.5
   */
  it("stored error is always a prefix of the original error string", async () => {
    const { transitionSaleJob } =
      await import("../../src/import/sale-job-manager");

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 2000 }),
        async (errorString) => {
          sendMock.mockReset();

          sendMock.mockResolvedValueOnce({
            Item: {
              jobId: "test-job",
              state: "running",
              phase: "fetch",
              startedAt: "2026-01-01T00:00:00.000Z",
              lastUpdatedAt: "2026-01-01T00:00:00.000Z",
              filterParams: {},
              progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
            },
          });
          sendMock.mockResolvedValueOnce({});

          const progress = {
            processed: 1,
            imported: 0,
            skipped: 0,
            failed: 1,
          };

          await transitionSaleJob("test-job", "failed", progress, errorString);

          const updateCmd = sendMock.mock.calls[1][0];
          const storedError =
            updateCmd.input.ExpressionAttributeValues[":error"];

          // The stored error must be a prefix of the original
          expect(errorString.startsWith(storedError)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
