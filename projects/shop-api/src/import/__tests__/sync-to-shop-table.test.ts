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
  class MockScanCommand {
    _type = "Scan";
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
  class MockTransactWriteCommand {
    _type = "TransactWrite";
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
  return {
    ScanCommand: MockScanCommand,
    GetCommand: MockGetCommand,
    TransactWriteCommand: MockTransactWriteCommand,
    UpdateCommand: MockUpdateCommand,
  };
});

import { syncToShopTable } from "../sync-to-shop-table";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
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
    number: "001",
    firstName: "Alice",
    lastName: "Smith",
    company: "ACME Corp",
    email: "alice@example.com",
    balance: 100,
    emailNotificationsEnabled: true,
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

  it("creates a new account with sequence counter increment when no existing account found", async () => {
    const record = createImportedRecord();
    mockScanImportedAccounts.mockResolvedValue([record]);

    mockDocClientSend.mockImplementation((cmd: { _type: string }) => {
      if (cmd._type === "Scan") {
        // findBySourceId — no existing account
        return Promise.resolve({ Items: [] });
      }
      if (cmd._type === "Get") {
        // getSequenceCounter returns 5
        return Promise.resolve({
          Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 5 },
        });
      }
      if (cmd._type === "TransactWrite") {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const result = await syncToShopTable(createMockEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.added).toBe(1);
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.errored).toBe(0);

    // Verify TransactWriteCommand was called with correct account number (5+1=6 → 0000006)
    const transactCall = mockDocClientSend.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { _type: string })._type === "TransactWrite",
    );
    expect(transactCall).toBeDefined();

    const transactInput = (
      transactCall![0] as { input: { TransactItems: unknown[] } }
    ).input;
    const putItem = transactInput.TransactItems[0] as {
      Put: { Item: { PK: string; sourceId: string } };
    };
    expect(putItem.Put.Item.PK).toBe("ACCOUNT#0000006");
    expect(putItem.Put.Item.sourceId).toBe("abc-123");

    // Verify counter update from 5 to 6
    const updateItem = transactInput.TransactItems[1] as {
      Update: {
        ExpressionAttributeValues: { ":newVal": number; ":currentVal": number };
      };
    };
    expect(updateItem.Update.ExpressionAttributeValues[":newVal"]).toBe(6);
    expect(updateItem.Update.ExpressionAttributeValues[":currentVal"]).toBe(5);
  });

  it("updates existing account when fields differ", async () => {
    const record = createImportedRecord({
      firstName: "Alice",
      lastName: "Johnson",
      company: "New Corp",
      email: "alice.new@example.com",
    });
    mockScanImportedAccounts.mockResolvedValue([record]);

    mockDocClientSend.mockImplementation((cmd: { _type: string }) => {
      if (cmd._type === "Scan") {
        // findBySourceId — returns existing account with different fields
        return Promise.resolve({
          Items: [
            {
              PK: "ACCOUNT#0000001",
              SK: "METADATA",
              name: "Alice Smith",
              company: "ACME Corp",
              telephone: "alice@example.com",
              sourceId: "abc-123",
            },
          ],
        });
      }
      if (cmd._type === "Update") {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const result = await syncToShopTable(createMockEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.added).toBe(0);
    expect(body.updated).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.errored).toBe(0);

    // Verify UpdateCommand was called with correct values
    const updateCall = mockDocClientSend.mock.calls.find(
      (call: unknown[]) => (call[0] as { _type: string })._type === "Update",
    );
    expect(updateCall).toBeDefined();

    const updateInput = (
      updateCall![0] as {
        input: {
          Key: { PK: string; SK: string };
          ExpressionAttributeValues: {
            ":name": string;
            ":company": string;
            ":telephone": string;
          };
        };
      }
    ).input;
    expect(updateInput.Key.PK).toBe("ACCOUNT#0000001");
    expect(updateInput.ExpressionAttributeValues[":name"]).toBe(
      "Alice Johnson",
    );
    expect(updateInput.ExpressionAttributeValues[":company"]).toBe("New Corp");
    expect(updateInput.ExpressionAttributeValues[":telephone"]).toBe(
      "alice.new@example.com",
    );
  });

  it("skips record when fields are identical", async () => {
    const record = createImportedRecord({
      firstName: "Alice",
      lastName: "Smith",
      company: "ACME Corp",
      email: "alice@example.com",
    });
    mockScanImportedAccounts.mockResolvedValue([record]);

    mockDocClientSend.mockImplementation((cmd: { _type: string }) => {
      if (cmd._type === "Scan") {
        // findBySourceId — returns existing account with identical fields
        return Promise.resolve({
          Items: [
            {
              PK: "ACCOUNT#0000001",
              SK: "METADATA",
              name: "Alice Smith",
              company: "ACME Corp",
              telephone: "alice@example.com",
              sourceId: "abc-123",
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    const result = await syncToShopTable(createMockEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.added).toBe(0);
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.errored).toBe(0);

    // Verify no write commands were issued (only Scan calls for findBySourceId)
    const writeCalls = mockDocClientSend.mock.calls.filter(
      (call: unknown[]) => {
        const type = (call[0] as { _type: string })._type;
        return type === "TransactWrite" || type === "Update";
      },
    );
    expect(writeCalls).toHaveLength(0);
  });

  it("records individual record failure and continues processing remaining records", async () => {
    const record1 = createImportedRecord({ id: "fail-1", firstName: "Fail" });
    const record2 = createImportedRecord({
      id: "success-2",
      firstName: "Success",
    });
    mockScanImportedAccounts.mockResolvedValue([record1, record2]);

    let scanCallCount = 0;
    mockDocClientSend.mockImplementation((cmd: { _type: string }) => {
      if (cmd._type === "Scan") {
        scanCallCount++;
        if (scanCallCount === 1) {
          // First record's findBySourceId — throws error
          return Promise.reject(new Error("DynamoDB throttled"));
        }
        // Second record's findBySourceId — no existing account
        return Promise.resolve({ Items: [] });
      }
      if (cmd._type === "Get") {
        return Promise.resolve({
          Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 10 },
        });
      }
      if (cmd._type === "TransactWrite") {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const result = await syncToShopTable(createMockEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.errored).toBe(1);
    expect(body.added).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].consignCloudId).toBe("fail-1");
    expect(body.errors[0].message).toBe("DynamoDB throttled");
  });

  it("excludes summary record from sync scan (handled by scanImportedAccounts)", async () => {
    // scanImportedAccounts is responsible for filtering out SUMMARY and SYNC#REPORT records.
    // This test verifies the handler uses scanImportedAccounts (which filters) rather than
    // doing its own raw scan.
    mockScanImportedAccounts.mockResolvedValue([]);

    const result = await syncToShopTable(createMockEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.added).toBe(0);
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.errored).toBe(0);

    // Verify scanImportedAccounts was called (it handles filtering internally)
    expect(mockScanImportedAccounts).toHaveBeenCalledOnce();
  });

  it("writes sync report with PK SYNC#REPORT and ISO timestamp SK", async () => {
    const record = createImportedRecord();
    mockScanImportedAccounts.mockResolvedValue([record]);

    mockDocClientSend.mockImplementation((cmd: { _type: string }) => {
      if (cmd._type === "Scan") {
        return Promise.resolve({ Items: [] });
      }
      if (cmd._type === "Get") {
        return Promise.resolve({
          Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 0 },
        });
      }
      if (cmd._type === "TransactWrite") {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    await syncToShopTable(createMockEvent());

    expect(mockWriteSyncReport).toHaveBeenCalledOnce();
    const reportArg = mockWriteSyncReport.mock.calls[0][0] as {
      added: number;
      updated: number;
      skipped: number;
      errored: number;
      errors: unknown[];
      startedAt: string;
      completedAt: string;
    };

    expect(reportArg.added).toBe(1);
    expect(reportArg.updated).toBe(0);
    expect(reportArg.skipped).toBe(0);
    expect(reportArg.errored).toBe(0);
    expect(reportArg.errors).toEqual([]);

    // Verify startedAt and completedAt are valid ISO timestamps
    expect(new Date(reportArg.startedAt).toISOString()).toBe(
      reportArg.startedAt,
    );
    expect(new Date(reportArg.completedAt).toISOString()).toBe(
      reportArg.completedAt,
    );
    // completedAt should be >= startedAt
    expect(new Date(reportArg.completedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(reportArg.startedAt).getTime(),
    );
  });

  it("logs at start and completion of sync", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    mockScanImportedAccounts.mockResolvedValue([createImportedRecord()]);

    mockDocClientSend.mockImplementation((cmd: { _type: string }) => {
      if (cmd._type === "Scan") {
        return Promise.resolve({ Items: [] });
      }
      if (cmd._type === "Get") {
        return Promise.resolve({
          Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 0 },
        });
      }
      if (cmd._type === "TransactWrite") {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    await syncToShopTable(createMockEvent());

    // Verify start log
    expect(infoSpy).toHaveBeenCalledWith(
      "Sync started",
      expect.objectContaining({ recordCount: 1 }),
    );

    // Verify completion log
    expect(infoSpy).toHaveBeenCalledWith(
      "Sync completed",
      expect.objectContaining({
        added: 1,
        updated: 0,
        skipped: 0,
        errored: 0,
        totalProcessed: 1,
      }),
    );

    infoSpy.mockRestore();
  });
});
