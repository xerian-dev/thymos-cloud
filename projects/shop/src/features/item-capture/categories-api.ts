import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE = "/api";

export interface CategoryOption {
  id: string;
  name: string;
}

export type CategoriesResult =
  | { success: true; categories: CategoryOption[] }
  | { success: false; error: "server" | "network" | "timeout" };

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

export async function fetchCategories(
  signal?: AbortSignal,
): Promise<CategoriesResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/categories`, {
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: "server" };
    }

    const data: { categories: CategoryOption[] } = await response.json();
    return { success: true, categories: data.categories };
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
