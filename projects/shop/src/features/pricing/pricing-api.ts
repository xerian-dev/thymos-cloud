import { fetchAuthSession } from "aws-amplify/auth";
import type {
  PriceSuggestionResponse,
  PriceSuggestionResult,
  TriggerAggregationResult,
  AdjustmentFilters,
  AdjustmentListResponse,
  AdjustmentListResult,
  CanonicalListResult,
} from "./pricing-types";

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

export async function fetchPriceSuggestion(
  params: {
    brand?: string;
    categoryId?: string;
    color?: string;
    size?: string;
    createdBy?: string;
  },
  signal?: AbortSignal,
): Promise<PriceSuggestionResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const url = new URL(`${API_BASE}/pricing/suggest`, window.location.origin);
    if (params.brand) {
      url.searchParams.set("brand", params.brand);
    }
    if (params.categoryId) {
      url.searchParams.set("categoryId", params.categoryId);
    }
    if (params.color) {
      url.searchParams.set("color", params.color);
    }
    if (params.size) {
      url.searchParams.set("size", params.size);
    }
    if (params.createdBy) {
      url.searchParams.set("createdBy", params.createdBy);
    }

    const response = await fetch(url.pathname + url.search, {
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: "server" };
    }

    const data: PriceSuggestionResponse = await response.json();
    return { success: true, data };
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

export async function triggerAggregation(
  signal?: AbortSignal,
): Promise<TriggerAggregationResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/pricing/aggregate`, {
      method: "POST",
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: "server" };
    }

    return { success: true };
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

export async function fetchAdjustments(
  params: {
    filters?: AdjustmentFilters;
    pageSize?: number;
    cursor?: string;
  },
  signal?: AbortSignal,
): Promise<AdjustmentListResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const url = new URL(
      `${API_BASE}/pricing/adjustments`,
      window.location.origin,
    );
    if (params.pageSize) {
      url.searchParams.set("pageSize", String(params.pageSize));
    }
    if (params.cursor) {
      url.searchParams.set("cursor", params.cursor);
    }
    if (params.filters?.direction) {
      url.searchParams.set("direction", params.filters.direction);
    }
    if (params.filters?.brand) {
      url.searchParams.set("brand", params.filters.brand);
    }
    if (params.filters?.category) {
      url.searchParams.set("category", params.filters.category);
    }
    if (params.filters?.fromDate) {
      url.searchParams.set("fromDate", params.filters.fromDate);
    }
    if (params.filters?.toDate) {
      url.searchParams.set("toDate", params.filters.toDate);
    }

    const response = await fetch(url.pathname + url.search, {
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: "server" };
    }

    const data: AdjustmentListResponse = await response.json();
    return { success: true, data };
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

export async function fetchCanonicalBrands(
  signal?: AbortSignal,
): Promise<CanonicalListResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/pricing/canonical/brands`, {
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: "server" };
    }

    const data: { brands: string[] } = await response.json();
    return { success: true, values: data.brands };
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

export async function fetchCanonicalColors(
  signal?: AbortSignal,
): Promise<CanonicalListResult> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/pricing/canonical/colors`, {
      headers: authHeaders,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: "server" };
    }

    const data: { colors: string[] } = await response.json();
    return { success: true, values: data.colors };
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
