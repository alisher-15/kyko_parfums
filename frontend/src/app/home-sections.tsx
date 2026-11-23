"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_RAIL_ITEM, RAIL_ITEM, Rail } from "@/components/Carousel";
import { GridIcon } from "@/components/icons";
import { ProductCard } from "@/components/ProductCard";
import { ErrorBox, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { childrenOf, useCategories } from "@/lib/categories";
import { dayMonth, percentOff } from "@/lib/format";
import type { Brand, Page, ProductListItem, PromotionPublic } from "@/lib/types";
import { useApi } from "@/lib/use-api";

function Section({ title, link, children }: { title: string; link: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 md:pt-12">
      <div className="mb-4 flex items-end justify-between gap-4 md:mb-5">
        <h2 className="font-serif text-2xl font-bold md:text-3xl">{title}</h2>
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
        <div key={p.id} className={`${PRODUCT_RAIL_ITEM} grid`}>
          <ProductCard product={p} compact />
        </div>
      ))}
      <Link
        href={more}
        className={`${PRODUCT_RAIL_ITEM} card flex items-center justify-center p-3 text-center text-sm font-semibold text-gold hover:border-gold`}
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

/**
 * The promotions running today, at the top of the page: a row of cards, several at once, that
 * scrolls sideways (swipe on phones, arrows on computers). Each opens its products in the catalog.
 */
export function HomePromotions() {
  const { data } = useApi<PromotionPublic[]>("/promotions");
  if (!data || data.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 md:pt-6">
      <Rail label="Баннеры акций">
        {data.map((p) => (
          <div key={p.id} className={RAIL_ITEM}>
            <PromotionCard promotion={p} />
          </div>
        ))}
      </Rail>
    </section>
  );
}

/**
 * One banner card, 3:2 on every screen (a 1200×800 picture fills it). A finished banner (its
 * text is on the picture) is shown whole, a picture of other proportions with a blurred copy of
 * itself around it. Otherwise the picture fills the card and the site writes the discount, the
 * end date and the title over it (or over a dark background).
 */
