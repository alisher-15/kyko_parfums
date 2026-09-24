import type { TokenPair } from "./types";

const TOKENS_KEY = "kyko.tokens";
export const AUTH_EVENT = "kyko:auth";

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail: unknown,
  ) {
    super(message);
  }
}

// ---------- Token storage ----------

export function getTokens(): StoredTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

export function setTokens(tokens: StoredTokens | null): void {
  try {
    if (tokens) {
      window.localStorage.setItem(
        TOKENS_KEY,
        JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token }),
      );
    } else {
      window.localStorage.removeItem(TOKENS_KEY);
    }
  } catch {
    // storage unavailable (private mode) — session lives only in memory for this page
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
      });
      if (!res.ok) {
        setTokens(null);
        return false;
      }
      const pair = (await res.json()) as TokenPair;
      setTokens(pair);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ---------- Requests ----------

type QueryValue = string | number | boolean | null | undefined | (string | number)[];

export interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  query?: Record<string, QueryValue>;
}

export function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function errorMessage(detail: unknown, fallback = "Что-то пошло не так"): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors
    return detail
      .map((d: { msg?: string }) => (d.msg ?? "").replace(/^Value error, /, ""))
      .filter(Boolean)
      .join("; ");
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return fallback;
}

async function send(path: string, opts: RequestOptions, withAuth: boolean): Promise<Response> {
  const headers: Record<string, string> = {};
  const tokens = withAuth ? getTokens() : null;
  if (tokens) headers.Authorization = `Bearer ${tokens.access_token}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetch(`/api${path}${buildQuery(opts.query)}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(path, opts, true);
  if (res.status === 401 && getTokens()) {
    // Access token expired: refresh once, or fall back to a guest request.
    const refreshed = await refreshTokens();
    res = await send(path, opts, refreshed);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail ?? data;
    throw new ApiError(res.status, errorMessage(detail, `Ошибка ${res.status}`), detail);
  }
  return data as T;
}

/** Download a protected file (e.g. the admin import template) with the current token. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const tokens = getTokens();
  const res = await fetch(`/api${path}`, {
    headers: tokens ? { Authorization: `Bearer ${tokens.access_token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `Ошибка ${res.status}`, null);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
