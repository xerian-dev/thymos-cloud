import { fetchAuthSession } from "aws-amplify/auth";

import type {
  ImportHistoryParams,
  ImportHistoryResponse,
  ImportStatusResponse,
  ImportType,
} from "./imports-types";

const API_BASE = "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Fall through — no token available
  }
  return {};
}

export async function fetchImportStatus(options?: {
  signal?: AbortSignal;
}): Promise<ImportStatusResponse> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/import/status`, {
      headers: authHeaders,
      signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch import status: ${response.status}`);
    }

    const data: ImportStatusResponse = await response.json();
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      if (options?.signal?.aborted) {
        throw error;
      }
      throw new Error("Request timed out");
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Unable to connect to the server. Check your connection.",
      );
    }

    throw error;
  }
}

export async function startImport(
  type: ImportType,
): Promise<{ jobId: string; state: string; phase: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/import/${type}/start`, {
      method: "POST",
      headers: authHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 409) {
      const error = new Error(`An import is already running for ${type}`);
      (error as Error & { status: number }).status = 409;
      throw error;
    }

    if (!response.ok) {
      throw new Error(`Failed to start import: ${response.status}`);
    }

    const data: { jobId: string; state: string; phase: string } =
      await response.json();
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out");
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Unable to connect to the server. Check your connection.",
      );
    }

    throw error;
  }
}

export async function resumeImport(
  type: ImportType,
  jobId: string,
): Promise<{ jobId: string; state: string; phase: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/import/${type}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ jobId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to resume import: ${response.status}`);
    }

    const data: { jobId: string; state: string; phase: string } =
      await response.json();
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out");
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Unable to connect to the server. Check your connection.",
      );
    }

    throw error;
  }
}

export async function cancelImport(
  type: ImportType,
  jobId: string,
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/import/${type}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ jobId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to cancel import: ${response.status}`);
    }
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out");
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Unable to connect to the server. Check your connection.",
      );
    }

    throw error;
  }
}

export async function fetchImportHistory(
  params: ImportHistoryParams,
  options?: { signal?: AbortSignal },
): Promise<ImportHistoryResponse> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const searchParams = new URLSearchParams({
      pageSize: String(params.pageSize),
    });
    if (params.nextToken) {
      searchParams.set("nextToken", params.nextToken);
    }

    const response = await fetch(
      `${API_BASE}/import/${params.type}/history?${searchParams.toString()}`,
      {
        headers: authHeaders,
        signal,
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch import history: ${response.status}`);
    }

    const data: ImportHistoryResponse = await response.json();
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      if (options?.signal?.aborted) {
        throw error;
      }
      throw new Error("Request timed out");
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Unable to connect to the server. Check your connection.",
      );
    }

    throw error;
  }
}
