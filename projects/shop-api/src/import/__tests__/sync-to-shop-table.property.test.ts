import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as fc from "fast-check";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type {
  ImportedAccountRecord,
  ImportReport,
} from "../import-table-client";

/**
 * Feature: consigncloud-import, Property 8: Sync continues processing after individual record failures
 * Validates: Requirements 3.7
 */
describe("Property 8: Sync continues processing after individual record failures", () => {
  let capturedReport: ImportReport | null = null;
  let syncToShopTable: (
    event: APIGatewayProxyEventV2,
  ) => Promise<APIGatewayProxyResultV2>;

  beforeEach(() => {
    capturedReport = null;
    vi.resetModules();

    process.env.TABLE_NAME = "test-shop-table";
    process.env.IMPORT_TABLE_NAME = "test-import-table";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TABLE_NAME;
    delete process.env.IMPORT_TABLE_NAME;
  });

  const minimalEvent: APIGatewayProxyEventV2 = {
    version: "2.0",
    routeKey: "POST /api/import/sync",
    rawPath: "/api/import/sync",
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123456789012",
      apiId: "api-id",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "POST",
        path: "/api/import/sync",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-id",
      routeKey: "POST /api/import/sync",
      stage: "$default",
      time: "01/Jan/2024:00:00:00 +0000",
      timeEpoch: 1704067200000,
    },
    isBase64Encoded: false,
  };

  function makeRecord(id: string, index: number): ImportedAccountRecord {
    return {
      PK: `IMPORT#CONSIGNCLOUD#${id}`,
      SK: "METADATA",
      id,
      number: String(index).padStart(6, "0"),
      first_name: `First${index}`,
      last_name: `Last${index}`,
      company: `Company${index}`,
      email: `user${index}@example.com`,
      balance: 0,
      email_notifications_enabled: true,
      created: "2024-01-01T00:00:00.000Z",
      importedAt: "2024-06-01T00:00:00.000Z",
    };
  }

  it("all N records are attempted, errored = K, added + updated + skipped + errored = N", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 10 }),
        async (totalCount: number, failCount: number) => {
          const K = Math.min(failCount, totalCount);
          const N = totalCount;

          capturedReport = null;
          vi.resetModules();

          // Generate N records; first K will be set to error
          const records: ImportedAccountRecord[] = [];
          const errorIds = new Set<string>();
          for (let i = 0; i < N; i++) {
            const id = `id-${i}-${crypto.randomUUID().slice(0, 8)}`;
            records.push(makeRecord(id, i + 1));
            if (i < K) {
              errorIds.add(id);
            }
          }

          // Mock import-table-client
          vi.doMock("../import-table-client", () => ({
            scanImportedAccounts: vi.fn(async () => records),
            writeSyncReport: vi.fn(async (report: ImportReport) => {
              capturedReport = report;
            }),
          }));

          // Mock docClient.send to control behavior per record
          vi.doMock("../../dynamodb-client", () => ({
            docClient: {
              send: vi.fn(async (command: unknown) => {
                const cmd = command as { input?: Record<string, unknown> };

                // GetCommand for sequence counter (at end of sync)
                if (
                  cmd.input &&
                  "Key" in cmd.input &&
                  (cmd.input.Key as Record<string, string>)?.PK ===
                    "SEQUENCE#ACCOUNT"
                ) {
                  return {
                    Item: {
                      PK: "SEQUENCE#ACCOUNT",
                      SK: "COUNTER",
                      value: 0,
                    },
                  };
                }

                // QueryCommand on sourceId-index (findBySourceId)
                if (
                  cmd.input &&
                  "IndexName" in cmd.input &&
                  cmd.input.IndexName === "sourceId-index"
                ) {
                  const exprValues = cmd.input.ExpressionAttributeValues as
                    | Record<string, string>
                    | undefined;
                  const sourceIdValue = exprValues?.[":sourceId"];

                  if (sourceIdValue && errorIds.has(sourceIdValue)) {
                    throw new Error(`Simulated error for ${sourceIdValue}`);
                  }

                  // Not found → will add
                  return { Items: [], LastEvaluatedKey: undefined };
                }

                // QueryCommand for TAG# items (begins_with on SK)
                if (
                  cmd.input &&
                  "KeyConditionExpression" in cmd.input &&
                  (cmd.input.KeyConditionExpression as string)?.includes(
                    "begins_with",
                  )
                ) {
                  return { Items: [] };
                }

                // PutCommand / UpdateCommand → success
                return {};
              }),
            },
            TABLE_NAME: "test-shop-table",
          }));

          const mod = await import("../sync-to-shop-table");
          syncToShopTable = mod.syncToShopTable;

          await syncToShopTable(minimalEvent);

          expect(capturedReport).not.toBeNull();
          const report = capturedReport!;

          // errored equals K
          expect(report.errored).toBe(K);

          // Total outcomes equal N
          expect(
            report.added + report.updated + report.skipped + report.errored,
          ).toBe(N);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: consigncloud-import, Property 9: Sync report accurately aggregates outcomes
 * Validates: Requirements 4.1, 4.2
 */
describe("Property 9: Sync report accurately aggregates outcomes", () => {
  let capturedReport: ImportReport | null = null;
  let syncToShopTable: (
    event: APIGatewayProxyEventV2,
  ) => Promise<APIGatewayProxyResultV2>;

  beforeEach(() => {
    capturedReport = null;
    vi.resetModules();

    process.env.TABLE_NAME = "test-shop-table";
    process.env.IMPORT_TABLE_NAME = "test-import-table";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TABLE_NAME;
    delete process.env.IMPORT_TABLE_NAME;
  });

  const minimalEvent: APIGatewayProxyEventV2 = {
    version: "2.0",
    routeKey: "POST /api/import/sync",
    rawPath: "/api/import/sync",
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123456789012",
      apiId: "api-id",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "POST",
        path: "/api/import/sync",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-id",
      routeKey: "POST /api/import/sync",
      stage: "$default",
      time: "01/Jan/2024:00:00:00 +0000",
      timeEpoch: 1704067200000,
    },
    isBase64Encoded: false,
  };

  function makeRecord(id: string, index: number): ImportedAccountRecord {
    return {
      PK: `IMPORT#CONSIGNCLOUD#${id}`,
      SK: "METADATA",
      id,
      number: String(index).padStart(6, "0"),
      first_name: `First${index}`,
      last_name: `Last${index}`,
      company: `Company${index}`,
      email: `user${index}@example.com`,
      balance: 0,
      email_notifications_enabled: true,
      created: "2024-01-01T00:00:00.000Z",
      importedAt: "2024-06-01T00:00:00.000Z",
    };
  }

  it("report fields match counts: added=A, updated=U, skipped=S, errored=E, errors has E entries with valid consignCloudId and non-empty message", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 8 }),
        async (A: number, U: number, S: number, E: number) => {
          const total = A + U + S + E;
          if (total === 0) return; // Skip empty case

          capturedReport = null;
          vi.resetModules();

          // Build records: first A are "to add", next U are "to update",
          // next S are "to skip", last E are "to error"
          const records: ImportedAccountRecord[] = [];
          const addIds = new Set<string>();
          const updateIds = new Set<string>();
          const skipIds = new Set<string>();
          const errorIds = new Set<string>();

          let idx = 1;
          for (let i = 0; i < A; i++) {
            const id = `add-${i}-${crypto.randomUUID().slice(0, 8)}`;
            records.push(makeRecord(id, idx++));
            addIds.add(id);
          }
          for (let i = 0; i < U; i++) {
            const id = `upd-${i}-${crypto.randomUUID().slice(0, 8)}`;
            records.push(makeRecord(id, idx++));
            updateIds.add(id);
          }
          for (let i = 0; i < S; i++) {
            const id = `skip-${i}-${crypto.randomUUID().slice(0, 8)}`;
            records.push(makeRecord(id, idx++));
            skipIds.add(id);
          }
          for (let i = 0; i < E; i++) {
            const id = `err-${i}-${crypto.randomUUID().slice(0, 8)}`;
            records.push(makeRecord(id, idx++));
            errorIds.add(id);
          }

          // Mock import-table-client
          vi.doMock("../import-table-client", () => ({
            scanImportedAccounts: vi.fn(async () => records),
            writeSyncReport: vi.fn(async (report: ImportReport) => {
              capturedReport = report;
            }),
          }));

          // Mock docClient.send to simulate different outcomes per record
          vi.doMock("../../dynamodb-client", () => ({
            docClient: {
              send: vi.fn(async (command: unknown) => {
                const cmd = command as { input?: Record<string, unknown> };

                // GetCommand for sequence counter (at end of sync)
                if (
                  cmd.input &&
                  "Key" in cmd.input &&
                  (cmd.input.Key as Record<string, string>)?.PK ===
                    "SEQUENCE#ACCOUNT"
                ) {
                  return {
                    Item: {
                      PK: "SEQUENCE#ACCOUNT",
                      SK: "COUNTER",
                      value: 999999,
                    },
                  };
                }

                // QueryCommand on sourceId-index (findBySourceId)
                if (
                  cmd.input &&
                  "IndexName" in cmd.input &&
                  cmd.input.IndexName === "sourceId-index"
                ) {
                  const exprValues = cmd.input.ExpressionAttributeValues as
                    | Record<string, string>
                    | undefined;
                  const sourceIdValue = exprValues?.[":sourceId"];

                  if (sourceIdValue && errorIds.has(sourceIdValue)) {
                    throw new Error(`Simulated error for ${sourceIdValue}`);
                  }

                  if (sourceIdValue && addIds.has(sourceIdValue)) {
                    // Not found → will trigger add path
                    return { Items: [], LastEvaluatedKey: undefined };
                  }

                  if (sourceIdValue && updateIds.has(sourceIdValue)) {
                    // Found with different fields → will trigger update path
                    return {
                      Items: [
                        {
                          PK: "ACCOUNT#000001",
                          SK: "METADATA",
                          name: "DifferentName",
                          company: "DifferentCompany",
                          street: "DifferentStreet",
                          place: "DifferentPlace",
                          postcode: "99999",
                          canton: "ZZ",
                          email: "different@example.com",
                          telephone: "0000000000",
                          sourceId: sourceIdValue,
                        },
                      ],
                      LastEvaluatedKey: undefined,
                    };
                  }

                  if (sourceIdValue && skipIds.has(sourceIdValue)) {
                    // Find the record to get matching mapped fields
                    const rec = records.find((r) => r.id === sourceIdValue);
                    if (rec) {
                      const mappedName =
                        `${rec.first_name} ${rec.last_name}`.trim();
                      return {
                        Items: [
                          {
                            PK: "ACCOUNT#000002",
                            SK: "METADATA",
                            name: mappedName,
                            company: rec.company,
                            street: "",
                            place: "",
                            postcode: "",
                            canton: "",
                            email: rec.email,
                            telephone: "",
                            sourceId: sourceIdValue,
                          },
                        ],
                        LastEvaluatedKey: undefined,
                      };
                    }
                  }

                  return { Items: [], LastEvaluatedKey: undefined };
                }

                // QueryCommand for TAG# items (used for change detection and tag replacement)
                if (
                  cmd.input &&
                  "KeyConditionExpression" in cmd.input &&
                  (cmd.input.KeyConditionExpression as string)?.includes(
                    "begins_with",
                  )
                ) {
                  // For skip records, return tags that match what deriveImportTags would produce
                  // emailNotificationsEnabled=true → ["email_notification"]
                  // (no phone so no text_notification)
                  const exprValues = cmd.input.ExpressionAttributeValues as
                    | Record<string, string>
                    | undefined;
                  const pk = exprValues?.[":pk"];

                  // Skip records have PK "ACCOUNT#000002"
                  if (pk === "ACCOUNT#000002") {
                    return {
                      Items: [
                        {
                          PK: "ACCOUNT#000002",
                          SK: "TAG#email_notification",
                          tag: "email_notification",
                        },
                      ],
                    };
                  }

                  return { Items: [] };
                }

                // PutCommand / UpdateCommand / DeleteCommand → success
                return {};
              }),
            },
            TABLE_NAME: "test-shop-table",
          }));

          const mod = await import("../sync-to-shop-table");
          syncToShopTable = mod.syncToShopTable;

          await syncToShopTable(minimalEvent);

          expect(capturedReport).not.toBeNull();
          const report = capturedReport!;

          // Verify report fields match expected counts
          expect(report.added).toBe(A);
          expect(report.updated).toBe(U);
          expect(report.skipped).toBe(S);
          expect(report.errored).toBe(E);

          // Verify errors array has exactly E entries
          expect(report.errors).toHaveLength(E);

          // Each error entry has a valid consignCloudId and non-empty message
          for (const err of report.errors) {
            expect(err.consignCloudId).toBeTruthy();
            expect(typeof err.consignCloudId).toBe("string");
            expect(err.consignCloudId.length).toBeGreaterThan(0);
            expect(err.message).toBeTruthy();
            expect(typeof err.message).toBe("string");
            expect(err.message.length).toBeGreaterThan(0);
          }

          // Verify each error's consignCloudId corresponds to one of the error records
          for (const err of report.errors) {
            expect(errorIds.has(err.consignCloudId)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
