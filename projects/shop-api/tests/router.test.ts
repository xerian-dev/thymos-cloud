import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/routes/list-accounts.js", () => ({
  listAccounts: vi.fn(() => Promise.resolve({ statusCode: 200, body: "list" })),
}));

vi.mock("../src/routes/next-number.js", () => ({
  nextNumber: vi.fn(() =>
    Promise.resolve({ statusCode: 200, body: '{"nextNumber":1}' }),
  ),
}));

vi.mock("../src/routes/create-account.js", () => ({
  createAccount: vi.fn(() =>
    Promise.resolve({ statusCode: 201, body: "created" }),
  ),
}));

import { routeRequest } from "../src/router.js";
import { listAccounts } from "../src/routes/list-accounts.js";
import { nextNumber } from "../src/routes/next-number.js";
import { createAccount } from "../src/routes/create-account.js";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

function makeEvent(routeKey: string): APIGatewayProxyEventV2 {
  return { routeKey } as unknown as APIGatewayProxyEventV2;
}

describe("router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches GET /api/accounts to listAccounts", async () => {
    const event = makeEvent("GET /api/accounts");
    const result = await routeRequest(event);

    expect(listAccounts).toHaveBeenCalledWith(event);
    expect(result.statusCode).toBe(200);
  });

  it("dispatches GET /api/accounts/next-number to nextNumber", async () => {
    const event = makeEvent("GET /api/accounts/next-number");
    const result = await routeRequest(event);

    expect(nextNumber).toHaveBeenCalledWith(event);
    expect(result.statusCode).toBe(200);
  });

  it("dispatches POST /api/accounts to createAccount", async () => {
    const event = makeEvent("POST /api/accounts");
    const result = await routeRequest(event);

    expect(createAccount).toHaveBeenCalledWith(event);
    expect(result.statusCode).toBe(201);
  });

  it("returns 404 for unknown routeKey", async () => {
    const event = makeEvent("DELETE /api/accounts");
    const result = await routeRequest(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string)).toEqual({
      error: "not_found",
    });
  });
});
