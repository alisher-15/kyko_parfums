"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { FilterIcon } from "@/components/icons";
import { ProductCard } from "@/components/ProductCard";
import { Empty, ErrorBox, Pagination, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { CURRENCY, GENDER_LABELS, money, plural } from "@/lib/format";
import type { Filters, Page, ProductListItem } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 24;

const SORTS = [
  { value: "default", label: "По умолчанию" },
  { value: "price_asc", label: "Сначала дешевле" },
  { value: "price_desc", label: "Сначала дороже" },
  { value: "name", label: "По названию" },
  { value: "new", label: "Новинки" },
];

export function CatalogView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [showFilters, setShowFilters] = useState(false);
  const { user } = useAuth();

  const query = useMemo(
    () => ({
      q: params.get("q") ?? undefined,
      brand_id: params.getAll("brand_id"),
      gender: params.getAll("gender"),
      category: params.getAll("category"),
      type: params.getAll("type"),
      min_price: params.get("min_price") ?? undefined,
      max_price: params.get("max_price") ?? undefined,
      sort: params.get("sort") ?? undefined,
      page: Number(params.get("page") ?? 1),
      page_size: PAGE_SIZE,
    }),
    [params],
  );

  const products = useApi<Page<ProductListItem>>("/products", { query });
  const filters = useApi<Filters>("/filters");

  const update = (mutate: (p: URLSearchParams) => void, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    if (resetPage) next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const toggle = (key: string, value: string) =>
    update((p) => {
      const values = p.getAll(key);
      p.delete(key);
      const nextValues = values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value];
      nextValues.forEach((v) => p.append(key, v));
    });

  const activeCount =
    query.brand_id.length +
    query.gender.length +
    query.category.length +
    query.type.length +
    (query.min_price ? 1 : 0) +
    (query.max_price ? 1 : 0);

  const total = products.data?.total ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-bold">
            {query.q ? `«${query.q}»` : "Каталог ароматов"}
          </h1>
          {products.data && (
            <p className="mt-1 text-sm text-muted">
              {total} {plural(total, "товар", "товара", "товаров")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-outline btn-sm lg:hidden"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FilterIcon width={16} height={16} /> Фильтры{activeCount ? ` (${activeCount})` : ""}
          </button>
          <select
            className="input w-auto rounded-full"
            value={query.sort ?? "default"}
            onChange={(e) => update((p) => p.set("sort", e.target.value))}
            aria-label="Сортировка"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className={`${showFilters ? "block" : "hidden"} lg:block`}>
          {filters.data && (
            <FilterPanel
              filters={filters.data}
              query={query}
              toggle={toggle}
              update={update}
              activeCount={activeCount}
            />
          )}
        </aside>

        <section>
          {(!user || user.role === "retail") && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-5 py-4 text-white">
              <div>
                <div className="font-semibold">Для магазинов и салонов — оптовые цены</div>
                <div className="text-sm text-stone-300">
                  Оставьте заявку: после проверки цены в каталоге станут оптовыми.
                </div>
              </div>
              <Link
                href={user ? "/account" : "/register?next=/account"}
                className="btn btn-gold btn-sm"
              >
                Оставить заявку
              </Link>
            </div>
          )}
          {products.error && <ErrorBox>{products.error.message}</ErrorBox>}
          {products.loading && !products.data && <Spinner />}
          {products.data && products.data.items.length === 0 && (
            <Empty title="Ничего не найдено">Попробуйте изменить фильтры или запрос.</Empty>
          )}
          <div
            className={`grid grid-cols-2 gap-4 md:grid-cols-3 ${products.loading ? "opacity-60" : ""}`}
          >
            {products.data?.items.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
          {products.data && (
            <Pagination
              page={query.page}
              total={products.data.total}
              pageSize={PAGE_SIZE}
              onChange={(page) => {
                update((p) => p.set("page", String(page)), false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-line py-4">
      <div className="label mb-2">{title}</div>
      {children}
    </div>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-gold" />
      <span className="flex-1">{children}</span>
    </label>
  );
}

function FilterPanel({
  filters,
  query,
  toggle,
  update,
  activeCount,
}: {
  filters: Filters;
  query: {
    brand_id: string[];
    gender: string[];
    category: string[];
    type: string[];
    min_price?: string;
    max_price?: string;
  };
  toggle: (key: string, value: string) => void;
  update: (mutate: (p: URLSearchParams) => void) => void;
  activeCount: number;
}) {
  const [brandSearch, setBrandSearch] = useState("");
  const [minPrice, setMinPrice] = useState(query.min_price ?? "");
  const [maxPrice, setMaxPrice] = useState(query.max_price ?? "");

  const brands = filters.brands.filter((b) =>
    b.name.toLowerCase().includes(brandSearch.trim().toLowerCase()),
  );

  const applyPrice = (e: FormEvent) => {
    e.preventDefault();
    update((p) => {
      if (minPrice) p.set("min_price", minPrice);
      else p.delete("min_price");
      if (maxPrice) p.set("max_price", maxPrice);
      else p.delete("max_price");
    });
  };

  return (
    <div className="card px-4">
      <FilterGroup title="Для кого">
        {filters.genders.map((g) => (
          <Check key={g} checked={query.gender.includes(g)} onChange={() => toggle("gender", g)}>
            {GENDER_LABELS[g]}
          </Check>
        ))}
      </FilterGroup>

      <FilterGroup title={`Цена, ${CURRENCY}`}>
        <form onSubmit={applyPrice} className="flex items-center gap-2">
          <input
            className="input"
            inputMode="numeric"
            placeholder="от"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))}
          />
          <input
            className="input"
            inputMode="numeric"
            placeholder="до"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))}
          />
          <button className="btn btn-outline btn-sm" type="submit">
            OK
          </button>
        </form>
        {filters.price_min !== null && filters.price_max !== null && (
          <p className="mt-1.5 text-xs text-muted">
            {money(filters.price_min)} — {money(filters.price_max)}
          </p>
        )}
      </FilterGroup>

      <FilterGroup title="Бренд">
        {filters.brands.length > 8 && (
          <input
            className="input mb-2"
            placeholder="Найти бренд"
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
          />
        )}
        <div className="max-h-64 overflow-y-auto pr-1">
          {brands.map((b) => (
            <Check
              key={b.id}
              checked={query.brand_id.includes(String(b.id))}
              onChange={() => toggle("brand_id", String(b.id))}
            >
              {b.name} <span className="text-xs text-muted">{b.product_count}</span>
            </Check>
          ))}
        </div>
      </FilterGroup>

      {filters.categories.length > 0 && (
        <FilterGroup title="Олфактивная группа">
          <div className="max-h-64 overflow-y-auto pr-1">
            {filters.categories.map((c) => (
              <Check
                key={c}
                checked={query.category.includes(c)}
                onChange={() => toggle("category", c)}
              >
                {c}
              </Check>
            ))}
          </div>
        </FilterGroup>
      )}

      {filters.types.length > 0 && (
        <FilterGroup title="Тип">
          <div className="flex flex-wrap gap-1.5">
            {filters.types.map((t) => (
              <button
                key={t}
                onClick={() => toggle("type", t)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  query.type.includes(t)
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white hover:border-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </FilterGroup>
      )}

      {activeCount > 0 && (
        <div className="py-4">
          <button
            className="btn btn-outline btn-sm w-full"
            onClick={() => {
              setMinPrice("");
              setMaxPrice("");
              update((p) =>
                ["brand_id", "gender", "category", "type", "min_price", "max_price"].forEach(
                  (k) => p.delete(k),
                ),
              );
            }}
          >
            Сбросить фильтры
          </button>
        </div>
      )}
    </div>
  );
}
