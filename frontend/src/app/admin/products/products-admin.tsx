"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useOptimistic, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ErrorBox, Pagination, ProductImage, Spinner } from "@/components/ui";
import { GENDER_LABELS, money, volumeLabel } from "@/lib/format";
import { PRODUCTS_LIST, rememberProductsList } from "@/lib/products-list";
import type { AdminProduct, Brand, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 50;

type Filter =
  | "q"
  | "brand_id"
  | "is_active"
  | "no_variants"
  | "backordered"
  | "is_new"
  | "no_photo"
  | "page";

/**
 * The search, filters and page are the URL's (/admin/products?no_photo=true&page=2), so the list
 * comes back as it was after opening a product: by the browser's back button, and by the
 * product's «← К списку товаров», which leads to the list last shown here.
 */
export function ProductsAdmin() {
  const committed = useSearchParams().toString();
  // A changed filter shows at once; the URL catches up when the navigation completes.
  const [query, setOptimisticQuery] = useOptimistic(committed);
  const params = new URLSearchParams(query);
  const router = useRouter();
  const search = params.get("q") ?? "";
  const brandId = params.get("brand_id") ?? "";
  const active = params.get("is_active") ?? "";
  const noVariants = params.get("no_variants") === "true";
  const backordered = params.get("backordered") === "true";
  const onlyNew = params.get("is_new") === "true";
  const noPhoto = params.get("no_photo") === "true";
  const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1);

  useEffect(() => {
    rememberProductsList(committed ? `${PRODUCTS_LIST}?${committed}` : PRODUCTS_LIST);
  }, [committed]);

  /** Changes the list's URL; any change but the page itself starts from page 1. */
  const setFilters = (changes: Partial<Record<Filter, string | number | boolean>>) => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) {
      if (value === "" || value === false) next.delete(key);
      else next.set(key, String(value));
    }
    if (!("page" in changes) || next.get("page") === "1") next.delete("page");
    const qs = next.toString();
    startTransition(() => {
      setOptimisticQuery(qs);
      router.replace(qs ? `${PRODUCTS_LIST}?${qs}` : PRODUCTS_LIST, { scroll: false });
    });
  };

  const brands = useApi<Brand[]>("/admin/brands");
  const { data, error, loading } = useApi<Page<AdminProduct>>("/admin/products", {
    query: {
      q: search,
      brand_id: brandId,
      is_active: active,
      no_variants: noVariants || undefined,
      backordered: backordered || undefined,
      is_new: onlyNew || undefined,
      no_photo: noPhoto || undefined,
      page,
      page_size: PAGE_SIZE,
    },
  });

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
        <SearchForm key={search} search={search} onSearch={(q) => setFilters({ q })} />
        <select className="input w-auto" value={brandId} onChange={(e) => setFilters({ brand_id: e.target.value })}>
          <option value="">Все бренды</option>
          {brands.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={active} onChange={(e) => setFilters({ is_active: e.target.value })}>
          <option value="">Все</option>
          <option value="true">Опубликованные</option>
          <option value="false">Скрытые</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-gold"
            checked={noVariants}
            onChange={(e) => setFilters({ no_variants: e.target.checked })}
          />
          Без цен/объёмов
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-gold"
            checked={backordered}
            onChange={(e) => setFilters({ backordered: e.target.checked })}
          />
          Нужно заказать
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-gold"
            checked={onlyNew}
            onChange={(e) => setFilters({ is_new: e.target.checked })}
          />
          Новинки
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-gold"
            checked={noPhoto}
            onChange={(e) => setFilters({ no_photo: e.target.checked })}
          />
          Без фото
        </label>
      </div>

      {error && <ErrorBox>{error.message}</ErrorBox>}
      {loading && !data && <Spinner />}
      {data && (
        <div className={loading ? "opacity-60" : ""}>
          {/* Phones: each product is one big tappable card. */}
          <div className="space-y-3 md:hidden">
            {data.items.map((p) => (
              <Link
                key={p.id}
                href={`/admin/products/${p.id}`}
                className="card flex gap-3 p-3 active:bg-cream"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white">
                  <ProductImage src={p.image_url ?? p.variants[0]?.photo_url} alt={p.name} seed={p.id} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-muted">{p.brand.name}</div>
                      <div className="font-semibold">{p.name}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`chip ${p.is_active ? "text-emerald-700" : ""}`}>
                        {p.is_active ? "На сайте" : "Скрыт"}
                      </span>
                      {p.is_new && <span className="chip text-gold-dark">Новинка</span>}
                    </div>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs">
                    {p.variants.length === 0 ? (
                      <span className="text-amber-700">нет объёмов и цен</span>
                    ) : (
                      p.variants.map((v) => (
                        <div key={v.id} className={v.is_active ? "" : "text-muted line-through"}>
                          <b>{volumeLabel(v.volume_ml, v.is_tester)}</b> · {money(v.retail_price)} ·{" "}
                          <span className={v.stock <= 3 ? "font-semibold text-red-600" : ""}>
                            {v.stock} шт.
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <span className="self-center text-muted" aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>

          {/* Desktop: the whole row opens the product. */}
          <div className="card hidden overflow-x-auto md:block">
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
                  <tr
                    key={p.id}
                    className="cursor-pointer hover:bg-cream"
                    onClick={() => router.push(`/admin/products/${p.id}`)}
                  >
                    <td>
                      <div className="h-10 w-10 overflow-hidden rounded-lg bg-white">
                        <ProductImage src={p.image_url ?? p.variants[0]?.photo_url} alt={p.name} seed={p.id} />
                      </div>
                    </td>
                    <td>
                      <div className="text-xs text-muted">{p.brand.name}</div>
                      <Link href={`/admin/products/${p.id}`} className="font-semibold text-ink hover:text-gold">
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
                            <b>{volumeLabel(v.volume_ml, v.is_tester)}</b>: {money(v.retail_price)} /{" "}
                            {money(v.wholesale_price)} /{" "}
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
                      <div className="flex flex-col items-start gap-1">
                        <span className={`chip ${p.is_active ? "text-emerald-700" : ""}`}>
                          {p.is_active ? "На сайте" : "Скрыт"}
                        </span>
                        {p.is_new && <span className="chip text-gold-dark">Новинка</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data && <Pagination
          page={page}
          total={data.total}
          pageSize={PAGE_SIZE}
          onChange={(p) => setFilters({ page: p })}
        />}
    </>
  );
}

/** The search box: typed text is only applied on «Найти». Keyed by the applied search. */
function SearchForm({ search, onSearch }: { search: string; onSearch: (q: string) => void }) {
  const [q, setQ] = useState(search);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(q.trim());
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
  );
}
