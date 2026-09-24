const BASE = "https://kyko.invalid";

/**
 * Where to go after login or registration: only a path on this site. Anything that would leave
 * it (`https://…`, `//host`, `/\host`, which browsers read as `//host`) gives the fallback.
 */
export function safeNext(next: string | null, fallback = "/account"): string {
  if (!next?.startsWith("/")) return fallback;
  try {
    const url = new URL(next, BASE);
    return url.origin === BASE ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
