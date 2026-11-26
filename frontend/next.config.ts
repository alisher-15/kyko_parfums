import type { NextConfig } from "next";

// The browser talks only to the Next.js origin; /api and /media are proxied to FastAPI.
// Rewrites are resolved at build time, so BACKEND_URL must be set for `next build` too.
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

// Scripts, styles, fonts and API calls only from this site, so an injected script can't load
// code from elsewhere or send a stolen session away. Next.js needs inline scripts (no nonces
// here: pages are static); photos may come from anywhere over https (R2, links in imports).
// Analytics (components/Analytics.tsx) adds its own hosts only when its counter id is set.
const ym = process.env.NEXT_PUBLIC_YM_ID ? ["https://mc.yandex.ru", "https://mc.yandex.com"] : [];
const ga = process.env.NEXT_PUBLIC_GA_ID
  ? ["https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.analytics.google.com"]
  : [];
const csp = [
  "default-src 'self'",
  ["script-src 'self' 'unsafe-inline'", ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []), ...ym, ...ga].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  ["connect-src 'self'", ...ym, ...ga].join(" "),
  ["frame-src 'self'", ...ym].join(" "),
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Browsers that came once over HTTPS never try plain HTTP again (ignored over http in dev).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The camera is used by the barcode scanner in the admin panel.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/media/:path*", destination: `${backendUrl}/media/:path*` },
    ];
  },
};

export default nextConfig;
