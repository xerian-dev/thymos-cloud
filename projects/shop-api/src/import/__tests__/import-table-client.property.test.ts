import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { ConsignCloudAccount } from "../field-mapper";

/**
 * Feature: consigncloud-import, Property 4: Import record construction preserves all fields with correct keys
 * Validates: Requirements 2.1, 2.2, 2.3
 */
describe("Property 4: Import record construction preserves all fields with correct keys", () => {
  let capturedCommands: unknown[] = [];

  beforeEach(() => {
    capturedCommands = [];

    vi.resetModules();

    vi.doMock("@aws-sdk/client-dynamodb", () => {
      return {
        DynamoDBClient: class MockDynamoDBClient {},
      };
    });

    vi.doMock("@aws-sdk/lib-dynamodb", () => {
      const mockSend = vi.fn(async (command: unknown) => {
        capturedCommands.push(command);
        return {};
      });

      return {
        DynamoDBDocumentClient: {
          from: vi.fn(() => ({ send: mockSend })),
        },
        BatchWriteCommand: class MockBatchWriteCommand {
          input: unknown;
          constructor(input: unknown) {
            this.input = input;
          }
        },
        PutCommand: class MockPutCommand {
          input: unknown;
          constructor(input: unknown) {
            this.input = input;
          }
        },
        ScanCommand: class MockScanCommand {
          input: unknown;
          constructor(input: unknown) {
            this.input = input;
          }
        },
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const isoDateArb: fc.Arbitrary<string> = fc
    .integer({ min: 946684800000, max: 1924905600000 }) // 2000-01-01 to 2030-12-31
    .map((ms: number) => new Date(ms).toISOString());

  const consignCloudAccountArb: fc.Arbitrary<ConsignCloudAccount> = fc.record({
    id: fc.uuid(),
    number: fc.string({ minLength: 1, maxLength: 20 }),
    first_name: fc.string({ minLength: 1, maxLength: 30 }),
    last_name: fc.string({ minLength: 1, maxLength: 30 }),
    company: fc.string({ minLength: 0, maxLength: 50 }),
    email: fc.emailAddress(),
    balance: fc.double({ min: -10000, max: 10000, noNaN: true }),
    email_notifications_enabled: fc.boolean(),
    created: isoDateArb,
    deleted: fc.constant(undefined),
  });

  const timestampArb: fc.Arbitrary<string> = isoDateArb;

  it("constructs Import_Table records with correct PK, SK, mapped fields, and importedAt", async () => {
    await fc.assert(
      fc.asyncProperty(
        consignCloudAccountArb,
        timestampArb,
        async (account: ConsignCloudAccount, importedAt: string) => {
          capturedCommands = [];

          const { writeImportedAccounts } =
            await import("../import-table-client");

          await writeImportedAccounts([account], importedAt);

          expect(capturedCommands.length).toBe(1);

          const command = capturedCommands[0] as {
            input: {
              RequestItems: Record<
                string,
                Array<{ PutRequest: { Item: Record<string, unknown> } }>
              >;
            };
          };

          const tableName = Object.keys(command.input.RequestItems)[0];
          const items = command.input.RequestItems[tableName];
          expect(items).toHaveLength(1);

          const item = items[0].PutRequest.Item;

          // PK format: IMPORT#CONSIGNCLOUD#{id}
          expect(item.PK).toBe(`IMPORT#CONSIGNCLOUD#${account.id}`);

          // SK is always METADATA
          expect(item.SK).toBe("METADATA");

          // All original fields mapped correctly
          expect(item.id).toBe(account.id);
          expect(item.number).toBe(account.number);
          expect(item.firstName).toBe(account.first_name);
          expect(item.lastName).toBe(account.last_name);
          expect(item.company).toBe(account.company);
          expect(item.email).toBe(account.email);
          expect(item.balance).toBe(account.balance);
          expect(item.emailNotificationsEnabled).toBe(
            account.email_notifications_enabled,
          );
          expect(item.created).toBe(account.created);

          // importedAt matches provided timestamp
          expect(item.importedAt).toBe(importedAt);
        },
      ),
      { numRuns: 100 },
    );
  });
});
