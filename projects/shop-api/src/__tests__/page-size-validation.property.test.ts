import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("../dynamodb-client", () => ({
  docClient: { send: mockSend },
  TABLE_NAME: "test-table",
}));

import { listSales, ALLOWED_PAGE_SIZES } from "../routes/list-sales";

function buildEvent(pageSize?: string): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/sales",
    rawPath: "/api/sales",
    rawQueryString: pageSize ? `pageSize=${pageSize}` : "",
    headers: {},
    queryStringParameters: pageSize !== undefined ? { pageSize } : undefined,
    isBase64Encoded: false,
    requestContext: {} as unknown,
    body: null,
    pathParameters: null,
    stageVariables: null,
    version: "2.0",
  } as unknown as APIGatewayProxyEventV2;
}

/**
 * Feature: sales-backend-api, Property 2: Page size validation
 * Validates: Requirements 1.2, 1.4
 */
describe("Feature: sales-backend-api, Property 2: Page size validation", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ Items: [], Count: 0 });
  });

  it("accepts only values in {20, 50, 100}", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...ALLOWED_PAGE_SIZES), async (size) => {
        const event = buildEvent(String(size));
        const result = (await listSales(
          event,
        )) as APIGatewayProxyStructuredResultV2;
        expect(result.statusCode).not.toBe(400);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects any integer not in {20, 50, 100}", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer().filter((n) => ![20, 50, 100].includes(n)),
        async (n) => {
          const event = buildEvent(String(n));
          const result = (await listSales(
            event,
          )) as APIGatewayProxyStructuredResultV2;
          expect(result.statusCode).toBe(400);
          const body = JSON.parse(result.body as string);
          expect(body.error).toBe("pageSize must be one of 20, 50, 100");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects any non-numeric string", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => isNaN(Number(s))),
        async (s) => {
          const event = buildEvent(s);
          const result = (await listSales(
            event,
          )) as APIGatewayProxyStructuredResultV2;
          expect(result.statusCode).toBe(400);
        },
      ),
      { numRuns: 100 },
    );
  });
});
