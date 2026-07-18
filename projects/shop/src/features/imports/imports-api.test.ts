import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  fetchImportStatus,
  fetchImportHistory,
  startImport,
  resumeImport,
  cancelImport,
} from "./imports-api";
import type {
  ImportHistoryResponse,
  ImportStatusResponse,
} from "./imports-types";

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: {
      accessToken: {
        toString: () => "mock-access-token",
      },
    },
  }),
}));

const mockStatusResponse: ImportStatusResponse = {
  items: {
    jobId: "job-001",
    state: "running",
    phase: "sync",
    startedAt: "2024-01-15T10:00:00.000Z",
    lastUpdatedAt: "2024-01-15T10:05:30.000Z",
    progress: { processed: 100, imported: 80, skipped: 15, failed: 5 },
  },
  sales: null,
  accounts: null,
};

const mockJobResponse = { jobId: "job-002", state: "running", phase: "fetch" };

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchImportStatus", () => {
  it("returns import status on success", async () => {
    server.use(
      http.get("/api/import/status", () => {
        return HttpResponse.json(mockStatusResponse);
      }),
    );

    const result = await fetchImportStatus();

    expect(result).toEqual(mockStatusResponse);
    expect(result.items?.jobId).toBe("job-001");
    expect(result.items?.state).toBe("running");
    expect(result.sales).toBeNull();
    expect(result.accounts).toBeNull();
  });

  it("throws an error on non-200 response", async () => {
    server.use(
      http.get("/api/import/status", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(fetchImportStatus()).rejects.toThrow(
      "Failed to fetch import status: 500",
    );
  });

  it("throws a connectivity error on network TypeError", async () => {
    server.use(
      http.get("/api/import/status", () => {
        return HttpResponse.error();
      }),
    );

    await expect(fetchImportStatus()).rejects.toThrow(
      "Unable to connect to the server. Check your connection.",
    );
  });

  it("includes Authorization header from auth session", async () => {
    let capturedHeaders: Headers | undefined;

    server.use(
      http.get("/api/import/status", ({ request }) => {
        capturedHeaders = new Headers(request.headers);
        return HttpResponse.json(mockStatusResponse);
      }),
    );

    await fetchImportStatus();

    expect(capturedHeaders?.get("authorization")).toBe(
      "Bearer mock-access-token",
    );
  });
});

