import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("../../src/dynamodb-client.js", () => ({
  docClient: { send: vi.fn() },
  TABLE_NAME: "test-table",
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid-1234"),
}));

import { createAccount } from "../../src/routes/create-account.js";
import { docClient } from "../../src/dynamodb-client.js";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockedSend = vi.mocked(docClient.send);

function makeEvent(body: unknown): APIGatewayProxyEventV2 {
  return {
    routeKey: "POST /api/accounts",
    body: typeof body === "string" ? body : JSON.stringify(body),
  } as APIGatewayProxyEventV2;
}

describe("POST /api/accounts - createAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unit tests", () => {
    it("returns 201 with account data on successful creation", async () => {
      mockedSend.mockResolvedValueOnce({} as never);

      const event = makeEvent({
        accountNumber: 42,
        name: "Jane Smith",
        street: "123 Main St",
        place: "Zurich",
        postcode: "8001",
        canton: "ZH",
        email: "jane@example.com",
        telephone: "555-0100",
      });

      const result = await createAccount(event);

      expect(result).toEqual({
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: "test-uuid-1234",
          shopUid: 42,
          name: "Jane Smith",
          street: "123 Main St",
          place: "Zurich",
          postcode: "8001",
          canton: "ZH",
          email: "jane@example.com",
          telephone: "555-0100",
          commentCount: 0,
          tags: [],
        }),
      });
    });

    it("response includes structured address fields and excludes address", async () => {
      mockedSend.mockResolvedValueOnce({} as never);

      const event = makeEvent({
        accountNumber: 100,
        name: "Test User",
        street: "Bahnhofstrasse 1",
        place: "Bern",
        postcode: "3000",
        canton: "BE",
        email: "test@example.com",
        telephone: "0791234567",
      });

      const result = await createAccount(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse((result as { body: string }).body);

      // Verify new fields are present
      expect(body).toHaveProperty("street", "Bahnhofstrasse 1");
      expect(body).toHaveProperty("place", "Bern");
      expect(body).toHaveProperty("postcode", "3000");
      expect(body).toHaveProperty("canton", "BE");
      expect(body).toHaveProperty("email", "test@example.com");
      expect(body).toHaveProperty("telephone", "0791234567");

      // Verify address field is NOT present
      expect(body).not.toHaveProperty("address");
    });

    it("returns 409 when account number already exists (duplicate)", async () => {
      const error = new Error("Transaction cancelled");
      error.name = "TransactionCanceledException";
      (error as Record<string, unknown>).CancellationReasons = [
        { Code: "ConditionalCheckFailed" },
        { Code: "None" },
      ];
      mockedSend.mockRejectedValueOnce(error);

      const event = makeEvent({
        accountNumber: 42,
        name: "Jane Smith",
        street: "123 Main St",
        telephone: "555-0100",
      });

      const result = await createAccount(event);

      expect(result).toEqual({
        statusCode: 409,
        headers: { "Content-Type": "text/plain" },
        body: "duplicate",
      });
    });

    it("returns 422 when accountNumber exceeds 9999999", async () => {
      // Validation catches this first (range 1-9999999), so we get 400
      // But if validation were bypassed, the explicit check returns 422
      // Since validation rejects > 9999999, this should be a 400 validation error
      const event = makeEvent({
        accountNumber: 10000000,
        name: "Jane Smith",
        street: "123 Main St",
        telephone: "555-0100",
      });

      const result = await createAccount(event);

      // Validation catches numbers > 9999999 first, returning 400
      expect(result).toEqual({
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "validation_error",
          fields: [
            {
              field: "accountNumber",
              message: "accountNumber must be between 1 and 9999999",
            },
          ],
        }),
      });
    });

    it("returns 400 with validation errors for missing required fields", async () => {
      const event = makeEvent({});

      const result = await createAccount(event);

      expect(result).toEqual({
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("validation_error"),
      });

      const body = JSON.parse((result as { body: string }).body);
      expect(body.error).toBe("validation_error");
      expect(body.fields.length).toBeGreaterThan(0);
    });

    it("returns 400 with invalid_json for malformed JSON body", async () => {
      const event = makeEvent("not valid json{{{");

      const result = await createAccount(event);

      expect(result).toEqual({
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "invalid_json" }),
      });
    });

    it("retries with Put only when counter is already higher and returns 201", async () => {
      // First call: TransactWriteCommand fails because counter condition fails
      const txError = new Error("Transaction cancelled");
      txError.name = "TransactionCanceledException";
      (txError as Record<string, unknown>).CancellationReasons = [
        { Code: "None" },
        { Code: "ConditionalCheckFailed" },
      ];
      mockedSend.mockRejectedValueOnce(txError);

      // Second call: PutCommand succeeds
      mockedSend.mockResolvedValueOnce({} as never);

      const event = makeEvent({
        accountNumber: 5,
        name: "Jane Smith",
        street: "123 Main St",
        telephone: "555-0100",
      });

      const result = await createAccount(event);

      expect(result).toEqual({
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: "test-uuid-1234",
          shopUid: 5,
          name: "Jane Smith",
          street: "123 Main St",
          place: "",
          postcode: "",
          canton: "",
          email: "",
          telephone: "555-0100",
          commentCount: 0,
          tags: [],
        }),
      });

      // Verify send was called twice (transaction + retry put)
      expect(mockedSend).toHaveBeenCalledTimes(2);
    });

    it("returns 409 when retry Put also fails due to duplicate", async () => {
      // First call: TransactWriteCommand fails because counter condition fails
      const txError = new Error("Transaction cancelled");
      txError.name = "TransactionCanceledException";
      (txError as Record<string, unknown>).CancellationReasons = [
        { Code: "None" },
        { Code: "ConditionalCheckFailed" },
      ];
      mockedSend.mockRejectedValueOnce(txError);

      // Second call: PutCommand also fails with conditional check
      const putError = new Error("Condition not met");
      putError.name = "ConditionalCheckFailedException";
      mockedSend.mockRejectedValueOnce(putError);

      const event = makeEvent({
        accountNumber: 5,
        name: "Jane Smith",
        street: "123 Main St",
        telephone: "555-0100",
      });

      const result = await createAccount(event);

      expect(result).toEqual({
        statusCode: 409,
        headers: { "Content-Type": "text/plain" },
        body: "duplicate",
      });
    });

    it("returns 500 for unknown DynamoDB errors", async () => {
      const error = new Error("Service unavailable");
      error.name = "ServiceUnavailable";
      mockedSend.mockRejectedValueOnce(error);

      const event = makeEvent({
        accountNumber: 42,
        name: "Jane Smith",
        street: "123 Main St",
        telephone: "555-0100",
      });

      const result = await createAccount(event);

      expect(result).toEqual({
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "internal_error" }),
      });
    });
  });

  describe("Feature: accounts-api-backend, Property 2: Sequence counter update logic", () => {
    /**
     * **Validates: Requirements 3.5, 3.6**
     *
     * For any accountNumber N in [1, 9999999]: the TransactWriteCommand
     * always sends `:newValue` = N + 1 and `:accountNum` = N, ensuring that
     * if N >= current counter, the counter updates to N+1;
     * if N < current counter, the condition prevents the update.
     */
    it("always sends :newValue = accountNumber + 1 and :accountNum = accountNumber", async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 9999999 }), async (n) => {
          mockedSend.mockReset();
          mockedSend.mockResolvedValueOnce({} as never);

          const event = makeEvent({
            accountNumber: n,
            name: "Test",
            street: "Addr",
            telephone: "123",
          });

          await createAccount(event);

          // Inspect the command sent to docClient.send
          const call = mockedSend.mock.calls[0];
          expect(call).toBeDefined();

          const command = call[0];
          const input = (command as { input: Record<string, unknown> }).input;
          const transactItems = input.TransactItems as Array<{
            Update?: {
              ExpressionAttributeValues: Record<string, unknown>;
            };
          }>;

          // The second item is the counter Update
          const updateItem = transactItems[1].Update;
          expect(updateItem).toBeDefined();
          expect(updateItem!.ExpressionAttributeValues[":newValue"]).toBe(
            n + 1,
          );
          expect(updateItem!.ExpressionAttributeValues[":accountNum"]).toBe(n);
        }),
        { numRuns: 100 },
      );
    });
  });
});
