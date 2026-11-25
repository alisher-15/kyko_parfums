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

/** What a refresh came to: a new pair, a session the server ended, or no answer at all. */
type Refresh = "ok" | "ended" | "offline";

let refreshing: Promise<Refresh> | null = null;

async function refreshTokens(): Promise<Refresh> {
  const current = tokens;
  if (!current) return "ended";
  refreshing ??= (async (): Promise<Refresh> => {
    try {
      const res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      });
      if (res.status === 401 || res.status === 403) {
        await setTokens(null);
        signOutListeners.forEach((l) => l());
        return "ended";
      }
      // A server error (a restart) is not the end of the session: try again next time.
      if (!res.ok) return "offline";
      await setTokens((await res.json()) as TokenPair);
      return "ok";
    } catch {
      // No connection: keep the session, the next request will try again.
      return "offline";
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Shown when a session ends while sending something: it was not sent as a guest instead. */
export const SESSION_ENDED = "Вход истёк — войдите снова. Ничего не отправлено.";
const NO_CONNECTION = "Нет связи с магазином. Проверьте интернет и попробуйте ещё раз.";

// ---------- Requests ----------

type QueryValue = string | number | boolean | null | undefined | (string | number)[];
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** A multipart form (a photo, an Excel file), instead of a JSON body. */
  form?: FormData;
  query?: Query;
  /** Extra headers (a guest order's «X-Order-Key»). */
  headers?: Record<string, string>;
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
    throw new ApiError(0, NO_CONNECTION, null);
  } finally {
    clearTimeout(timer);
  }
}

function send(path: string, opts: RequestOptions, withAuth: boolean): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
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

function isRead(opts: RequestOptions): boolean {
  const method = opts.method ?? (opts.form || opts.body !== undefined ? "POST" : "GET");
  return method.toUpperCase() === "GET";
}

async function request(path: string, opts: RequestOptions): Promise<Response> {
  const res = await send(path, opts, true);
  if (res.status !== 401 || !tokens) return res;
  // The access token expired: refresh once.
  const refresh = await refreshTokens();
  if (refresh === "ok") return send(path, opts, true);
  // A read goes on as a guest once the session has really ended. Anything that writes must not,
  // and nothing goes as a guest while the connection is down: a wholesale customer's order would
  // become a guest's at retail prices, and retail prices would be cached under their account.
  if (refresh === "ended" && isRead(opts)) return send(path, opts, false);
  throw new ApiError(
    refresh === "ended" ? 401 : 0,
    refresh === "ended" ? SESSION_ENDED : NO_CONNECTION,
    null,
  );
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

/**
 * The key of one checkout or till sale (`request_key`): sent again with a retry, it returns the
 * order already placed instead of a second one. `nonce` is made once per attempt and renewed
 * after a success; the content's hash makes a changed cart or receipt a new order.
 */
export function requestKey(nonce: string, content: unknown): string {
  const text = JSON.stringify(content);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${nonce}-${hash.toString(36)}`;
}

/** A random one-off value (a guest's retry gets their order back with it: it must not be guessable). */
export function newNonce(): string {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return (
    Date.now().toString(36) + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}
