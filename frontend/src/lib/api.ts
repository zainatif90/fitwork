/**
 * API client with automatic token refresh.
 *
 * - The access token lives only in memory (this module's variable), never in localStorage,
 *   so a malicious script cannot read it from storage.
 * - The refresh token is an httpOnly cookie that the browser sends to /api/auth/* by itself.
 * - If any request returns 401 we call /auth/refresh once, then retry the request.
 *   If refresh also fails, the session is over and the app logs the user out.
 */
import type { TokenResponse, User } from "./types";

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "/api";

let accessToken: string | null = null;
let refreshInFlight: Promise<TokenResponse | null> | null = null;

// Hooks the AuthProvider registers so this module can tell React about changes.
let onUserChanged: ((user: User | null) => void) | null = null;

export function registerAuthListener(fn: (user: User | null) => void): void {
  onUserChanged = fn;
}

export function setSession(data: TokenResponse | null): void {
  accessToken = data?.access_token ?? null;
  onUserChanged?.(data?.user ?? null);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Turn FastAPI error bodies (string or list of validation errors) into one readable message. */
function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: unknown[] };
      const field = first.loc && first.loc.length > 1 ? String(first.loc[first.loc.length - 1]) : "";
      const msg = (first.msg ?? "Invalid input").replace(/^Value error, /, "");
      return field ? `${field.replace(/_/g, " ")}: ${msg}` : msg;
    }
  }
  if (status >= 500) return "The server had a problem. Please try again.";
  return `Request failed (${status})`;
}

/** Ask the server for a new access token using the refresh cookie. Only one refresh runs at a time. */
export function refreshSession(): Promise<TokenResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" })
      .then(async (res) => (res.ok ? ((await res.json()) as TokenResponse) : null))
      .catch(() => null)
      .then((data) => {
        setSession(data);
        return data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  retry?: boolean; // internal: false after one refresh attempt
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, retry = true } = opts;
  let url = `${API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => v !== undefined && params.set(k, String(v)));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection.");
  }

  const isAuthRoute = path.startsWith("/auth/login") || path.startsWith("/auth/register");
  if (res.status === 401 && retry && !isAuthRoute) {
    const refreshed = await refreshSession();
    if (refreshed) return api<T>(path, { ...opts, retry: false });
    throw new ApiError(401, "Your session has expired. Please log in again.");
  }

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status));
  return data as T;
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
  } finally {
    setSession(null);
  }
}
