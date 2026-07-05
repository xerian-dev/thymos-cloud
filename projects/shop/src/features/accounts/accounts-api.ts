import { fetchAuthSession } from "aws-amplify/auth";
import type {
  Account,
  CreateAccountRequest,
  CreateAccountResult,
  UpdateAccountRequest,
  UpdateAccountResult,
  DeleteAccountResult,
  CursorPaginationParams,
  CursorPaginatedResponse,
} from "./accounts-types";

export interface AccountsApiResponse {
  accounts: Account[];
}

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

export async function fetchAccounts(): Promise<AccountsApiResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/accounts`, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch accounts: ${response.status}`);
  }

  const data: AccountsApiResponse = await response.json();
  return data;
}

export async function fetchCursorPaginatedAccounts(
  params: CursorPaginationParams,
  options?: { signal?: AbortSignal },
): Promise<CursorPaginatedResponse> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const url = new URL(`${API_BASE}/accounts`, window.location.origin);
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
      throw new Error(`Failed to fetch accounts: ${response.status}`);
    }

    const data: CursorPaginatedResponse = await response.json();
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
      throw new Error("Unable to load accounts");
    }

    throw error;
  }
}

export async function fetchNextAccountNumber(): Promise<number> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/accounts/next-number`, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch next account number: ${response.status}`);
  }

  const data: { nextNumber: number } = await response.json();
  return data.nextNumber;
}

export async function createAccount(
  data: CreateAccountRequest,
): Promise<CreateAccountResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const account: Account = await response.json();
      return { success: true, account };
    }

    const body = await response.text();

    if (response.status === 409 || body.includes("duplicate")) {
      return { success: false, error: "duplicate" };
    }

    if (response.status === 422 && body.includes("max_reached")) {
      return { success: false, error: "max_reached" };
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

export async function updateAccount(
  accountNumber: number,
  data: UpdateAccountRequest,
): Promise<UpdateAccountResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/accounts/${accountNumber}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const account: Account = await response.json();
      return { success: true, account };
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

export async function deleteAccount(
  accountNumber: number,
): Promise<DeleteAccountResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/accounts/${accountNumber}`, {
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
