"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { RAIL_ITEM, Rail, Slider } from "@/components/Carousel";
import { ProductCard } from "@/components/ProductCard";
import { ErrorBox, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { dayMonth, percentOff } from "@/lib/format";
import type { Brand, Page, ProductListItem, PromotionPublic } from "@/lib/types";
import { useApi } from "@/lib/use-api";

function Section({ title, link, children }: { title: string; link: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="font-serif text-3xl font-bold">{title}</h2>
        {link}
      </div>
      {children}
    </section>
  );
}

/** One sideways row of products, ending with a link to all of them. */
function ProductRail({ label, items, more }: { label: string; items: ProductListItem[]; more: string }) {
  return (
    <Rail label={label}>
      {items.map((p) => (
        <div key={p.id} className={`${RAIL_ITEM} grid`}>
          <ProductCard product={p} />
        </div>
      ))}
      <Link
        href={more}
        className={`${RAIL_ITEM} card flex items-center justify-center p-6 text-center font-semibold text-gold hover:border-gold`}
      >
        Смотреть все →
      </Link>
    </Rail>
  );
}

/**
 * One line for shops and resellers: wholesale prices come with the wholesale status. Guests go
 * to registration (it ends on the account page with the request), a retail customer straight to
 * the request; wholesale customers and admins don't see it.
 */
export function WholesaleStrip() {
  const { user, loading } = useAuth();
  if (loading || (user && user.role !== "retail")) return null;
  return (
    <div className="border-b border-line bg-cream">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center text-sm sm:px-6">
        <span className="text-muted">Для магазинов и перепродажи — оптовые цены</span>
        <Link href={user ? "/account#upgrade" : "/register"} className="font-semibold text-gold hover:text-ink">
          Стать оптовым клиентом →
        </Link>
      </div>
    </div>
  );
}

/** Banners of the promotions running today, each opening its products in the catalog. */
export function HomePromotions() {
  const { data } = useApi<PromotionPublic[]>("/promotions");
  if (!data || data.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
      <Slider
        label="Баннеры акций"
        slides={data.map((p) => (
          <PromotionSlide key={p.id} promotion={p} />
        ))}
      />
    </section>
  );
}

/**
 * One banner. A finished banner (its text is on the picture) is shown whole, with a blurred
 * copy of it filling the rest of the slot; otherwise the site writes the title, dates and
 * discount over the picture, or over a dark background without one.
 */
function PromotionSlide({ promotion: p }: { promotion: PromotionPublic }) {
  const href = `/catalog?promotion_id=${p.id}`;
  if (p.image_only && p.image_url) {
    return (
      <Link
        href={href}
        className="relative block h-full min-h-56 overflow-hidden rounded-2xl bg-ink md:min-h-72"
      >
        <img
          src={p.image_url}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
        />
        <img src={p.image_url} alt={p.title} className="absolute inset-0 h-full w-full object-contain" />
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className="group relative flex h-full min-h-56 flex-col justify-end overflow-hidden rounded-2xl bg-ink p-6 text-white md:min-h-72 md:px-20 md:py-10"
    >
      {p.image_url && (
        <img
          src={p.image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          {p.discount_percent !== null && (
            <span className="rounded-full bg-gold px-3 py-1 text-sm font-bold">
              {percentOff(p.discount_percent)}
            </span>
          )}
          {p.ends_on && <span className="text-xs text-stone-200">до {dayMonth(p.ends_on)}</span>}
        </div>
        <div className="mt-2 font-serif text-3xl leading-tight font-bold">{p.title}</div>
        {p.description && <p className="mt-1 max-w-xl text-sm text-stone-200">{p.description}</p>}
        <span className="mt-3 inline-block text-sm font-semibold text-gold">Смотреть →</span>
      </div>
    </Link>
  );
}

/** Products a running promotion gives a discount on. */
export function HomeSale() {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    query: { on_sale: true, page_size: 12 },
  });
  if (!data || data.total === 0) return null;
  return (
    <Section
      title="Акции"
      link={
        <Link href="/catalog?on_sale=true" className="text-sm font-semibold text-gold">
          Все акции →
        </Link>
      }
    >
      <ProductRail label="Акции" items={data.items} more="/catalog?on_sale=true" />
    </Section>
  );
}

/** Products marked «Новинка» in the admin panel; while none are, the latest added. */
export function HomeNew() {
  const marked = useApi<Page<ProductListItem>>("/products", {
    query: { is_new: true, sort: "new", page_size: 12 },
  });
  const noneMarked = marked.data?.total === 0;
  const latest = useApi<Page<ProductListItem>>(noneMarked ? "/products" : null, {
    query: { sort: "new", page_size: 12 },
  });
  const shown = noneMarked ? latest : marked;
  return (
    <Section
      title="Новые поступления"
      link={
        <Link
          href={noneMarked ? "/catalog?sort=new" : "/catalog?is_new=true"}
          className="text-sm font-semibold text-gold"
        >
          {noneMarked ? "Все товары →" : "Все новинки →"}
        </Link>
      }
    >
      {shown.error && <ErrorBox>Не удалось загрузить товары: {shown.error.message}</ErrorBox>}
      {!shown.data && !shown.error && <Spinner />}
      {shown.data && (
        <ProductRail
          label="Новые поступления"
          items={shown.data.items}
          more={noneMarked ? "/catalog?sort=new" : "/catalog?is_new=true"}
        />
      )}
    </Section>
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
