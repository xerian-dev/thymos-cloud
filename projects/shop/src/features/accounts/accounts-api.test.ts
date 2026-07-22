import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  fetchAccounts,
  fetchNextAccountNumber,
  createAccount,
} from "./accounts-api";
import type { Account, CreateAccountRequest } from "./accounts-types";

const mockAccount: Account = {
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  accountNumber: 42,
  name: "Jane Smith",
  street: "123 Main St",
  telephone: "555-0100",
  commentCount: 3,
  tags: ["vip", "wholesale"],
};

const validCreateRequest: CreateAccountRequest = {
  accountNumber: 42,
  name: "Jane Smith",
  street: "123 Main St",
  telephone: "555-0100",
};

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchAccounts", () => {
  it("returns accounts array on success", async () => {
    server.use(
      http.get("/api/accounts", () => {
        return HttpResponse.json({ accounts: [mockAccount] });
      }),
    );

    const result = await fetchAccounts();

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toEqual(mockAccount);
  });

  it("throws an error on server error response", async () => {
    server.use(
      http.get("/api/accounts", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(fetchAccounts()).rejects.toThrow(
      "Failed to fetch accounts: 500",
    );
  });
});

describe("fetchNextAccountNumber", () => {
  it("returns the next account number on success", async () => {
    server.use(
      http.get("/api/accounts/next-number", () => {
        return HttpResponse.json({ nextNumber: 43 });
      }),
    );

    const result = await fetchNextAccountNumber();

    expect(result).toBe(43);
  });
});

describe("createAccount", () => {
  it("returns success with the created account", async () => {
    server.use(
      http.post("/api/accounts", () => {
        return HttpResponse.json(mockAccount);
      }),
    );

    const result = await createAccount(validCreateRequest);

    expect(result).toEqual({ success: true, account: mockAccount });
  });

  it("returns duplicate error on 409 response", async () => {
    server.use(
      http.post("/api/accounts", () => {
        return new HttpResponse("duplicate", { status: 409 });
      }),
    );

    const result = await createAccount(validCreateRequest);

    expect(result).toEqual({ success: false, error: "duplicate" });
  });

  it("returns max_reached error on 422 response with max_reached body", async () => {
    server.use(
      http.post("/api/accounts", () => {
        return new HttpResponse("max_reached", { status: 422 });
      }),
    );

    const result = await createAccount(validCreateRequest);

    expect(result).toEqual({ success: false, error: "max_reached" });
  });

  it("returns network error when fetch throws TypeError", async () => {
    server.use(
      http.post("/api/accounts", () => {
        return HttpResponse.error();
      }),
    );

    const result = await createAccount(validCreateRequest);

    expect(result).toEqual({ success: false, error: "network" });
  });

  it("returns server error on 500 response", async () => {
    server.use(
      http.post("/api/accounts", () => {
        return new HttpResponse("Internal Server Error", { status: 500 });
      }),
    );

    const result = await createAccount(validCreateRequest);

    expect(result).toEqual({ success: false, error: "server" });
  });

  it("returns timeout error when request exceeds 30 seconds", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const signal = init?.signal;
      if (signal) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const error = new DOMException(
              "The operation was aborted.",
              "AbortError",
            );
            reject(error);
          });
          if (signal.aborted) {
            const error = new DOMException(
              "The operation was aborted.",
              "AbortError",
            );
            reject(error);
          }
        });
      }
      return new Response(null, { status: 200 });
    };

    const { vi } = await import("vitest");
    vi.useFakeTimers();

    const resultPromise = createAccount(validCreateRequest);
    vi.advanceTimersByTime(30_000);

    const result = await resultPromise;

    expect(result).toEqual({ success: false, error: "timeout" });

    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });
});
