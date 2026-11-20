import type { MetadataRoute } from "next";
import { SITE_URL, publicApi } from "@/lib/site";

// Made on each request from the catalog (the API isn't there when the site is built).
export const dynamic = "force-dynamic";

interface SitemapData {
  products: { id: number; updated_at: string }[];
  brand_ids: number[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await publicApi<SitemapData>("/sitemap");
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/brands`, changeFrequency: "weekly", priority: 0.6 },
    ...(data?.brand_ids ?? []).map((id) => ({
      url: `${SITE_URL}/catalog?brand_id=${id}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...(data?.products ?? []).map((p) => ({
      url: `${SITE_URL}/products/${p.id}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
