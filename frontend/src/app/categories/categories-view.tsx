"use client";

import Link from "next/link";
import { ErrorBox, Spinner } from "@/components/ui";
import { childrenOf } from "@/lib/categories";
import type { Category } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/**
 * Every section as a card, as Kaspi's «Категории»: the name at the top left, the picture at the
 * bottom right, three in a row on phones. «Все категории» on the home page leads here; a card
 * opens the section in the catalog, with its groups as chips.
 */
export function CategoriesView() {
  const { data, error } = useApi<Category[]>("/categories");
  const sections = data ? childrenOf(data, null) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h1 className="font-serif text-3xl font-bold sm:text-4xl">Категории</h1>
        <Link href="/catalog" className="text-sm font-semibold text-gold hover:text-gold-dark">
          Все товары →
        </Link>
      </div>
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {!data && !error && <Spinner />}
      <nav aria-label="Категории" className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
        {sections.map((c) => (
          <CategoryCard key={c.id} category={c} />
        ))}
      </nav>
    </div>
  );
}

function CategoryCard({ category: c }: { category: Category }) {
  return (
    <Link
      href={`/catalog?category_id=${c.id}`}
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