describe("startImport", () => {
  it("returns job data on success", async () => {
    server.use(
      http.post("/api/import/items/start", () => {
        return HttpResponse.json(mockJobResponse);
      }),
    );

    const result = await startImport("items");

    expect(result).toEqual(mockJobResponse);
    expect(result.jobId).toBe("job-002");
    expect(result.state).toBe("running");
  });

  it("throws with status 409 on conflict", async () => {
    server.use(
      http.post("/api/import/sales/start", () => {
        return new HttpResponse(null, { status: 409 });
      }),
    );

    await expect(startImport("sales")).rejects.toThrow(
      "An import is already running for sales",
    );

    try {
      await startImport("sales");
    } catch (error: unknown) {
      expect((error as Error & { status?: number }).status).toBe(409);
    }
  });

  it("throws on non-200/non-409 error response", async () => {
    server.use(
      http.post("/api/import/accounts/start", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(startImport("accounts")).rejects.toThrow(
      "Failed to start import: 500",
    );
  });

  it("throws a connectivity error on network TypeError", async () => {
    server.use(
      http.post("/api/import/items/start", () => {
        return HttpResponse.error();
      }),
    );

    await expect(startImport("items")).rejects.toThrow(
      "Unable to connect to the server. Check your connection.",
    );
  });
});

describe("resumeImport", () => {
  it("returns job data on success", async () => {
    server.use(
      http.post("/api/import/items/resume", () => {
        return HttpResponse.json(mockJobResponse);
      }),
    );

    const result = await resumeImport("items", "job-001");

    expect(result).toEqual(mockJobResponse);
    expect(result.jobId).toBe("job-002");
  });

  it("sends jobId in the request body", async () => {
    let capturedBody: unknown;

    server.use(
      http.post("/api/import/sales/resume", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(mockJobResponse);
      }),
    );

    await resumeImport("sales", "job-xyz");

    expect(capturedBody).toEqual({ jobId: "job-xyz" });
  });

  it("throws on error response", async () => {
    server.use(
      http.post("/api/import/accounts/resume", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(resumeImport("accounts", "job-001")).rejects.toThrow(
      "Failed to resume import: 500",
    );
  });

  it("throws a connectivity error on network TypeError", async () => {
    server.use(
      http.post("/api/import/items/resume", () => {
        return HttpResponse.error();
      }),
    );

    await expect(resumeImport("items", "job-001")).rejects.toThrow(
      "Unable to connect to the server. Check your connection.",
    );
  });
});

describe("cancelImport", () => {
  it("resolves on success", async () => {
    server.use(
      http.post("/api/import/items/cancel", () => {
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await expect(cancelImport("items", "job-001")).resolves.toBeUndefined();
  });

  it("sends jobId in the request body", async () => {
    let capturedBody: unknown;

    server.use(
      http.post("/api/import/sales/cancel", async ({ request }) => {
        capturedBody = await request.json();
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await cancelImport("sales", "job-abc");

    expect(capturedBody).toEqual({ jobId: "job-abc" });
  });

  it("throws on error response", async () => {
    server.use(
      http.post("/api/import/accounts/cancel", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(cancelImport("accounts", "job-001")).rejects.toThrow(
      "Failed to cancel import: 500",
    );
  });

  it("throws a connectivity error on network TypeError", async () => {
    server.use(
      http.post("/api/import/items/cancel", () => {
        return HttpResponse.error();
      }),
    );

    await expect(cancelImport("items", "job-001")).rejects.toThrow(
      "Unable to connect to the server. Check your connection.",
    );
  });
});

const mockHistoryResponse: ImportHistoryResponse = {
  jobs: [
    {
      jobId: "job-100",
      state: "complete",
      phase: "sync",
      startedAt: "2024-01-15T10:00:00.000Z",
      lastUpdatedAt: "2024-01-15T10:45:00.000Z",
      progress: { processed: 1500, imported: 1200, skipped: 250, failed: 50 },
      report: {
        jobId: "job-100",
        totalProcessed: 1500,
        imported: 1200,
        skipped: 250,
        failed: 50,
        elapsedSeconds: 2700,
        failures: [],
        truncated: false,
        totalFailures: 50,
        completedAt: "2024-01-15T10:45:00.000Z",
      },
    },
  ],
  nextToken: "abc123",
};

describe("fetchImportHistory", () => {
  it("returns history data on success", async () => {
    server.use(
      http.get("/api/import/items/history", () => {
        return HttpResponse.json(mockHistoryResponse);
      }),
    );

    const result = await fetchImportHistory({ type: "items", pageSize: 20 });

    expect(result).toEqual(mockHistoryResponse);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].jobId).toBe("job-100");
    expect(result.nextToken).toBe("abc123");
  });

  it("passes pageSize and nextToken as query parameters", async () => {
    let capturedUrl: URL | undefined;

    server.use(
      http.get("/api/import/sales/history", ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ jobs: [] });
      }),
    );

    await fetchImportHistory({
      type: "sales",
      pageSize: 50,
      nextToken: "cursor-xyz",
    });

    expect(capturedUrl?.searchParams.get("pageSize")).toBe("50");
    expect(capturedUrl?.searchParams.get("nextToken")).toBe("cursor-xyz");
  });

  it("omits nextToken query parameter when not provided", async () => {
    let capturedUrl: URL | undefined;

    server.use(
      http.get("/api/import/accounts/history", ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ jobs: [] });
      }),
    );

    await fetchImportHistory({ type: "accounts", pageSize: 20 });

    expect(capturedUrl?.searchParams.get("pageSize")).toBe("20");
    expect(capturedUrl?.searchParams.has("nextToken")).toBe(false);
  });

  it("includes Authorization header from auth session", async () => {
    let capturedHeaders: Headers | undefined;

    server.use(
      http.get("/api/import/items/history", ({ request }) => {
        capturedHeaders = new Headers(request.headers);
        return HttpResponse.json({ jobs: [] });
      }),
    );

    await fetchImportHistory({ type: "items", pageSize: 20 });

    expect(capturedHeaders?.get("authorization")).toBe(
      "Bearer mock-access-token",
    );
  });

  it("throws an error on non-200 response", async () => {
    server.use(
      http.get("/api/import/items/history", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(
      fetchImportHistory({ type: "items", pageSize: 20 }),
    ).rejects.toThrow("Failed to fetch import history: 500");
  });

  it("throws a connectivity error on network TypeError", async () => {
    server.use(
      http.get("/api/import/items/history", () => {
        return HttpResponse.error();
      }),
    );

    await expect(
      fetchImportHistory({ type: "items", pageSize: 20 }),
    ).rejects.toThrow(
      "Unable to connect to the server. Check your connection.",
    );
  });

  it("re-throws AbortError when caller signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    server.use(
      http.get("/api/import/items/history", () => {
        return HttpResponse.json({ jobs: [] });
      }),
    );

    await expect(
      fetchImportHistory(
        { type: "items", pageSize: 20 },
        { signal: controller.signal },
      ),
    ).rejects.toThrow();
  });
});
