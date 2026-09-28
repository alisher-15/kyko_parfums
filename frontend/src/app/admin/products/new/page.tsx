"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ProductForm } from "@/components/admin/ProductForm";
import { useProductsListHref } from "@/lib/products-list";

export default function NewProductPage() {
  const router = useRouter();
  const listHref = useProductsListHref();
  return (
    <>
      <Link href={listHref} className="text-sm text-muted hover:text-ink">
        ← К списку товаров
      </Link>
      <AdminHeader title="Новый товар" />
      <p className="mb-4 text-sm text-muted">
        После создания товара добавьте объёмы с ценами и остатками.
      </p>
      <ProductForm onSaved={(p) => router.replace(`/admin/products/${p.id}`)} />
    </>
  );
}
