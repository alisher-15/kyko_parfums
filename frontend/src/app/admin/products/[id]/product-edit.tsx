"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ProductForm } from "@/components/admin/ProductForm";
import { StockHistory } from "@/components/admin/StockHistory";
import { VariantsEditor } from "@/components/admin/VariantsEditor";
import { ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { AdminProduct } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function ProductEdit({ id }: { id: number }) {
  const router = useRouter();
  const { data: product, error, reload } = useApi<AdminProduct>(`/admin/products/${id}`);

  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!product) return <Spinner />;

  const remove = async () => {
    if (!confirm(`Удалить «${product.name}» со всеми объёмами? История заказов сохранится.`)) return;
    try {
      await api(`/admin/products/${id}`, { method: "DELETE" });
      router.replace("/admin/products");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="text-sm text-muted hover:text-ink">
        ← Все товары
      </Link>
      <AdminHeader
        title={
          <>
            <span className="text-muted">{product.brand.name}</span> {product.name}
          </>
        }
        actions={
          <>
            {product.is_active && (
              <Link href={`/products/${product.id}`} className="btn btn-outline btn-sm" target="_blank">
                Открыть на сайте
              </Link>
            )}
            <button className="btn btn-danger btn-sm" onClick={remove}>
              Удалить товар
            </button>
          </>
        }
      />
      <ProductForm key={product.updated_at} product={product} onSaved={reload} />
      <VariantsEditor productId={product.id} variants={product.variants} onChanged={reload} />
      <StockHistory
        productId={product.id}
        version={product.variants.map((v) => `${v.id}:${v.stock}`).join(",")}
      />
    </div>
  );
}
