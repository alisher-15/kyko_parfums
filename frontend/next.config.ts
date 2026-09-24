import type { NextConfig } from "next";

// The browser talks only to the Next.js origin; /api and /media are proxied to FastAPI.
// Rewrites are resolved at build time, so BACKEND_URL must be set for `next build` too.
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/media/:path*", destination: `${backendUrl}/media/:path*` },
    ];
  },
};

export default nextConfig;
