import { fetchAuthSession } from "aws-amplify/auth";
import type {
  MappingsResponse,
  ColorMapping,
  ApplyStatus,
} from "./colors-types";

const API_BASE = "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Fall through
  }
  return {};
}

export async function triggerScanCluster(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/colors/scan-cluster`, {
      method: "POST",
      headers,
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function fetchMappings(): Promise<
  { success: true; data: MappingsResponse } | { success: false; error: string }
> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/colors/mappings`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data: MappingsResponse = await response.json();
    return { success: true, data };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function saveMappings(
  mappings: ColorMapping[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/colors/mappings`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ mappings }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function applyMappings(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/colors/apply`, {
      method: "POST",
      headers,
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function fetchApplyStatus(): Promise<
  { success: true; data: ApplyStatus } | { success: false; error: string }
> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/colors/apply-status`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data: ApplyStatus = await response.json();
    return { success: true, data };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
