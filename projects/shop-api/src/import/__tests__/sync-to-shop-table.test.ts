import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockScanImportedAccounts = vi.hoisted(() => vi.fn());
const mockWriteSyncReport = vi.hoisted(() => vi.fn());
const mockDocClientSend = vi.hoisted(() => vi.fn());

vi.mock("../import-table-client", () => ({
  scanImportedAccounts: mockScanImportedAccounts,
  writeSyncReport: mockWriteSyncReport,
}));

vi.mock("../../dynamodb-client", () => ({
  docClient: { send: mockDocClientSend },
  TABLE_NAME: "test-shop-table",
}));

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class MockQueryCommand {
    _type = "Query";
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class MockGetCommand {
    _type = "Get";
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class MockPutCommand {
    _type = "Put";
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class MockUpdateCommand {
    _type = "Update";
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class MockDeleteCommand {
    _type = "Delete";
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    QueryCommand: MockQueryCommand,
    GetCommand: MockGetCommand,
    PutCommand: MockPutCommand,
    UpdateCommand: MockUpdateCommand,
    DeleteCommand: MockDeleteCommand,
  };
});

import { syncToShopTable } from "../sync-to-shop-table";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import type { ImportedAccountRecord } from "../import-table-client";

function createMockEvent(): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      http: { method: "POST", path: "/api/import/sync" },
    },
  } as unknown as APIGatewayProxyEventV2;
}

