import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as fc from "fast-check";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type { FetchResult } from "../import-table-client";
import type { ConsignCloudAccount } from "../field-mapper";

/**
 * Feature: consigncloud-import, Property 5: Import summary counts are accurate
 * Validates: Requirements 2.5
 */
describe("Property 5: Import summary counts are accurate", () => {
  let capturedSummary: FetchResult | null = null;
  let fetchFromConsignCloud: (
    event: APIGatewayProxyEventV2,
  ) => Promise<APIGatewayProxyResultV2>;

  beforeEach(() => {
    capturedSummary = null;
    vi.resetModules();

    process.env.CONSIGNCLOUD_BASE_URL = "https://api.example.com/api/v1";
    process.env.SSM_API_KEY_PATH = "/test/env/consigncloud-api-key";
    process.env.IMPORT_TABLE_NAME = "test-import-table";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CONSIGNCLOUD_BASE_URL;
    delete process.env.SSM_API_KEY_PATH;
    delete process.env.IMPORT_TABLE_NAME;
  });

  const consignCloudAccountArb: fc.Arbitrary<ConsignCloudAccount> = fc.record({
    id: fc.uuid(),
    number: fc.string({ minLength: 1, maxLength: 20 }),
    first_name: fc.string({ minLength: 1, maxLength: 30 }),
    last_name: fc.string({ minLength: 1, maxLength: 30 }),
    company: fc.string({ minLength: 0, maxLength: 50 }),
    email: fc.emailAddress(),
    balance: fc.double({ min: -10000, max: 10000, noNaN: true }),
    email_notifications_enabled: fc.boolean(),
    created: fc
      .integer({ min: 946684800000, max: 1924905600000 })
      .map((ms: number) => new Date(ms).toISOString()),
    deleted: fc.constant(undefined),
  });

  const minimalEvent: APIGatewayProxyEventV2 = {
    version: "2.0",
    routeKey: "POST /api/import/fetch",
    rawPath: "/api/import/fetch",
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123456789012",
      apiId: "api-id",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "POST",
        path: "/api/import/fetch",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-id",
      routeKey: "POST /api/import/fetch",
      stage: "$default",
      time: "01/Jan/2024:00:00:00 +0000",
      timeEpoch: 1704067200000,
    },
    isBase64Encoded: false,
  };

  it("summary has totalFetched = stored + skipped, stored = W, skipped = S, and W = N - S", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 50 }),
        fc.array(consignCloudAccountArb, { minLength: 0, maxLength: 20 }),
        async (
          storedCount: number,
          skippedCount: number,
          templateAccounts: ConsignCloudAccount[],
        ) => {
          capturedSummary = null;
          vi.resetModules();

          // Build a list of `storedCount` accounts by cycling through template
          const storedAccounts: ConsignCloudAccount[] = [];
          for (let i = 0; i < storedCount; i++) {
            const template =
              templateAccounts.length > 0
                ? templateAccounts[i % templateAccounts.length]
                : {
                    id: `id-${i}`,
                    number: `num-${i}`,
                    first_name: "First",
                    last_name: "Last",
                    company: "Co",
                    email: "a@b.com",
                    balance: 0,
                    email_notifications_enabled: true,
                    created: "2024-01-01T00:00:00.000Z",
                    deleted: undefined,
                  };
            storedAccounts.push({ ...template, id: `stored-${i}` });
          }

          // Mock ssm-client
          vi.doMock("../ssm-client", () => ({
            getConsignCloudApiKey: vi.fn(async () => "test-api-key"),
          }));

          // Mock rate-limiter
          vi.doMock("../rate-limiter", () => ({
            createRateLimiter: vi.fn(() => ({
              acquire: vi.fn(async () => {}),
            })),
          }));

          // Mock consigncloud-client: returns storedAccounts and skippedCount
          vi.doMock("../consigncloud-client", () => ({
            fetchAllAccounts: vi.fn(async () => ({
              accounts: storedAccounts,
              skipped: skippedCount,
            })),
          }));

          // Mock import-table-client: capture writeSummaryRecord call
          vi.doMock("../import-table-client", () => ({
            writeImportedAccounts: vi.fn(async () => {}),
            writeSummaryRecord: vi.fn(async (summary: FetchResult) => {
              capturedSummary = summary;
            }),
          }));

          const mod = await import("../fetch-from-consigncloud");
          fetchFromConsignCloud = mod.fetchFromConsignCloud;

          const response = await fetchFromConsignCloud(minimalEvent);

          expect((response as { statusCode: number }).statusCode).toBe(200);
          expect(capturedSummary).not.toBeNull();

          const summary = capturedSummary!;

          // totalFetched = stored + skipped (N = W + S)
          expect(summary.totalFetched).toBe(storedCount + skippedCount);

          // stored equals the number of accounts written
          expect(summary.stored).toBe(storedCount);

          // skipped equals the skipped count from fetchAllAccounts
          expect(summary.skipped).toBe(skippedCount);

          // W = N - S (stored = totalFetched - skipped)
          expect(summary.stored).toBe(summary.totalFetched - summary.skipped);
        },
      ),
      { numRuns: 100 },
    );
  });
});
