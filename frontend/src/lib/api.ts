import type { TokenPair } from "./types";

const TOKENS_KEY = "kyko.tokens";
export const AUTH_EVENT = "kyko:auth";

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

// Set while the server has ended the session (not a logout): checkout tells the customer.
const SESSION_ENDED_KEY = "kyko.session-ended";

function markSessionEnded(ended: boolean): void {
  try {
    if (ended) window.sessionStorage.setItem(SESSION_ENDED_KEY, "1");
    else window.sessionStorage.removeItem(SESSION_ENDED_KEY);
  } catch {
    // storage unavailable: the note is simply not shown
  }
}

/** Whether the last session in this tab was ended by the server (a password change, expiry). */
export function sessionWasEnded(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_ENDED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTokens(tokens: StoredTokens | null): void {
  if (tokens) markSessionEnded(false);
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

/** What a refresh came to: a new pair, a session the server ended, or no answer at all. */
type Refresh = "ok" | "ended" | "offline";

let refreshing: Promise<Refresh> | null = null;

async function refreshTokens(): Promise<Refresh> {
  const tokens = getTokens();
  if (!tokens) return "ended";
  refreshing ??= (async (): Promise<Refresh> => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
      });
      if (res.status === 401 || res.status === 403) {
        markSessionEnded(true);
        setTokens(null);
        return "ended";
      }
      // A server error (a restart) is not the end of the session: try again next time.
      if (!res.ok) return "offline";
      const pair = (await res.json()) as TokenPair;
      setTokens(pair);
      return "ok";
    } catch {
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

export interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
}

function buildQuery(query?: Record<string, QueryValue>): string {
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

function errorMessage(detail: unknown, fallback = "Что-то пошло не так"): string {
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
  const headers: Record<string, string> = { ...opts.headers };
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

function isRead(opts: RequestOptions): boolean {
  const method = opts.method ?? (opts.form || opts.body !== undefined ? "POST" : "GET");
  return method.toUpperCase() === "GET";
}

async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  const res = await send(path, opts, true);
  if (res.status !== 401 || !getTokens()) return res;
  // The access token expired: refresh once.
  const refresh = await refreshTokens();
  if (refresh === "ok") return send(path, opts, true);
  // A read goes on as a guest. Anything that writes must not: a wholesale customer's order would
  // become a guest's at retail prices, outside their account.
  if (refresh === "ended" && isRead(opts)) return send(path, opts, false);
  throw new ApiError(refresh === "ended" ? 401 : 0, refresh === "ended" ? SESSION_ENDED : NO_CONNECTION, null);
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

/** Download a protected file (e.g. the admin import template) with the current token. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await request(path);
  if (!res.ok) throw new ApiError(res.status, `Ошибка ${res.status}`, null);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
  return Date.now().toString(36) + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
