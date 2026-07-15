import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Hoisted mocks ---
const mockGetConsignCloudApiKey = vi.hoisted(() => vi.fn());
const mockFetchAllAccounts = vi.hoisted(() => vi.fn());
const mockWriteImportedAccounts = vi.hoisted(() => vi.fn());
const mockWriteSummaryRecord = vi.hoisted(() => vi.fn());
const mockCreateRateLimiter = vi.hoisted(() => vi.fn());
const mockScanImportedAccounts = vi.hoisted(() => vi.fn());
const mockWriteSyncReport = vi.hoisted(() => vi.fn());
const mockDocClientSend = vi.hoisted(() => vi.fn());
const mockSfnSend = vi.hoisted(() => vi.fn());

// --- Module mocks ---
vi.mock("../ssm-client", () => ({
  getConsignCloudApiKey: mockGetConsignCloudApiKey,
}));

vi.mock("../consigncloud-client", () => ({
  fetchAllAccounts: mockFetchAllAccounts,
}));

vi.mock("../import-table-client", () => ({
  writeImportedAccounts: mockWriteImportedAccounts,
  writeSummaryRecord: mockWriteSummaryRecord,
  scanImportedAccounts: mockScanImportedAccounts,
  writeSyncReport: mockWriteSyncReport,
}));

vi.mock("../rate-limiter", () => ({
  createRateLimiter: mockCreateRateLimiter,
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

vi.mock("@aws-sdk/client-sfn", () => ({
  SFNClient: class MockSFNClient {
    send(...args: unknown[]) {
      return mockSfnSend(...args);
    }
  },
  StartExecutionCommand: class MockStartExecutionCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

import { fetchAccountsInternal } from "../fetch-from-consigncloud";
import { fetchFromConsignCloud } from "../fetch-from-consigncloud";
import { syncAccountsInternal } from "../sync-to-shop-table";
import { syncToShopTable } from "../sync-to-shop-table";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { ImportedAccountRecord } from "../import-table-client";

function createMockEvent(): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      http: { method: "POST", path: "/api/import/fetch" },
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

describe("fetchAccountsInternal", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CONSIGNCLOUD_BASE_URL: "https://api.consigncloud.com/api/v1",
    };
    mockCreateRateLimiter.mockReturnValue({
      acquire: () => Promise.resolve(),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns success with report on successful fetch", async () => {
    mockGetConsignCloudApiKey.mockResolvedValue("test-api-key");
    mockFetchAllAccounts.mockResolvedValue({
      accounts: [
        {
          id: "acc-1",
          number: "001",
          first_name: "Alice",
          last_name: "Smith",
          company: "ACME",
          email: "alice@example.com",
          balance: 100,
          email_notifications_enabled: true,
          created: "2024-01-01T00:00:00Z",
        },
        {
          id: "acc-2",
          number: "002",
          first_name: "Bob",
          last_name: "Jones",
          company: "Widgets",
          email: "bob@example.com",
          balance: 200,
          email_notifications_enabled: false,
          created: "2024-01-02T00:00:00Z",
        },
      ],
      skipped: 1,
    });
    mockWriteImportedAccounts.mockResolvedValue(undefined);
    mockWriteSummaryRecord.mockResolvedValue(undefined);

    const result = await fetchAccountsInternal();

    expect(result.success).toBe(true);
    expect(result.report).toBeDefined();
    expect(result.report!.added).toBe(2);
    expect(result.report!.skipped).toBe(1);
    expect(result.report!.stored).toBe(2);
    expect(result.report!.timestamp).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("throws when getConsignCloudApiKey fails (auth failure)", async () => {
    mockGetConsignCloudApiKey.mockRejectedValue(
      new Error("SSM parameter not found"),
    );

    await expect(fetchAccountsInternal()).rejects.toThrow(
      "SSM parameter not found",
    );
  });
});

describe("syncAccountsInternal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteSyncReport.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success with report when records are processed", async () => {
    const record = createImportedRecord();
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
            Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 5000 },
          });
        }
        return Promise.resolve({});
      },
    );

    const result = await syncAccountsInternal();

    expect(result.success).toBe(true);
    expect(result.report).toBeDefined();
    expect(result.report!.added).toBe(1);
    expect(result.report!.updated).toBe(0);
    expect(result.report!.skipped).toBe(0);
    expect(result.report!.errored).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("returns failure when scanImportedAccounts throws (catastrophic failure)", async () => {
    mockScanImportedAccounts.mockRejectedValue(
      new Error("DynamoDB service unavailable"),
    );

    const result = await syncAccountsInternal();

    expect(result.success).toBe(false);
    expect(result.error).toBe("DynamoDB service unavailable");
    expect(result.report).toBeUndefined();
  });
});