function PromotionCard({ promotion: p }: { promotion: PromotionPublic }) {
  const href = `/catalog?promotion_id=${p.id}`;
  if (p.image_only && p.image_url) {
    return (
      <Link href={href} className="relative block aspect-[3/2] overflow-hidden rounded-2xl bg-ink">
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
      className="group relative flex aspect-[3/2] flex-col justify-end overflow-hidden rounded-2xl bg-ink p-3 text-white md:p-4"
    >
      {p.image_url && (
        <img
          src={p.image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5">
          {p.discount_percent !== null && (
            <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold md:text-xs">
              {percentOff(p.discount_percent)}
            </span>
          )}
          {p.ends_on && <span className="text-[11px] text-stone-200 md:text-xs">до {dayMonth(p.ends_on)}</span>}
        </div>
        <div className="mt-1 line-clamp-2 font-serif text-sm leading-tight font-bold md:text-lg">{p.title}</div>
      </div>
    </Link>
  );
}

/** One tile: the picture on a light rounded square, the name under it (as on Kaspi). */
function CategoryTile({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex w-[4.75rem] snap-start flex-col items-center gap-1.5 md:w-24"
    >
      <span
        aria-hidden
        className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-stone-100 transition group-hover:bg-stone-200"
      >
        {children}
      </span>
      <span
        data-tile-label
        className="line-clamp-2 text-center text-xs leading-tight text-ink md:text-sm"
      >
        {label}
      </span>
    </Link>
  );
}

/**
 * The catalog's sections as tiles under the banners, as on Kaspi: two rows on phones that scroll
 * sideways, one row on computers; «Все категории» first (it opens /categories, every section as a
 * card). Sections without products are left out by the API; each tile has a picture (its own,
 * else a photo of its products).
 */
export function HomeCategories() {
  const tree = useCategories();
  const sections = tree ? childrenOf(tree, null) : [];
  if (sections.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 md:pt-8">
      <nav
        aria-label="Категории"
        className="rail -mx-4 grid snap-x grid-flow-col grid-rows-2 justify-start gap-x-3 gap-y-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:grid-rows-1 md:gap-x-5"
      >
        <CategoryTile href="/categories" label="Все категории">
          <GridIcon width={30} height={30} className="text-gold" />
        </CategoryTile>
        {sections.map((c) => (
          <CategoryTile
            key={c.id}
            href={`/catalog?category_id=${c.id}`}
            label={c.name}
          >
            {c.image_url ? (
              <img
                src={c.image_url}
                alt=""
                className="h-full w-full object-contain p-1.5 mix-blend-multiply"
              />
            ) : (
              <span className="font-serif text-2xl text-gold">
                {c.name.slice(0, 1)}
              </span>
            )}
          </CategoryTile>
        ))}
      </nav>
    </section>
  );
}

/**
 * «Горячие предложения»: the products marked «Новинка» in the admin panel; while none are, the
 * latest added. (Products on promotion are behind the banners at the top, so they have no block
 * of their own.)
 */
export function HomeHot() {
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
      title="Горячие предложения"
      link={
        <Link
          href={noneMarked ? "/catalog?sort=new" : "/catalog?is_new=true"}
          className="text-sm font-semibold text-gold"
        >
          {noneMarked ? "Все товары →" : "Все предложения →"}
        </Link>
      }
    >
      {shown.error && <ErrorBox>Не удалось загрузить товары: {shown.error.message}</ErrorBox>}
      {!shown.data && !shown.error && <Spinner />}
      {shown.data && (
        <ProductRail
          label="Горячие предложения"
          items={shown.data.items}
          more={noneMarked ? "/catalog?sort=new" : "/catalog?is_new=true"}
        />
      )}
    </Section>
  );
}

/** At least this many names in one pass of the running line, so it is wider than a screen. */
const MARQUEE_MIN = 10;

/**
 * The top houses (`is_top`, chosen in «Бренды») as a running line: logos where the brand has one,
 * else the name in large letters, each leading to the brand's products. It stops under the pointer
 * and keeps still for those who ask for reduced motion (then it scrolls by hand).
 */
export function BrandMarquee() {
  const { data } = useApi<Brand[]>("/brands");
  const top = (data ?? []).filter((b) => b.is_top).sort((a, b) => b.product_count - a.product_count);
  if (top.length === 0) return null;
  const pass = Array.from({ length: Math.ceil(MARQUEE_MIN / top.length) }, () => top).flat();
  return (
    <section className="pt-10 md:pt-14">
      <nav
        aria-label="Топовые бренды"
        className="rail overflow-x-auto border-y border-line bg-white py-5 md:py-7"
      >
        <div
          className="marquee flex w-max"
          style={{ ["--marquee-duration" as string]: `${pass.length * 3.5}s` }}
        >
          {[0, 1].map((copy) => (
            // The second copy only closes the loop: hidden from screen readers and the Tab key.
            <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1 || undefined}>
              {pass.map((b, i) => (
                <Link
                  key={`${b.id}-${i}`}
                  href={`/catalog?brand_id=${b.id}`}
                  // Repeats of the list (when it is short) are for the eye only, too.
                  tabIndex={copy === 1 || i >= top.length ? -1 : undefined}
                  aria-hidden={(copy === 0 && i >= top.length) || undefined}
                  className="group flex h-12 shrink-0 items-center px-6 md:h-16 md:px-10"
                  aria-label={b.name}
                >
                  {b.logo_url ? (
                    <img
                      src={b.logo_url}
                      alt=""
                      className="h-full max-w-40 object-contain opacity-50 mix-blend-multiply grayscale transition group-hover:opacity-100 md:max-w-56"
                    />
                  ) : (
                    <span className="font-serif text-2xl whitespace-nowrap text-stone-400 uppercase tracking-[0.12em] transition group-hover:text-ink md:text-4xl">
                      {b.name}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <div className="mx-auto max-w-7xl px-4 pt-3 text-right sm:px-6">
        <Link href="/brands" className="text-sm font-semibold text-gold">
          Все бренды →
        </Link>
      </div>
    </section>
  );
}
