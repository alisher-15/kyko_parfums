"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { FilterIcon } from "@/components/icons";
import { ProductCard } from "@/components/ProductCard";
import { Empty, ErrorBox, Pagination, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { childrenOf, pathOf, useCategories } from "@/lib/categories";
import { CURRENCY, GENDER_LABELS, dayMonth, money, percentOff, plural } from "@/lib/format";
import type { Filters, ProductPage, PromotionPublic } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 24;

const SORTS = [
  { value: "default", label: "По умолчанию" },
  { value: "price_asc", label: "Сначала дешевле" },
  { value: "price_desc", label: "Сначала дороже" },
  { value: "name", label: "По названию" },
  { value: "new", label: "Новинки" },
  { value: "popular", label: "Популярные" },
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
      type: params.getAll("type"),
      min_price: params.get("min_price") ?? undefined,
      max_price: params.get("max_price") ?? undefined,
      is_new: params.get("is_new") === "true" || undefined,
      on_sale: params.get("on_sale") === "true" || undefined,
      tester: params.get("tester") === "true" || undefined,
      top: params.get("top") === "true" || undefined,
      promotion_id: params.get("promotion_id") ?? undefined,
      category_id: params.get("category_id") ?? undefined,
      sort: params.get("sort") ?? undefined,
      page: Number(params.get("page") ?? 1),
      page_size: PAGE_SIZE,
    }),
    [params],
  );

  const products = useApi<ProductPage>("/products", { query });
  // Within a section the filters offer only what it has (no «Для кого» for most cosmetics).
  const filters = useApi<Filters>("/filters", {
    query: { category_id: query.category_id },
  });
  const tree = useCategories();
  const node = query.category_id
    ? tree?.find((c) => String(c.id) === query.category_id)
    : undefined;
  const path = node && tree ? pathOf(tree, node.id) : [];
  // Chips under the title: a section's groups; on a group, its own groups or its siblings.
  const chipParent = node
    ? childrenOf(tree ?? [], node.id).length
      ? node.id
      : node.parent_id
    : null;
  const chips =
    tree && !query.q && !query.promotion_id ? childrenOf(tree, chipParent) : [];
  const promotion = useApi<PromotionPublic>(
    query.promotion_id ? `/promotions/${encodeURIComponent(query.promotion_id)}` : null,
  );

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
    query.type.length +
    (query.min_price ? 1 : 0) +
    (query.max_price ? 1 : 0) +
    (query.is_new ? 1 : 0) +
    (query.on_sale ? 1 : 0) +
    (query.tester ? 1 : 0) +
    (query.top ? 1 : 0) +
    (query.promotion_id ? 1 : 0);

  const total = products.data?.total ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          {path.length > 0 && (
            <nav
              aria-label="Разделы"
              className="mb-1 flex flex-wrap items-center gap-1 text-sm text-muted"
            >
              <Link href="/catalog" className="hover:text-ink">
                Каталог
              </Link>
              {path.slice(0, -1).map((c) => (
                <span key={c.id}>
                  {" / "}
                  <Link
                    href={`/catalog?category_id=${c.id}`}
                    className="hover:text-ink"
                  >
                    {c.name}
                  </Link>
                </span>
              ))}
            </nav>
          )}
          <h1 className="font-serif text-4xl font-bold">
            {query.q
              ? `«${query.q}»`
              : query.promotion_id
                ? (promotion.data?.title ?? "Акция")
                : node
                  ? node.name
                  : query.on_sale
                    ? "Акции"
                    : query.is_new
                      ? "Выбор Kyko"
                      : query.tester
                        ? "Тестеры"
                        : query.top
                          ? "Ниша и люкс"
                      : "Каталог"}
          </h1>
          {promotion.data && (
            <p className="mt-1 max-w-2xl text-sm">
              {promotion.data.discount_percent !== null && (
                <b className="text-gold">{percentOff(promotion.data.discount_percent)} </b>
              )}
              {promotion.data.ends_on && `до ${dayMonth(promotion.data.ends_on)}. `}
              {promotion.data.description}
            </p>
          )}
          {promotion.error && (
            <p className="mt-1 text-sm text-muted">Эта акция уже закончилась.</p>
          )}
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

      {chips.length > 0 && (
        <div
          className="rail -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
          aria-label="Подразделы"
        >
          {node && chipParent === node.id && (
            <span className="shrink-0 rounded-full bg-ink px-4 py-1.5 text-sm text-white">
              Все
            </span>
          )}
          {chips.map((c) => (
            <Link
              key={c.id}
              href={`/catalog?category_id=${c.id}`}
              aria-current={node?.id === c.id ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${
                node?.id === c.id
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white hover:border-gold"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className={`${showFilters ? "block" : "hidden"} lg:block`}>
          {filters.data && (
            <FilterPanel
              // The price fields start from the address: a header link or Back that changes it
              // must not leave an old limit typed in.
              key={`${query.min_price ?? ""}-${query.max_price ?? ""}`}
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
          {products.data?.similar && (
            <p className="mb-4 text-sm text-muted">
              Точно по запросу «{query.q}» ничего нет. Похожие товары:
            </p>
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
    type: string[];
    min_price?: string;
    max_price?: string;
    is_new?: boolean;
    on_sale?: boolean;
    tester?: boolean;
    top?: boolean;
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

  const flag = (key: "is_new" | "on_sale" | "tester" | "top") =>
    update((p) => (p.get(key) === "true" ? p.delete(key) : p.set(key, "true")));

  return (
    <div className="card px-4">
      <FilterGroup title="Подборки">
        <Check checked={!!query.on_sale} onChange={() => flag("on_sale")}>
          Акции
        </Check>
        <Check checked={!!query.is_new} onChange={() => flag("is_new")}>
          Выбор Kyko
        </Check>
        <Check checked={!!query.tester} onChange={() => flag("tester")}>
          Тестеры
        </Check>
        <Check checked={!!query.top} onChange={() => flag("top")}>
          Ниша и люкс
        </Check>
      </FilterGroup>

      {filters.genders.length > 0 && (
        <FilterGroup title="Для кого">
          {filters.genders.map((g) => (
            <Check key={g} checked={query.gender.includes(g)} onChange={() => toggle("gender", g)}>
              {GENDER_LABELS[g]}
            </Check>
          ))}
        </FilterGroup>
      )}

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
                [
                  "brand_id",
                  "gender",
                  "type",
                  "min_price",
                  "max_price",
                  "is_new",
                  "on_sale",
                  "tester",
                  "top",
                  "promotion_id",
                ].forEach((k) => p.delete(k)),
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
