import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Made on each request, like the sitemap: the address is the running site's.
export const dynamic = "force-dynamic";

/** Search engines index the shop, not the admin panel, accounts, checkout or the API. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/cart", "/checkout", "/orders", "/login", "/register", "/forgot-password", "/reset-password", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