function createImportedRecord(
  overrides: Partial<ImportedAccountRecord> = {},
): ImportedAccountRecord {
  return {
    PK: "IMPORT#CONSIGNCLOUD#abc-123",
    SK: "METADATA",
    id: "abc-123",
    number: "001893",
    first_name: "Alice",
    last_name: "Smith",
    company: "ACME Corp",
    email: "alice@example.com",
    phone_number: "+41791234567",
    address_line_1: "Bahnhofstrasse 1",
    address_line_2: "Suite 200",
    city: "Zürich",
    state: "ZH",
    postal_code: "8001",
    balance: 100,
    email_notifications_enabled: true,
    created: "2024-01-01T00:00:00Z",
    importedAt: "2024-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("sync-to-shop-table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteSyncReport.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("create path — new account", () => {
    it("uses UUID-based PK with GSI1 attributes and shopUid", async () => {
      const record = createImportedRecord({ number: "001893" });
      mockScanImportedAccounts.mockResolvedValue([record]);

      mockDocClientSend.mockImplementation(
        (cmd: { _type: string; input: Record<string, unknown> }) => {
          if (cmd._type === "Query") {
            const input = cmd.input as {
              IndexName?: string;
              KeyConditionExpression?: string;
            };
            if (input.IndexName === "sourceId-index") {
              // findBySourceId — no existing account
              return Promise.resolve({ Items: [] });
            }
            // TAG# query for change detection — won't be called on create path
            return Promise.resolve({ Items: [] });
          }
          if (cmd._type === "Get") {
            // getSequenceCounter — should only be called at end of sync
            return Promise.resolve({
              Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 500 },
            });
          }
          if (cmd._type === "Put") {
            return Promise.resolve({});
          }
          if (cmd._type === "Update") {
            return Promise.resolve({});
          }
          return Promise.resolve({});
        },
      );

      const result = (await syncToShopTable(
        createMockEvent(),
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.added).toBe(1);

      // Verify the METADATA PutCommand uses UUID-based PK
      const putCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => (call[0] as { _type: string })._type === "Put",
      );

      const metadataPut = putCalls.find((call: unknown[]) => {
        const input = (call[0] as { input: { Item?: { SK?: string } } }).input;
        return input.Item?.SK === "METADATA";
      });
      expect(metadataPut).toBeDefined();

      const metadataItem = (
        metadataPut![0] as { input: { Item: Record<string, unknown> } }
      ).input.Item;
      // PK should be ACCOUNT#<uuid> pattern
      expect(metadataItem.PK).toMatch(
        /^ACCOUNT#[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      // uuid attribute should match the UUID portion of PK
      const pkUuid = (metadataItem.PK as string).replace("ACCOUNT#", "");
      expect(metadataItem.uuid).toBe(pkUuid);
      // shopUid should be zero-padded account number
      expect(metadataItem.shopUid).toBe("0001893");
      // GSI1 attributes
      expect(metadataItem.GSI1PK).toBe("ACCOUNT");
      expect(metadataItem.GSI1SK).toBe("0001893");
      expect(metadataItem.sourceId).toBe("abc-123");

      // Verify NO TransactWrite or sequence counter allocation was used for creation
      const allCallTypes = mockDocClientSend.mock.calls.map(
        (call: unknown[]) => (call[0] as { _type: string })._type,
      );
      expect(allCallTypes).not.toContain("TransactWrite");
    });

    it("PutItem includes street, place, postcode, canton, email, telephone and excludes address", async () => {
      const record = createImportedRecord({
        number: "001893",
        address_line_1: "Bahnhofstrasse 1",
        address_line_2: "Suite 200",
        city: "Zürich",
        state: "ZH",
        postal_code: "8001",
        email: "alice@example.com",
        phone_number: "+41791234567",
      });
      mockScanImportedAccounts.mockResolvedValue([record]);

      mockDocClientSend.mockImplementation(
        (cmd: { _type: string; input: Record<string, unknown> }) => {
          if (cmd._type === "Query") {
            const input = cmd.input as { IndexName?: string };
            if (input.IndexName === "sourceId-index") {
              return Promise.resolve({ Items: [] });
            }
            return Promise.resolve({ Items: [] });
          }
          if (cmd._type === "Get") {
            return Promise.resolve({
              Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 500 },
            });
          }
          return Promise.resolve({});
        },
      );

      await syncToShopTable(createMockEvent());

      const putCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => (call[0] as { _type: string })._type === "Put",
      );

      const metadataPut = putCalls.find((call: unknown[]) => {
        const input = (call[0] as { input: { Item?: { SK?: string } } }).input;
        return input.Item?.SK === "METADATA";
      });
      expect(metadataPut).toBeDefined();

      const item = (
        metadataPut![0] as { input: { Item: Record<string, unknown> } }
      ).input.Item;
      // Verify new structured fields are present
      expect(item.street).toBe("Bahnhofstrasse 1, Suite 200");
      expect(item.place).toBe("Zürich");
      expect(item.postcode).toBe("8001");
      expect(item.canton).toBe("ZH");
      expect(item.email).toBe("alice@example.com");
      expect(item.telephone).toBe("0791234567");

      // Verify address field is NOT present
      expect(item).not.toHaveProperty("address");
    });

    it("writes TAG# items for each derived tag on create", async () => {
      const record = createImportedRecord({
        number: "001893",
        email_notifications_enabled: true,
        phone_number: "+41791234567", // mobile prefix → text_notification tag
      });
      mockScanImportedAccounts.mockResolvedValue([record]);

      mockDocClientSend.mockImplementation(
        (cmd: { _type: string; input: Record<string, unknown> }) => {
          if (cmd._type === "Query") {
            const input = cmd.input as { IndexName?: string };
            if (input.IndexName === "sourceId-index") {
              return Promise.resolve({ Items: [] });
            }
            return Promise.resolve({ Items: [] });
          }
          if (cmd._type === "Get") {
            return Promise.resolve({
              Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 500 },
            });
          }
          return Promise.resolve({});
        },
      );

      await syncToShopTable(createMockEvent());

      const putCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => (call[0] as { _type: string })._type === "Put",
      );

      // Find TAG# puts
      const tagPuts = putCalls.filter((call: unknown[]) => {
        const input = (call[0] as { input: { Item?: { SK?: string } } }).input;
        return input.Item?.SK?.startsWith("TAG#");
      });

      // Expect 2 tags: email_notification and text_notification
      expect(tagPuts).toHaveLength(2);

      const tagSKs = tagPuts.map((call: unknown[]) => {
        const input = (
          call[0] as {
            input: { Item: { SK: string; PK: string; tag: string } };
          }
        ).input;
        return input.Item.SK;
      });
      expect(tagSKs).toContain("TAG#email_notification");
      expect(tagSKs).toContain("TAG#text_notification");

      // Verify TAG# items use the same UUID-based PK as the account
      const metadataPut = putCalls.find((call: unknown[]) => {
        const input = (call[0] as { input: { Item?: { SK?: string } } }).input;
        return input.Item?.SK === "METADATA";
      });
      const accountPk = (metadataPut![0] as { input: { Item: { PK: string } } })
        .input.Item.PK;

      for (const tagPut of tagPuts) {
        const input = (
          tagPut[0] as { input: { Item: { PK: string; tag: string } } }
        ).input;
        expect(input.Item.PK).toBe(accountPk);
      }
    });
  });

  describe("update path — existing account with changes", () => {
    it("TAG# items are replaced on update (old deleted, new written)", async () => {
      const record = createImportedRecord({
        number: "001893",
        first_name: "Alice",
        last_name: "Updated",
        email_notifications_enabled: true,
        phone_number: "+41791234567", // mobile → text_notification
      });
      mockScanImportedAccounts.mockResolvedValue([record]);

      mockDocClientSend.mockImplementation(
        (cmd: { _type: string; input: Record<string, unknown> }) => {
          if (cmd._type === "Query") {
            const input = cmd.input as {
              IndexName?: string;
              KeyConditionExpression?: string;
              ExpressionAttributeValues?: Record<string, string>;
            };
            if (input.IndexName === "sourceId-index") {
              // findBySourceId — existing account
              return Promise.resolve({
                Items: [
                  {
                    PK: "ACCOUNT#001893",
                    SK: "METADATA",
                    name: "Alice Smith",
                    company: "ACME Corp",
                    street: "Bahnhofstrasse 1, Suite 200",
                    place: "Zürich",
                    postcode: "8001",
                    canton: "ZH",
                    email: "alice@example.com",
                    telephone: "0791234567",
                    sourceId: "abc-123",
                  },
                ],
              });
            }
            // TAG# queries
            if (
              input.ExpressionAttributeValues &&
              ":tagPrefix" in input.ExpressionAttributeValues
            ) {
              return Promise.resolve({
                Items: [
                  { PK: "ACCOUNT#001893", SK: "TAG#old_tag", tag: "old_tag" },
                ],
              });
            }
            return Promise.resolve({ Items: [] });
          }
          if (cmd._type === "Get") {
            return Promise.resolve({
              Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 5000 },
            });
          }
          return Promise.resolve({});
        },
      );

      await syncToShopTable(createMockEvent());

      // Verify delete of old TAG# items
      const deleteCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => (call[0] as { _type: string })._type === "Delete",
      );
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1);

      const deleteKey = (
        deleteCalls[0][0] as { input: { Key: { PK: string; SK: string } } }
      ).input.Key;
      expect(deleteKey.PK).toBe("ACCOUNT#001893");
      expect(deleteKey.SK).toBe("TAG#old_tag");

      // Verify new TAG# items are written
      const putCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => (call[0] as { _type: string })._type === "Put",
      );
      const tagPuts = putCalls.filter((call: unknown[]) => {
        const input = (call[0] as { input: { Item?: { SK?: string } } }).input;
        return input.Item?.SK?.startsWith("TAG#");
      });

      expect(tagPuts).toHaveLength(2);
      const tagSKs = tagPuts.map((call: unknown[]) => {
        const input = (call[0] as { input: { Item: { SK: string } } }).input;
        return input.Item.SK;
      });
      expect(tagSKs).toContain("TAG#email_notification");
      expect(tagSKs).toContain("TAG#text_notification");
    });

    it("update path does NOT overwrite immutable key fields (PK, SK, GSI1PK, GSI1SK, uuid, shopUid)", async () => {
      const record = createImportedRecord({
        number: "001893",
        first_name: "Alice",
        last_name: "Updated",
      });
      mockScanImportedAccounts.mockResolvedValue([record]);

      mockDocClientSend.mockImplementation(
        (cmd: { _type: string; input: Record<string, unknown> }) => {
          if (cmd._type === "Query") {
            const input = cmd.input as {
              IndexName?: string;
              ExpressionAttributeValues?: Record<string, string>;
            };
            if (input.IndexName === "sourceId-index") {
              return Promise.resolve({
                Items: [
                  {
                    PK: "ACCOUNT#existing-uuid-1234",
                    SK: "METADATA",
                    uuid: "existing-uuid-1234",
                    shopUid: "0001893",
                    GSI1PK: "ACCOUNT",
                    GSI1SK: "0001893",
                    name: "Alice Smith",
                    company: "ACME Corp",
                    street: "Old Street",
                    place: "Zürich",
                    postcode: "8001",
                    canton: "ZH",
                    email: "old@example.com",
                    telephone: "0791234567",
                    sourceId: "abc-123",
                  },
                ],
              });
            }
            if (
              input.ExpressionAttributeValues &&
              ":tagPrefix" in input.ExpressionAttributeValues
            ) {
              return Promise.resolve({ Items: [] });
            }
            return Promise.resolve({ Items: [] });
          }
          if (cmd._type === "Get") {
            return Promise.resolve({
              Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 5000 },
            });
          }
          return Promise.resolve({});
        },
      );

      await syncToShopTable(createMockEvent());

      // Find the UpdateCommand for the account metadata
      const updateCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => (call[0] as { _type: string })._type === "Update",
      );

      const metadataUpdate = updateCalls.find((call: unknown[]) => {
        const input = (
          call[0] as { input: { Key?: { PK?: string; SK?: string } } }
        ).input;
        return (
          input.Key?.PK === "ACCOUNT#existing-uuid-1234" &&
          input.Key?.SK === "METADATA"
        );
      });
      expect(metadataUpdate).toBeDefined();

      const updateInput = (
        metadataUpdate![0] as { input: Record<string, unknown> }
      ).input as {
        UpdateExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
      };

      // Verify the UpdateExpression does NOT reference immutable fields
      const immutableFields = [
        "PK",
        "SK",
        "GSI1PK",
        "GSI1SK",
        "uuid",
        "shopUid",
      ];
      const allAttrNames = Object.values(updateInput.ExpressionAttributeNames);
      for (const field of immutableFields) {
        expect(allAttrNames).not.toContain(field);
      }

      // Verify ExpressionAttributeValues does not contain immutable field values
      const allAttrValueKeys = Object.keys(
        updateInput.ExpressionAttributeValues,
      );
      for (const field of immutableFields) {
        expect(allAttrValueKeys).not.toContain(`:${field}`);
      }

      // Verify only mutable fields are in the UpdateExpression
      const mutableFields = [
        "name",
        "company",
        "street",
        "place",
        "postcode",
        "canton",
        "email",
        "telephone",
      ];
      for (const field of mutableFields) {
        expect(allAttrNames).toContain(field);
      }
    });

    it("update expression includes all new fields (street, place, postcode, canton, email, telephone)", async () => {
      const record = createImportedRecord({
        number: "001893",
        first_name: "Alice",
        last_name: "Updated",
        company: "New Corp",
        address_line_1: "Neue Strasse 5",
        address_line_2: undefined,
        city: "Bern",
        state: "BE",
        postal_code: "3000",
        email: "alice.new@example.com",
        phone_number: "+41781112233",
      });
      mockScanImportedAccounts.mockResolvedValue([record]);

      mockDocClientSend.mockImplementation(
        (cmd: { _type: string; input: Record<string, unknown> }) => {
          if (cmd._type === "Query") {
            const input = cmd.input as {
              IndexName?: string;
              ExpressionAttributeValues?: Record<string, string>;
            };
            if (input.IndexName === "sourceId-index") {
              return Promise.resolve({
                Items: [
                  {
                    PK: "ACCOUNT#001893",
                    SK: "METADATA",
                    name: "Alice Smith",
                    company: "ACME Corp",
                    street: "Old Street",
                    place: "Zürich",
                    postcode: "8001",
                    canton: "ZH",
                    email: "old@example.com",
                    telephone: "0791234567",
                    sourceId: "abc-123",
                  },
                ],
              });
            }
            // TAG# queries — existing tags
            if (
              input.ExpressionAttributeValues &&
              ":tagPrefix" in input.ExpressionAttributeValues
            ) {
              return Promise.resolve({
                Items: [
                  {
                    PK: "ACCOUNT#001893",
                    SK: "TAG#email_notification",
                    tag: "email_notification",
                  },
                ],
              });
            }
            return Promise.resolve({ Items: [] });
          }
          if (cmd._type === "Get") {
            return Promise.resolve({
              Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 5000 },
            });
          }
          return Promise.resolve({});
        },
      );

      await syncToShopTable(createMockEvent());

      // Find the UpdateCommand call
      const updateCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => (call[0] as { _type: string })._type === "Update",
      );

      // Find the metadata update (not the sequence counter update)
      const metadataUpdate = updateCalls.find((call: unknown[]) => {
        const input = (
          call[0] as { input: { Key?: { PK?: string; SK?: string } } }
        ).input;
        return (
          input.Key?.PK === "ACCOUNT#001893" && input.Key?.SK === "METADATA"
        );
      });
      expect(metadataUpdate).toBeDefined();

      const updateInput = (
        metadataUpdate![0] as { input: Record<string, unknown> }
      ).input as {
        UpdateExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
      };

      // Verify UpdateExpression contains all new fields
      expect(updateInput.UpdateExpression).toContain("#street");
      expect(updateInput.UpdateExpression).toContain("#place");
      expect(updateInput.UpdateExpression).toContain("#postcode");
      expect(updateInput.UpdateExpression).toContain("#canton");
      expect(updateInput.UpdateExpression).toContain("#email");
      expect(updateInput.UpdateExpression).toContain("#telephone");

      // Verify ExpressionAttributeValues have correct mapped values
      expect(updateInput.ExpressionAttributeValues[":street"]).toBe(
        "Neue Strasse 5",
      );
      expect(updateInput.ExpressionAttributeValues[":place"]).toBe("Bern");
      expect(updateInput.ExpressionAttributeValues[":postcode"]).toBe("3000");
      expect(updateInput.ExpressionAttributeValues[":canton"]).toBe("BE");
      expect(updateInput.ExpressionAttributeValues[":email"]).toBe(
        "alice.new@example.com",
      );
      expect(updateInput.ExpressionAttributeValues[":telephone"]).toBe(
        "0781112233",
      );
    });
  });

  describe("skip path — no changes detected", () => {
    it("skips record when all fields and tags are identical", async () => {
      const record = createImportedRecord({
        number: "001893",
        first_name: "Alice",
        last_name: "Smith",
        company: "ACME Corp",
        address_line_1: "Bahnhofstrasse 1",
        address_line_2: "Suite 200",
        city: "Zürich",
        state: "ZH",
        postal_code: "8001",
        email: "alice@example.com",
        phone_number: "+41791234567",
        email_notifications_enabled: true,
      });
      mockScanImportedAccounts.mockResolvedValue([record]);

      mockDocClientSend.mockImplementation(
        (cmd: { _type: string; input: Record<string, unknown> }) => {
          if (cmd._type === "Query") {
            const input = cmd.input as {
              IndexName?: string;
              ExpressionAttributeValues?: Record<string, string>;
            };
            if (input.IndexName === "sourceId-index") {
              return Promise.resolve({
                Items: [
                  {
                    PK: "ACCOUNT#001893",
                    SK: "METADATA",
                    name: "Alice Smith",
                    company: "ACME Corp",
                    street: "Bahnhofstrasse 1, Suite 200",
                    place: "Zürich",
                    postcode: "8001",
                    canton: "ZH",
                    email: "alice@example.com",
                    telephone: "0791234567",
                    sourceId: "abc-123",
                  },
                ],
              });
            }
            // TAG# query — returns matching tags
            if (
              input.ExpressionAttributeValues &&
              ":tagPrefix" in input.ExpressionAttributeValues
            ) {
              return Promise.resolve({
                Items: [
                  {
                    PK: "ACCOUNT#001893",
                    SK: "TAG#email_notification",
                    tag: "email_notification",
                  },
                  {
                    PK: "ACCOUNT#001893",
                    SK: "TAG#text_notification",
                    tag: "text_notification",
                  },
                ],
              });
            }
            return Promise.resolve({ Items: [] });
          }
          if (cmd._type === "Get") {
            return Promise.resolve({
              Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 5000 },
            });
          }
          return Promise.resolve({});
        },
      );

      const result = (await syncToShopTable(
        createMockEvent(),
      )) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.added).toBe(0);
      expect(body.updated).toBe(0);
      expect(body.skipped).toBe(1);

      // No Put, Update, or Delete calls for account data (only Query for findBySourceId and tags, Get for counter)
      const writeCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => {
          const type = (call[0] as { _type: string })._type;
          return type === "Put" || type === "Delete";
        },
      );
      expect(writeCalls).toHaveLength(0);

      // No metadata updates (only sequence counter check may trigger Update if needed)
      const updateCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => (call[0] as { _type: string })._type === "Update",
      );
      // The only possible update is the sequence counter — not a metadata update
      for (const call of updateCalls) {
        const input = (call[0] as { input: { Key?: { PK?: string } } }).input;
        expect(input.Key?.PK).not.toBe("ACCOUNT#001893");
      }
    });
  });

  describe("sequence counter update at end of sync", () => {
    it("updates sequence counter to max imported number when higher than current", async () => {
      const records = [
        createImportedRecord({ id: "a", number: "001893" }),
        createImportedRecord({ id: "b", number: "002500" }),
        createImportedRecord({ id: "c", number: "000100" }),
      ];
      mockScanImportedAccounts.mockResolvedValue(records);

      mockDocClientSend.mockImplementation(
        (cmd: { _type: string; input: Record<string, unknown> }) => {
          if (cmd._type === "Query") {
            const input = cmd.input as { IndexName?: string };
            if (input.IndexName === "sourceId-index") {
              return Promise.resolve({ Items: [] });
            }
            return Promise.resolve({ Items: [] });
          }
          if (cmd._type === "Get") {
            // Current sequence counter is 1000 — less than max imported (2500)
            return Promise.resolve({
              Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 1000 },
            });
          }
          return Promise.resolve({});
        },
      );

      await syncToShopTable(createMockEvent());

      // Find the sequence counter UpdateCommand
      const updateCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => (call[0] as { _type: string })._type === "Update",
      );

      const counterUpdate = updateCalls.find((call: unknown[]) => {
        const input = (
          call[0] as { input: { Key?: { PK?: string; SK?: string } } }
        ).input;
        return (
          input.Key?.PK === "SEQUENCE#ACCOUNT" && input.Key?.SK === "COUNTER"
        );
      });
      expect(counterUpdate).toBeDefined();

      const counterInput = (
        counterUpdate![0] as {
          input: { ExpressionAttributeValues: Record<string, unknown> };
        }
      ).input;
      // Max imported number is 2500 (from "002500")
      expect(counterInput.ExpressionAttributeValues[":newVal"]).toBe(2500);
    });

    it("does NOT update sequence counter if current value is already higher", async () => {
      const records = [
        createImportedRecord({ id: "a", number: "001893" }),
        createImportedRecord({ id: "b", number: "000500" }),
      ];
      mockScanImportedAccounts.mockResolvedValue(records);

      mockDocClientSend.mockImplementation(
        (cmd: { _type: string; input: Record<string, unknown> }) => {
          if (cmd._type === "Query") {
            const input = cmd.input as { IndexName?: string };
            if (input.IndexName === "sourceId-index") {
              return Promise.resolve({ Items: [] });
            }
            return Promise.resolve({ Items: [] });
          }
          if (cmd._type === "Get") {
            // Current sequence counter is 5000 — higher than max imported (1893)
            return Promise.resolve({
              Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 5000 },
            });
          }
          return Promise.resolve({});
        },
      );

      await syncToShopTable(createMockEvent());

      // Find any UpdateCommand calls
      const updateCalls = mockDocClientSend.mock.calls.filter(
        (call: unknown[]) => (call[0] as { _type: string })._type === "Update",
      );

      // No sequence counter update should have been made
      const counterUpdate = updateCalls.find((call: unknown[]) => {
        const input = (
          call[0] as { input: { Key?: { PK?: string; SK?: string } } }
        ).input;
        return (
          input.Key?.PK === "SEQUENCE#ACCOUNT" && input.Key?.SK === "COUNTER"
        );
      });
      expect(counterUpdate).toBeUndefined();
    });
  });
});
