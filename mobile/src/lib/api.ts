import { API_URL } from "./config";
import { secure } from "./storage";
import type { TokenPair } from "./types";

const TOKENS_KEY = "kyko.tokens";
// The free Render plan sleeps: the first request after a pause can take about a minute.
const TIMEOUT_MS = 70_000;

interface StoredTokens {
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

// ---------- Tokens: kept in memory, saved to the secure store ----------

let tokens: StoredTokens | null = null;
const signOutListeners = new Set<() => void>();

/** Read the saved session once, at start, before the first request. */
export async function loadTokens(): Promise<boolean> {
  const raw = await secure.get(TOKENS_KEY);
  try {
    tokens = raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    tokens = null;
  }
  return tokens !== null;
}

export function hasTokens(): boolean {
  return tokens !== null;
}

export async function setTokens(pair: StoredTokens | null): Promise<void> {
  tokens = pair ? { access_token: pair.access_token, refresh_token: pair.refresh_token } : null;
  await secure.set(TOKENS_KEY, tokens ? JSON.stringify(tokens) : null);
}

/** Called when the server ends the session (the refresh token no longer works). */
export function onSignedOut(listener: () => void): () => void {
  signOutListeners.add(listener);
  return () => signOutListeners.delete(listener);
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const current = tokens;
  if (!current) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      });
      if (!res.ok) {
        await setTokens(null);
        signOutListeners.forEach((l) => l());
        return false;
      }
      await setTokens((await res.json()) as TokenPair);
      return true;
    } catch {
      // No connection: keep the session, the next request will try again.
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ---------- Requests ----------

type QueryValue = string | number | boolean | null | undefined | (string | number)[];
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** A multipart form (a photo, an Excel file), instead of a JSON body. */
  form?: FormData;
  query?: Query;
}

export function buildQuery(query?: Query): string {
  if (!query) return "";
  const parts: string[] = [];
  const push = (k: string, v: string | number | boolean) =>
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) value.forEach((v) => push(key, v));
    else push(key, value);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

function errorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors
    const text = detail
      .map((d: { msg?: string }) => (d.msg ?? "").replace(/^Value error, /, ""))
      .filter(Boolean)
      .join("; ");
    return text || fallback;
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError(0, "Нет связи с магазином. Проверьте интернет и попробуйте ещё раз.", null);
  } finally {
    clearTimeout(timer);
  }
}

function send(path: string, opts: RequestOptions, withAuth: boolean): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (withAuth && tokens) headers.Authorization = `Bearer ${tokens.access_token}`;
  let body: string | FormData | undefined;
  if (opts.form) {
    // The platform sets the multipart boundary itself.
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetchWithTimeout(`${API_URL}${path}${buildQuery(opts.query)}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });
}

async function request(path: string, opts: RequestOptions): Promise<Response> {
  const res = await send(path, opts, true);
  if (res.status !== 401 || !tokens) return res;
  // The access token expired: refresh once, or go on as a guest.
  const refreshed = await refreshTokens();
  return send(path, opts, refreshed);
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(path, opts);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail ?? data;
    throw new ApiError(res.status, errorMessage(detail, `Ошибка ${res.status}`), detail);
  }
  return data as T;
}

/** A message for the person, from any error. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** A protected file (an invoice, an Excel template) as bytes, with the session's token. */
export async function apiFile(path: string, query?: Query): Promise<ArrayBuffer> {
  const res = await request(path, { query });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, errorMessage(data?.detail, `Ошибка ${res.status}`), data);
  }
  return res.arrayBuffer();
}
