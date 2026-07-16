import { fetchAuthSession } from "aws-amplify/auth";
import type { CursorPaginationParams } from "@/lib/pagination-types";
import type {
  Sale,
  CreateSaleRequest,
  CreateSaleResult,
  UpdateSaleRequest,
  UpdateSaleResult,
  DeleteSaleResult,
  CursorPaginatedSalesResponse,
} from "./sales-types";

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

export async function fetchCursorPaginatedSales(
  params: CursorPaginationParams,
  options?: { signal?: AbortSignal },
): Promise<CursorPaginatedSalesResponse> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const url = new URL(`${API_BASE}/sales`, window.location.origin);
    url.searchParams.set("pageSize", String(params.pageSize));
    if (params.cursor) {
      url.searchParams.set("cursor", params.cursor);
    }

    const response = await fetch(url.pathname + url.search, {
      headers: authHeaders,
      signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch sales: ${response.status}`);
    }

    const data: CursorPaginatedSalesResponse = await response.json();
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
      throw new Error("Unable to load sales");
    }

    throw error;
  }
}

export async function fetchNextSaleNumber(): Promise<{ nextNumber: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/sales/next-number`, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch next sale number: ${response.status}`);
  }

  const data: { nextNumber: number } = await response.json();
  return data;
}

export async function createSale(
  data: CreateSaleRequest,
): Promise<CreateSaleResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/sales`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const sale: Sale = await response.json();
      return { success: true, sale };
    }

    if (response.status === 422) {
      const body = await response.json();
      return {
        success: false,
        error: "validation",
        fields: body.fields as Array<{ field: string; message: string }>,
      };
    }

    return { success: false, error: "server" };
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      return { success: false, error: "timeout" };
    }

    if (error instanceof TypeError) {
      return { success: false, error: "network" };
    }

    return { success: false, error: "server" };
  }
}

export async function updateSale(
  uuid: string,
  data: UpdateSaleRequest,
): Promise<UpdateSaleResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/sales/${uuid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const sale: Sale = await response.json();
      return { success: true, sale };
    }

    if (response.status === 404) {
      return { success: false, error: "not_found" };
    }

    if (response.status === 422) {
      return { success: false, error: "validation" };
    }

    if (response.status === 409) {
      return { success: false, error: "invalid_transition" };
    }

    return { success: false, error: "server" };
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      return { success: false, error: "timeout" };
    }

    if (error instanceof TypeError) {
      return { success: false, error: "network" };
    }

    return { success: false, error: "server" };
  }
}

export async function deleteSale(uuid: string): Promise<DeleteSaleResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/sales/${uuid}`, {
      method: "DELETE",
      headers: authHeaders,
      signal: controller.signal,
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
      return { success: false, error: "timeout" };
    }

    if (error instanceof TypeError) {
      return { success: false, error: "network" };
    }

    return { success: false, error: "server" };
  }
}