describe("startStepFunctionForSync", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = {
      ...originalEnv,
      STATE_MACHINE_ARN:
        "arn:aws:states:us-east-1:123456789012:stateMachine:test-loop",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("includes createdAfter in payload when provided", async () => {
    mockSfnSend.mockResolvedValue({
      executionArn:
        "arn:aws:states:us-east-1:123456789012:execution:test-loop:run-1",
    });

    const { startStepFunctionForSync } = await import(
      "../step-function-starter"
    );

    const arn = await startStepFunctionForSync({
      jobId: "job-123",
      phase: "fetch",
      type: "item",
      createdAfter: "2025-01-15T10:30:00.000Z",
    });

    expect(mockSfnSend).toHaveBeenCalledOnce();
    const call = mockSfnSend.mock.calls[0][0] as { input: { input: string } };
    const payload = JSON.parse(call.input.input);

    expect(payload.createdAfter).toBe("2025-01-15T10:30:00.000Z");
    expect(payload.action).toBe("resume-internal");
    expect(payload.jobId).toBe("job-123");
    expect(payload.phase).toBe("fetch");
    expect(payload.type).toBe("item");
    expect(arn).toBe(
      "arn:aws:states:us-east-1:123456789012:execution:test-loop:run-1",
    );
  });

  it("omits createdAfter from payload when undefined", async () => {
    mockSfnSend.mockResolvedValue({
      executionArn:
        "arn:aws:states:us-east-1:123456789012:execution:test-loop:run-2",
    });

    const { startStepFunctionForSync } = await import(
      "../step-function-starter"
    );

    const arn = await startStepFunctionForSync({
      jobId: "job-456",
      phase: "fetch",
      type: "sale",
    });

    expect(mockSfnSend).toHaveBeenCalledOnce();
    const call = mockSfnSend.mock.calls[0][0] as { input: { input: string } };
    const payload = JSON.parse(call.input.input);

    expect(payload).not.toHaveProperty("createdAfter");
    expect(payload.action).toBe("resume-internal");
    expect(payload.jobId).toBe("job-456");
    expect(payload.phase).toBe("fetch");
    expect(payload.type).toBe("sale");
    expect(arn).toBe(
      "arn:aws:states:us-east-1:123456789012:execution:test-loop:run-2",
    );
  });

  it("returns the execution ARN string", async () => {
    const expectedArn =
      "arn:aws:states:us-east-1:123456789012:execution:test-loop:run-3";
    mockSfnSend.mockResolvedValue({ executionArn: expectedArn });

    const { startStepFunctionForSync } = await import(
      "../step-function-starter"
    );

    const result = await startStepFunctionForSync({
      jobId: "job-789",
      phase: "fetch",
      type: "item",
      createdAfter: "2025-06-01T00:00:00.000Z",
    });

    expect(result).toBe(expectedArn);
  });
});

describe("fetchFromConsignCloud HTTP handler compatibility", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CONSIGNCLOUD_BASE_URL: "https://api.consigncloud.com/api/v1",
    };
    mockCreateRateLimiter.mockReturnValue({
      acquire: () => Promise.resolve(),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns statusCode 200 with JSON body on success", async () => {
    mockGetConsignCloudApiKey.mockResolvedValue("test-api-key");
    mockFetchAllAccounts.mockResolvedValue({
      accounts: [
        {
          id: "acc-1",
          number: "001",
          first_name: "Alice",
          last_name: "Smith",
          company: "ACME",
          email: "alice@example.com",
          balance: 100,
          email_notifications_enabled: true,
          created: "2024-01-01T00:00:00Z",
        },
      ],
      skipped: 0,
    });
    mockWriteImportedAccounts.mockResolvedValue(undefined);
    mockWriteSummaryRecord.mockResolvedValue(undefined);

    const result = (await fetchFromConsignCloud(
      createMockEvent(),
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(200);
    expect(result.headers).toHaveProperty("Content-Type", "application/json");
    const body = JSON.parse(result.body as string);
    expect(body.status).toBe("success");
    expect(body.totalFetched).toBe(1);
    expect(body.stored).toBe(1);
  });
});

describe("syncToShopTable HTTP handler compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteSyncReport.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns statusCode 200 with JSON body on success", async () => {
    mockScanImportedAccounts.mockResolvedValue([createImportedRecord()]);

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
            Item: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER", value: 5000 },
          });
        }
        return Promise.resolve({});
      },
    );

    const event = {
      requestContext: { http: { method: "POST", path: "/api/import/sync" } },
    } as unknown as APIGatewayProxyEventV2;

    const result = (await syncToShopTable(
      event,
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(200);
    expect(result.headers).toHaveProperty("Content-Type", "application/json");
    const body = JSON.parse(result.body as string);
    expect(body.added).toBe(1);
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.errored).toBe(0);
  });

  it("returns statusCode 500 with error on catastrophic failure", async () => {
    mockScanImportedAccounts.mockRejectedValue(
      new Error("DynamoDB service unavailable"),
    );

    const event = {
      requestContext: { http: { method: "POST", path: "/api/import/sync" } },
    } as unknown as APIGatewayProxyEventV2;

    const result = (await syncToShopTable(
      event,
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(500);
    expect(result.headers).toHaveProperty("Content-Type", "application/json");
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe("DynamoDB service unavailable");
  });
});
