import { fetchAuthSession } from "aws-amplify/auth";
import type { DescriptionCategory } from "./descriptions-types";
import { API_BASE } from "@/config/api-config";

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

export async function downloadMappings(): Promise<
  | { success: true; data: DescriptionCategory[]; lastModified: string | null }
  | { success: false; error: string }
> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/descriptions/mappings`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.mappings as DescriptionCategory[],
      lastModified: data.lastModified ?? null,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function uploadMappings(
  categories: DescriptionCategory[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/descriptions/mappings`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ mappings: categories }),
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
