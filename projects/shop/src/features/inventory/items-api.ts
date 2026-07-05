import { fetchAuthSession } from "aws-amplify/auth";
import type {
  Item,
  CreateItemRequest,
  CreateItemResult,
  UpdateItemRequest,
  UpdateItemResult,
  DeleteItemResult,
  CursorPaginationParams,
  CursorPaginatedItemsResponse,
} from "./items-types";

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

export async function fetchCursorPaginatedItems(
  params: CursorPaginationParams,
  signal?: AbortSignal,
): Promise<CursorPaginatedItemsResponse> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const url = new URL(`${API_BASE}/items`, window.location.origin);
    url.searchParams.set("pageSize", String(params.pageSize));
    if (params.cursor) {
      url.searchParams.set("cursor", params.cursor);
    }

    const response = await fetch(url.pathname + url.search, {
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch items: ${response.status}`);
    }

    const data: CursorPaginatedItemsResponse = await response.json();
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) {
        throw error;
      }
      throw new Error("Request timed out");
    }

    if (error instanceof TypeError) {
      throw new Error("Unable to load items");
    }

    throw error;
  }
}

export async function fetchNextSku(
  signal?: AbortSignal,
): Promise<{ nextSku: number }> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/items/next-sku`, {
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch next SKU: ${response.status}`);
    }

    const data: { nextSku: number } = await response.json();
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) {
        throw error;
      }
      throw new Error("Request timed out");
    }

    if (error instanceof TypeError) {
      throw new Error("Unable to fetch next SKU");
    }

    throw error;
  }
}

export async function createItem(
  request: CreateItemRequest,
  signal?: AbortSignal,
): Promise<CreateItemResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(request),
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const item: Item = await response.json();
      return { success: true, item };
    }

    const body = await response.text();

    if (response.status === 400) {
      try {
        const parsed = JSON.parse(body);
        if (
          parsed.error === "validation_error" &&
          Array.isArray(parsed.fields)
        ) {
          return { success: false, error: "validation", fields: parsed.fields };
        }
      } catch {
        // Could not parse validation errors
      }
      return { success: false, error: "validation" };
    }

    if (response.status === 422 && body.includes("account_not_found")) {
      return { success: false, error: "account_not_found" };
    }

    return { success: false, error: "server" };
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) {
        throw error;
      }
      return { success: false, error: "timeout" };
    }

    if (error instanceof TypeError) {
      return { success: false, error: "network" };
    }

    return { success: false, error: "server" };
  }
}

export async function updateItem(
  uuid: string,
  request: UpdateItemRequest,
  signal?: AbortSignal,
): Promise<UpdateItemResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/items/${uuid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(request),
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const item: Item = await response.json();
      return { success: true, item };
    }

    const body = await response.text();

    if (response.status === 404) {
      return { success: false, error: "not_found" };
    }

    if (response.status === 400) {
      try {
        const parsed = JSON.parse(body);
        if (
          parsed.error === "validation_error" &&
          Array.isArray(parsed.fields)
        ) {
          return { success: false, error: "validation", fields: parsed.fields };
        }
      } catch {
        // Could not parse validation errors
      }
      return { success: false, error: "validation" };
    }

    return { success: false, error: "server" };
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) {
        throw error;
      }
      return { success: false, error: "timeout" };
    }

    if (error instanceof TypeError) {
      return { success: false, error: "network" };
    }

    return { success: false, error: "server" };
  }
}

export async function deleteItem(
  uuid: string,
  signal?: AbortSignal,
): Promise<DeleteItemResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/items/${uuid}`, {
      method: "DELETE",
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (response.ok || response.status === 204) {
      return { success: true };
    }

    if (response.status === 404) {
      return { success: false, error: "not_found" };
    }

    return { success: false, error: "server" };
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) {
        throw error;
      }
      return { success: false, error: "timeout" };
    }

    if (error instanceof TypeError) {
      return { success: false, error: "network" };
    }

    return { success: false, error: "server" };
  }
}

export async function requestPresignedUrl(
  filename: string,
  contentType: string,
  signal?: AbortSignal,
): Promise<{ uploadUrl: string; s3Key: string }> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/items/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ filename, contentType }),
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to get presigned URL: ${response.status}`);
    }

    const data: { uploadUrl: string; s3Key: string } = await response.json();
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) {
        throw error;
      }
      throw new Error("Request timed out");
    }

    if (error instanceof TypeError) {
      throw new Error("Unable to request upload URL");
    }

    throw error;
  }
}
