import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

const mockSend = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.IMPORT_TABLE_NAME = "test-import-table";
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = mockSend;
  },
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
  GetCommand: class {
    constructor(public input: unknown) {}
  },
  UpdateCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { getSyncState } from "../sync-state-manager";

/**
 * Feature: scheduled-consigncloud-sync, Property 10: First sync omits createdAfter parameter
 * Validates: Requirements 2.5
 *
 * For any sync run where no Sync_State record exists (or the relevant timestamp field is null),
 * the Step Functions execution payload SHALL not include a createdAfter parameter,
 * resulting in a full import of all available data.
 *
 * This property test verifies that getSyncState() correctly returns null for missing records
 * and null for individual fields when those fields don't exist in the DynamoDB item,
 * ensuring the orchestrator will correctly omit createdAfter when the state indicates
 * a first-ever sync for that phase.
 */
describe("Property 10: First sync omits createdAfter parameter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no Sync_State record exists (Item is undefined)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        mockSend.mockResolvedValueOnce({ Item: undefined });

        const result = await getSyncState();

        // When no record exists, getSyncState returns null
        // This signals to the orchestrator to omit createdAfter (full import)
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("returns null for each timestamp field that is absent from the DynamoDB item", async () => {
    const isoTimestampArb = fc
      .integer({
        min: new Date("2020-01-01T00:00:00.000Z").getTime(),
        max: new Date("2030-12-31T23:59:59.999Z").getTime(),
      })
      .map((ms) => new Date(ms).toISOString());

    // Generate arbitrary combinations of present/absent fields
    const syncStateFieldsArb = fc.record({
      lastAccountSyncAt: fc.option(isoTimestampArb, { nil: undefined }),
      lastItemSyncAt: fc.option(isoTimestampArb, { nil: undefined }),
      lastSaleSyncAt: fc.option(isoTimestampArb, { nil: undefined }),
      updatedAt: isoTimestampArb,
    });

    await fc.assert(
      fc.asyncProperty(syncStateFieldsArb, async (fields) => {
        // Build the DynamoDB Item with only the fields that are defined
        const item: Record<string, string> = {
          PK: "SYNC_STATE",
          SK: "METADATA",
          updatedAt: fields.updatedAt,
        };

        if (fields.lastAccountSyncAt !== undefined) {
          item.lastAccountSyncAt = fields.lastAccountSyncAt;
        }
        if (fields.lastItemSyncAt !== undefined) {
          item.lastItemSyncAt = fields.lastItemSyncAt;
        }
        if (fields.lastSaleSyncAt !== undefined) {
          item.lastSaleSyncAt = fields.lastSaleSyncAt;
        }

        mockSend.mockResolvedValueOnce({ Item: item });

        const result = await getSyncState();

        // Result should never be null when Item exists
        expect(result).not.toBeNull();

        // Each field that was absent from the item should be null in the result
        // (indicating createdAfter should be omitted for that phase)
        if (fields.lastAccountSyncAt === undefined) {
          expect(result!.lastAccountSyncAt).toBeNull();
        } else {
          expect(result!.lastAccountSyncAt).toBe(fields.lastAccountSyncAt);
        }

        if (fields.lastItemSyncAt === undefined) {
          expect(result!.lastItemSyncAt).toBeNull();
        } else {
          expect(result!.lastItemSyncAt).toBe(fields.lastItemSyncAt);
        }

        if (fields.lastSaleSyncAt === undefined) {
          expect(result!.lastSaleSyncAt).toBeNull();
        } else {
          expect(result!.lastSaleSyncAt).toBe(fields.lastSaleSyncAt);
        }

        // updatedAt is always present
        expect(result!.updatedAt).toBe(fields.updatedAt);
      }),
      { numRuns: 100 },
    );
  });

  it("null fields in getSyncState result correctly signal omission of createdAfter", async () => {
    const isoTimestampArb = fc
      .integer({
        min: new Date("2020-01-01T00:00:00.000Z").getTime(),
        max: new Date("2030-12-31T23:59:59.999Z").getTime(),
      })
      .map((ms) => new Date(ms).toISOString());

    // Generate states where at least one field is null (simulating first sync for that phase)
    const partialStateArb = fc.record({
      lastAccountSyncAt: fc.option(isoTimestampArb, { nil: undefined }),
      lastItemSyncAt: fc.option(isoTimestampArb, { nil: undefined }),
      lastSaleSyncAt: fc.option(isoTimestampArb, { nil: undefined }),
      updatedAt: isoTimestampArb,
    });

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Case 1: No record at all (first-ever sync)
          fc.constant(null),
          // Case 2: Partial record with some null fields
          partialStateArb,
        ),
        async (stateInput) => {
          if (stateInput === null) {
            // No record exists
            mockSend.mockResolvedValueOnce({ Item: undefined });

            const result = await getSyncState();
            expect(result).toBeNull();

            // When result is null, orchestrator omits createdAfter for ALL phases
            // Verify the contract: null result means full import for everything
          } else {
            // Build item from stateInput
            const item: Record<string, string> = {
              PK: "SYNC_STATE",
              SK: "METADATA",
              updatedAt: stateInput.updatedAt,
            };

            if (stateInput.lastAccountSyncAt !== undefined) {
              item.lastAccountSyncAt = stateInput.lastAccountSyncAt;
            }
            if (stateInput.lastItemSyncAt !== undefined) {
              item.lastItemSyncAt = stateInput.lastItemSyncAt;
            }
            if (stateInput.lastSaleSyncAt !== undefined) {
              item.lastSaleSyncAt = stateInput.lastSaleSyncAt;
            }

            mockSend.mockResolvedValueOnce({ Item: item });

            const result = await getSyncState();
            expect(result).not.toBeNull();

            // For items: if lastItemSyncAt is null, createdAfter should be omitted
            if (stateInput.lastItemSyncAt === undefined) {
              expect(result!.lastItemSyncAt).toBeNull();
              // null signals: no createdAfter → full import for items
            }

            // For sales: if lastSaleSyncAt is null, createdAfter should be omitted
            if (stateInput.lastSaleSyncAt === undefined) {
              expect(result!.lastSaleSyncAt).toBeNull();
              // null signals: no createdAfter → full import for sales
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
