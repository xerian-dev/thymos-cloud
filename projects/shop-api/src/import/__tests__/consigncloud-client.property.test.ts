import { describe, it, expect, vi, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  fetchAllAccounts,
  type ConsignCloudClientConfig,
  type ConsignCloudAccount,
} from "../consigncloud-client";
import { createRateLimiter } from "../rate-limiter";

/**
 * Feature: consigncloud-import, Property 1: Pagination follows cursors until termination
 * Validates: Requirements 1.3, 1.4
 */
describe("Property 1: Pagination follows cursors until termination", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("makes exactly N requests where N equals the number of pages until null cursor", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }).chain((numPages) =>
          fc.tuple(
            fc.constant(numPages),
            fc.array(
              fc.record({
                id: fc.uuid(),
                number: fc.string({ minLength: 1, maxLength: 10 }),
                first_name: fc.string({ minLength: 1, maxLength: 20 }),
                last_name: fc.string({ minLength: 1, maxLength: 20 }),
                company: fc.string({ minLength: 0, maxLength: 30 }),
                email: fc.emailAddress(),
                balance: fc.double({ min: 0, max: 10000, noNaN: true }),
                email_notifications_enabled: fc.boolean(),
                created: fc
                  .integer({ min: 946684800000, max: 1924905600000 })
                  .map((ms: number) => new Date(ms).toISOString()),
                deleted: fc.constant(undefined),
              }),
              { minLength: 1, maxLength: 5 },
            ),
          ),
        ),
        async ([numPages, accountTemplate]) => {
          const cursors: string[] = [];
          for (let i = 0; i < numPages - 1; i++) {
            cursors.push(`cursor-${i}`);
          }

          let requestCount = 0;
          const receivedCursors: (string | null)[] = [];

          const mockFetch = vi.fn(async (url: string) => {
            requestCount++;
            const parsedUrl = new URL(url);
            const cursor = parsedUrl.searchParams.get("cursor");
            receivedCursors.push(cursor);

            const pageIndex = requestCount - 1;
            const nextCursor =
              pageIndex < numPages - 1 ? cursors[pageIndex] : null;

            return new Response(
              JSON.stringify({
                accounts: accountTemplate,
                next_cursor: nextCursor,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          });

          vi.stubGlobal("fetch", mockFetch);

          const config: ConsignCloudClientConfig = {
            apiKey: "test-key",
            baseUrl: "https://api.example.com/api/v1",
            rateLimiter: createRateLimiter({ capacity: 100, drainRate: 10 }),
          };

          await fetchAllAccounts(config);

          // Exactly N requests made
          expect(requestCount).toBe(numPages);

          // First request has no cursor
          expect(receivedCursors[0]).toBeNull();

          // Each subsequent request passes previous page's cursor
          for (let i = 1; i < numPages; i++) {
            expect(receivedCursors[i]).toBe(cursors[i - 1]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: consigncloud-import, Property 3: Soft-deleted accounts are excluded from import
 * Validates: Requirements 1.8
 */
describe("Property 3: Soft-deleted accounts are excluded from import", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("output contains only non-deleted accounts in order, skipped count equals deleted count", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            number: fc.string({ minLength: 1, maxLength: 10 }),
            first_name: fc.string({ minLength: 1, maxLength: 20 }),
            last_name: fc.string({ minLength: 1, maxLength: 20 }),
            company: fc.string({ minLength: 0, maxLength: 30 }),
            email: fc.emailAddress(),
            balance: fc.double({ min: 0, max: 10000, noNaN: true }),
            email_notifications_enabled: fc.boolean(),
            created: fc
              .integer({ min: 946684800000, max: 1924905600000 })
              .map((ms: number) => new Date(ms).toISOString()),
            deleted: fc.oneof(
              fc.constant(undefined),
              fc
                .integer({ min: 946684800000, max: 1924905600000 })
                .map((ms: number) => new Date(ms).toISOString()),
            ),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        async (allAccounts: ConsignCloudAccount[]) => {
          const mockFetch = vi.fn(async () => {
            return new Response(
              JSON.stringify({
                accounts: allAccounts,
                next_cursor: null,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          });

          vi.stubGlobal("fetch", mockFetch);

          const config: ConsignCloudClientConfig = {
            apiKey: "test-key",
            baseUrl: "https://api.example.com/api/v1",
            rateLimiter: createRateLimiter({ capacity: 100, drainRate: 10 }),
          };

          const result = await fetchAllAccounts(config);

          // Expected: only accounts where deleted is null/undefined
          const expectedAccounts = allAccounts.filter((a) => a.deleted == null);
          const deletedCount = allAccounts.filter(
            (a) => a.deleted != null,
          ).length;

          // Output contains exactly the non-deleted accounts
          expect(result.accounts).toHaveLength(expectedAccounts.length);

          // Order is preserved
          for (let i = 0; i < expectedAccounts.length; i++) {
            expect(result.accounts[i].id).toBe(expectedAccounts[i].id);
          }

          // Skipped count equals deleted count
          expect(result.skipped).toBe(deletedCount);

          // Total accounts = non-deleted + deleted
          expect(result.accounts.length + result.skipped).toBe(
            allAccounts.length,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
