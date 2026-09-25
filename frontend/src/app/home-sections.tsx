"use client";

import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { ErrorBox, Spinner } from "@/components/ui";
import type { Brand, Page, ProductListItem } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function HomeProducts() {
  const { data, error, loading } = useApi<Page<ProductListItem>>("/products", {
    query: { sort: "new", page_size: 8 },
  });
  if (error) return <ErrorBox>Не удалось загрузить товары: {error.message}</ErrorBox>;
  if (loading && !data) return <Spinner />;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {data?.items.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}

export function HomeBrands() {
  const { data } = useApi<Brand[]>("/brands");
  if (!data) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {data.slice(0, 24).map((b) => (
        <Link
          key={b.id}
          href={`/catalog?brand_id=${b.id}`}
          className="rounded-full border border-line bg-white px-4 py-2 text-sm hover:border-gold"
        >
          {b.name} <span className="text-muted">· {b.product_count}</span>
        </Link>
      ))}
    </div>
  );
}
