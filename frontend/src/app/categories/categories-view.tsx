"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorBox, Spinner } from "@/components/ui";
import { categoryHref, childrenOf, pathOf } from "@/lib/categories";
import { plural } from "@/lib/format";
import type { Category } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/**
 * The catalog tree step by step, as Kaspi's «Категории»: the sections as cards (the name at the
 * top left, the picture at the bottom right, three in a row on phones); a section with groups
 * opens its groups the same way (`?parent=`), with «Все товары» of the section first; a node
 * without groups opens its products in the catalog. «Все категории» on the home page leads here.
 */
export function CategoriesView() {
  const params = useSearchParams();
  const { data, error } = useApi<Category[]>("/categories");
  const parentId = Number(params.get("parent")) || null;
  const parent = parentId && data ? data.find((c) => c.id === parentId) : undefined;
  // A link to a node that is gone (or has no products now) shows the sections.
  const nodes = data ? childrenOf(data, parent ? parent.id : null) : [];
  const path = parent && data ? pathOf(data, parent.id) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {parent && (
        <nav aria-label="Разделы" className="mb-1 flex flex-wrap items-center gap-1 text-sm text-muted">
          <Link href="/categories" className="hover:text-ink">
            Категории
          </Link>
          {path.slice(0, -1).map((c) => (
            <span key={c.id}>
              {" / "}
              <Link href={`/categories?parent=${c.id}`} className="hover:text-ink">
                {c.name}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <div className="mb-5 flex items-end justify-between gap-4">
        <h1 className="font-serif text-3xl font-bold sm:text-4xl">{parent ? parent.name : "Категории"}</h1>
        <Link
          href={parent ? `/catalog?category_id=${parent.id}` : "/catalog"}
          className="shrink-0 text-sm font-semibold text-gold hover:text-gold-dark"
        >
          Все товары →
        </Link>
      </div>
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {!data && !error && <Spinner />}
      <nav aria-label="Категории" className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
        {parent && (
          <Link
            href={`/catalog?category_id=${parent.id}`}
            className="flex aspect-square flex-col justify-between rounded-2xl bg-ink p-2.5 text-white transition hover:bg-stone-800 sm:p-3.5"
          >
            <span className="text-[13px] leading-tight font-medium sm:text-base">Все товары</span>
            <span className="text-[11px] text-stone-300 sm:text-xs">
              {parent.product_count} {plural(parent.product_count, "товар", "товара", "товаров")} →
            </span>
          </Link>
        )}
        {data &&
          nodes.map((c) => (
            <CategoryCard key={c.id} category={c} href={categoryHref(data, c)} />
          ))}
      </nav>
    </div>
  );
}

function CategoryCard({ category: c, href }: { category: Category; href: string }) {
  return (
    <Link
      href={href}
      className="group relative block aspect-square overflow-hidden rounded-2xl bg-stone-100 transition hover:bg-stone-200"
    >
      <span className="relative z-10 block p-2.5 text-[13px] leading-tight font-medium text-ink sm:p-3.5 sm:text-base">
        {c.name}
      </span>
      {c.image_url ? (
        // White photo backgrounds melt into the card, as on Kaspi.
        <img
          src={c.image_url}
          alt=""
          className="absolute right-0 bottom-0 h-[68%] w-[78%] object-contain object-right-bottom mix-blend-multiply transition group-hover:scale-105"
        />
      ) : (
        <span
          aria-hidden
          className="absolute right-2 bottom-0 font-serif text-6xl leading-none text-gold/40 sm:text-7xl"
        >
          {c.name.slice(0, 1)}
        </span>
      )}
    </Link>
  );
}
