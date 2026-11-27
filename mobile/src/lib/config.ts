/**
 * The app talks to the same origin as the website: <site>/api is the FastAPI backend (proxied by
 * Next.js), and photos are either absolute (Cloudflare R2) or paths on the site
 * (/bottles/…, /media/…).
 */
// The shop's site. Installed apps keep calling the address they were built with: the server
// still serves the temporary https://89-126-205-132.sslip.io for the builds made before the
// domain (LEGACY_DOMAIN in deploy/vps/.env).
const DEFAULT_SITE_URL = "https://kyko.kz";

export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
export const API_URL = `${SITE_URL}/api`;

/** A photo URL the app can load: absolute URLs as they are, site paths on the site. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** A page of the website, for sharing a product. */
export function siteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/** The privacy policy, a page of the website (the stores link to it too). */
export const PRIVACY_URL = siteUrl("/privacy");

/** The public offer: the terms of sale accepted at checkout. */
export const OFFER_URL = siteUrl("/offer");
