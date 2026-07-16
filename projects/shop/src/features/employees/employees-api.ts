import { fetchAuthSession } from "aws-amplify/auth";
import type {
  Employee,
  CursorPaginationParams,
  CursorPaginatedEmployeesResponse,
} from "./employees-types";

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

export async function fetchPaginatedEmployees(
  params: CursorPaginationParams,
  options?: { signal?: AbortSignal },
): Promise<CursorPaginatedEmployeesResponse> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const url = new URL(`${API_BASE}/employees`, window.location.origin);
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
      throw new Error(`Failed to fetch employees: ${response.status}`);
    }

    const data: CursorPaginatedEmployeesResponse = await response.json();
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
      throw new Error("Unable to load employees");
    }

    throw error;
  }
}

export async function fetchEmployee(
  uuid: string,
  signal?: AbortSignal,
): Promise<Employee> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/employees/${uuid}`, {
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch employee: ${response.status}`);
    }

    const data: Employee = await response.json();
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
      throw new Error("Unable to load employee details");
    }

    throw error;
  }
}

export async function fetchEmployeesByIds(
  uuids: string[],
): Promise<Employee[]> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/employees/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ uuids }),
      signal: timeoutController.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch employees: ${response.status}`);
    }

    const data: Employee[] = await response.json();
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out");
    }

    if (error instanceof TypeError) {
      throw new Error("Unable to load employee details");
    }

    throw error;
  }
}
