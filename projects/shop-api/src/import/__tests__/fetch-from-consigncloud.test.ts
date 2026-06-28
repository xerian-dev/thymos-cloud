import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetConsignCloudApiKey = vi.hoisted(() => vi.fn());
const mockFetchAllAccounts = vi.hoisted(() => vi.fn());
const mockWriteImportedAccounts = vi.hoisted(() => vi.fn());
const mockWriteSummaryRecord = vi.hoisted(() => vi.fn());
const mockCreateRateLimiter = vi.hoisted(() => vi.fn());

vi.mock("../ssm-client", () => ({
  getConsignCloudApiKey: mockGetConsignCloudApiKey,
}));

vi.mock("../consigncloud-client", () => ({
  fetchAllAccounts: mockFetchAllAccounts,
}));

vi.mock("../import-table-client", () => ({
  writeImportedAccounts: mockWriteImportedAccounts,
  writeSummaryRecord: mockWriteSummaryRecord,
}));

vi.mock("../rate-limiter", () => ({
  createRateLimiter: mockCreateRateLimiter,
}));

import { fetchFromConsignCloud } from "../fetch-from-consigncloud";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

function createMockEvent(): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      http: { method: "POST", path: "/api/import/fetch" },
    },
  } as unknown as APIGatewayProxyEventV2;
}

describe("fetch-from-consigncloud", () => {
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

  it("returns 200 with correct counts on successful fetch with multiple pages", async () => {
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

    const result = await fetchFromConsignCloud(createMockEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.status).toBe("success");
    expect(body.totalFetched).toBe(3);
    expect(body.skipped).toBe(1);
    expect(body.stored).toBe(2);
    expect(body.timestamp).toBeDefined();

    expect(mockWriteImportedAccounts).toHaveBeenCalledOnce();
    expect(mockWriteSummaryRecord).toHaveBeenCalledOnce();
  });

  it("returns 200 with zero counts when account set is empty", async () => {
    mockGetConsignCloudApiKey.mockResolvedValue("test-api-key");
    mockFetchAllAccounts.mockResolvedValue({
      accounts: [],
      skipped: 0,
    });
    mockWriteImportedAccounts.mockResolvedValue(undefined);
    mockWriteSummaryRecord.mockResolvedValue(undefined);

    const result = await fetchFromConsignCloud(createMockEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.status).toBe("success");
    expect(body.totalFetched).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.stored).toBe(0);
  });

  it("returns 500 with descriptive error when SSM retrieval fails", async () => {
    mockGetConsignCloudApiKey.mockRejectedValue(
      new Error("SSM parameter not found at path: /test/path/api-key"),
    );

    const result = await fetchFromConsignCloud(createMockEvent());

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body as string);
    expect(body.status).toBe("error");
    expect(body.message).toContain("Import fetch failed");
    expect(body.message).toContain("SSM parameter not found");
  });

  it("logs at start and end of successful execution", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

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
          balance: 50,
          email_notifications_enabled: true,
          created: "2024-01-01T00:00:00Z",
        },
      ],
      skipped: 0,
    });
    mockWriteImportedAccounts.mockResolvedValue(undefined);
    mockWriteSummaryRecord.mockResolvedValue(undefined);

    await fetchFromConsignCloud(createMockEvent());

    expect(infoSpy).toHaveBeenCalledWith(
      "ConsignCloud import: starting fetch operation",
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "ConsignCloud import: fetch operation completed",
      expect.objectContaining({
        totalFetched: 1,
        skipped: 0,
        stored: 1,
      }),
    );

    infoSpy.mockRestore();
  });

  it("logs error on failed execution", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockGetConsignCloudApiKey.mockRejectedValue(
      new Error("Connection refused"),
    );

    await fetchFromConsignCloud(createMockEvent());

    expect(errorSpy).toHaveBeenCalledWith(
      "ConsignCloud import: fetch operation failed",
      expect.objectContaining({
        error: "Connection refused",
      }),
    );

    errorSpy.mockRestore();
  });
});
