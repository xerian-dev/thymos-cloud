/**
 * API base URL configuration.
 *
 * In development, Vite proxies /api to the target defined in VITE_API_URL,
 * so we use "/api" as the base (relative path hits the proxy).
 *
 * In production, there is no proxy — requests must go directly to the
 * API Gateway URL. We use VITE_API_URL + "/api" as the full base.
 */
const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE: string =
  import.meta.env.PROD && apiUrl ? `${apiUrl}/api` : "/api";
