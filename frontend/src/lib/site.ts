// Server-side helpers for what search engines and link previews read: the site's own address
// and the public catalog, fetched from the API directly (not through the /api rewrite).
import { cache } from "react";
import type { ProductDetail } from "@/lib/types";

/** The public address: SITE_URL (your domain), else Render's own, else local. */
export const SITE_URL = (
  process.env.SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/+$/, "");

/** An absolute URL for a path on this site; absolute URLs (R2 photos) stay as they are. */
export function absoluteUrl(pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** The link preview picture (public/og.png), for pages and products without a photo. Static
 *  pages are made by `next build`, so the address must be known then too (see the Dockerfile). */
export const SITE_IMAGE = { url: absoluteUrl("/og.png"), width: 1200, height: 630, alt: "Kyko" };

/** Link preview fields of every page. A page's own openGraph replaces the layout's whole, so
 *  pages that set one spread these into it. */
export const SITE_OPEN_GRAPH = {
  siteName: "Kyko",
  locale: "ru_RU",
  type: "website" as const,
  images: [SITE_IMAGE],
};

/** A public API answer as a guest sees it, or null when the API is down or says no. */
export async function publicApi<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api${path}`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** A product as a guest sees it; asked once per page render (metadata and page share it). */
export const publicProduct = cache(
  (id: number): Promise<ProductDetail | null> =>
    Number.isInteger(id) && id > 0 ? publicApi<ProductDetail>(`/products/${id}`) : Promise.resolve(null),
);
