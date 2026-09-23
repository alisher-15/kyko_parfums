"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ErrorBox, Pagination, ProductImage, Spinner } from "@/components/ui";
import { GENDER_LABELS, money } from "@/lib/format";
import type { AdminProduct, Brand, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 50;

export function ProductsAdmin({
  initialNoVariants,
  initialBrandId,
}: {
  initialNoVariants: boolean;
  initialBrandId: string;
}) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [brandId, setBrandId] = useState(initialBrandId);
  const [active, setActive] = useState("");
  const [noVariants, setNoVariants] = useState(initialNoVariants);
  const [page, setPage] = useState(1);

  const brands = useApi<Brand[]>("/admin/brands");
  const { data, error, loading } = useApi<Page<AdminProduct>>("/admin/products", {
    query: {
      q: search,
      brand_id: brandId,
      is_active: active,
      no_variants: noVariants || undefined,
      page,
      page_size: PAGE_SIZE,
    },
  });

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <>
      <AdminHeader
        title={`Товары${data ? ` · ${data.total}` : ""}`}
        actions={
          <Link href="/admin/products/new" className="btn btn-primary btn-sm">
            + Добавить товар
          </Link>
        }
      />
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q);
            setPage(1);
          }}
          className="flex flex-1 gap-2"
        >
          <input
            className="input min-w-48"
            placeholder="Название или бренд"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn btn-outline btn-sm">Найти</button>
        </form>
        <select className="input w-auto" value={brandId} onChange={(e) => resetPage(setBrandId)(e.target.value)}>
          <option value="">Все бренды</option>
          {brands.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={active} onChange={(e) => resetPage(setActive)(e.target.value)}>
          <option value="">Все</option>
          <option value="true">Опубликованные</option>
          <option value="false">Скрытые</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-gold"
            checked={noVariants}
            onChange={(e) => resetPage(setNoVariants)(e.target.checked)}
          />
          Без цен/объёмов
        </label>
      </div>

      {error && <ErrorBox>{error.message}</ErrorBox>}
      {loading && !data && <Spinner />}
      {data && (
        <div className={`card overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-14"></th>
                <th>Товар</th>
                <th>Тип / пол</th>
                <th>Объёмы и цены (розн. / опт / кр. опт)</th>
                <th>Остаток</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="hover:bg-cream">
                  <td>
                    <div className="h-10 w-10 overflow-hidden rounded-lg bg-white">
                      <ProductImage src={p.image_url ?? p.variants[0]?.photo_url} alt={p.name} seed={p.id} />
                    </div>
                  </td>
                  <td>
                    <div className="text-xs text-muted">{p.brand.name}</div>
                    <Link href={`/admin/products/${p.id}`} className="font-semibold hover:text-gold">
                      {p.name}
                    </Link>
                  </td>
                  <td className="text-xs">
                    {[p.type, p.gender && GENDER_LABELS[p.gender], p.category].filter(Boolean).join(" · ")}
                  </td>
                  <td className="text-xs">
                    {p.variants.length === 0 ? (
                      <span className="text-amber-700">нет вариантов</span>
                    ) : (
                      p.variants.map((v) => (
                        <div key={v.id} className={v.is_active ? "" : "text-muted line-through"}>
                          <b>{v.volume_ml} мл</b>: {money(v.retail_price)} / {money(v.wholesale_price)} /{" "}
                          {money(v.bulk_price)}
                        </div>
                      ))
                    )}
                  </td>
                  <td className="text-xs">
                    {p.variants.map((v) => (
                      <div key={v.id} className={v.stock <= 3 ? "font-semibold text-red-600" : ""}>
                        {v.stock} шт.
                      </div>
                    ))}
                  </td>
                  <td>
                    <span className={`chip ${p.is_active ? "text-emerald-700" : ""}`}>
                      {p.is_active ? "На сайте" : "Скрыт"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />}
    </>
  );
}
