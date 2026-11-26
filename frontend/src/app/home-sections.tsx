"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { PRODUCT_RAIL_ITEM, RAIL_ITEM, Rail } from "@/components/Carousel";
import { SearchIcon, TelegramIcon, WhatsAppIcon } from "@/components/icons";
import { ProductCard } from "@/components/ProductCard";
import { useAuth } from "@/lib/auth";
import { categoryHref, childrenOf, useCategories } from "@/lib/categories";
import { CONTACTS, YOUTUBE, whatsappLink } from "@/lib/contacts";
import { dayMonth, percentOff, plural } from "@/lib/format";
import { useRecentlyViewed } from "@/lib/recent";
import type { Brand, Page, ProductListItem, PromotionPublic } from "@/lib/types";
import { useApi } from "@/lib/use-api";

// The home page, top to bottom (app/page.tsx): search (phones), banners, trust, «С чего начнём?»,
// «Хиты продаж», «Тестеры», «Выбор Kyko», «Подарок по бюджету», advice in WhatsApp, «Вы смотрели»,
// the top brands in one line, and wholesale. The app's home screen has the same blocks.

function Section({
  title,
  hint,
  link,
  children,
}: {
  title: string;
  hint?: string;
  link?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-9 sm:px-6 md:pt-12">
      <div className="mb-3 flex items-end justify-between gap-4 md:mb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold md:text-3xl">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        </div>
        {link}
      </div>
      {children}
    </section>
  );
}

function More({ href, children = "Все →" }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="shrink-0 text-sm font-semibold text-gold hover:text-ink">
      {children}
    </Link>
  );
}

/** Grey cards in place of a row of products while it loads, so the page doesn't jump. */
function RailSkeleton() {
  return (
    <div aria-hidden className="flex gap-3 overflow-hidden">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={`${PRODUCT_RAIL_ITEM} card overflow-hidden`}>
          <div className="aspect-square animate-pulse bg-stone-100" />
          <div className="space-y-1.5 p-2.5">
            <div className="h-2 w-1/2 animate-pulse rounded bg-stone-100" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-stone-100" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-stone-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** One sideways row of products, ending with a link to all of them. */
function ProductRail({
  label,
  items,
  more,
  card = (p) => <ProductCard product={p} compact />,
}: {
  label: string;
  items: ProductListItem[];
  more: string;
  card?: (p: ProductListItem) => ReactNode;
}) {
  return (
    <Rail label={label}>
      {items.map((p) => (
        <div key={p.id} className={`${PRODUCT_RAIL_ITEM} grid`}>
          {card(p)}
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

/** The search field on phones, where the header has no room for one. */
export function HomeSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    router.push(q.trim() ? `/catalog?q=${encodeURIComponent(q.trim())}` : "/catalog");
  };
  return (
    <form onSubmit={submit} role="search" className="px-4 pt-3 lg:hidden">
      <label className="flex h-11 items-center gap-2 rounded-full border border-line bg-white px-4">
        <SearchIcon width={18} height={18} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по аромату или бренду"
          aria-label="Поиск по аромату или бренду"
          className="w-full bg-transparent outline-none placeholder:text-stone-400"
          enterKeyHint="search"
        />
      </label>
    </form>
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

const TRUST: { title: string; text: string; href?: string; icon: ReactNode }[] = [
  {
    title: "100% оригинал",
    text: "только оригинальная парфюмерия",
    href: YOUTUBE,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Доставка по Казахстану",
    text: "способ подберём под вас",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
        <circle cx="7" cy="17.5" r="1.6" />
        <circle cx="17" cy="17.5" r="1.6" />
      </svg>
    ),
  },
  {
    title: "Заказ — в WhatsApp",
    text: "подтвердим наличие, оплату и доставку",
    href: whatsappLink(),
    icon: <WhatsAppIcon width={24} height={24} />,
  },
  {
    title: "Подберём аромат",
    text: "бесплатная консультация",
    href: whatsappLink("Здравствуйте! Помогите подобрать аромат"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
        <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" />
        <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
      </svg>
    ),
  },
];

/** Why buy here: originals, delivery, the order in WhatsApp, advice. One row that scrolls on phones. */
export function HomeTrust() {
  return (
    <section aria-label="Почему Kyko" className="mx-auto max-w-7xl pt-4 md:px-6">
      <div className="rail flex gap-2.5 overflow-x-auto px-4 md:grid md:grid-cols-4 md:gap-3 md:px-0">
        {TRUST.map((t) => {
          const body = (
            <>
              <span className="shrink-0 text-gold">{t.icon}</span>
              <span className="leading-tight">
                <b className="block text-sm font-semibold">{t.title}</b>
                <span className="text-xs text-muted">{t.text}</span>
              </span>
            </>
          );
          const cls = "flex shrink-0 items-center gap-2.5 rounded-2xl border border-line bg-white px-3.5 py-3";
          return t.href ? (
            <a key={t.title} href={t.href} target="_blank" rel="noopener" className={`${cls} hover:border-gold`}>
              {body}
            </a>
          ) : (
            <div key={t.title} className={cls}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * A way into the catalog with its count and a picture: a section's own (`image`, the one set in
 * «Категории»), else a photo of its most popular product (a query of one product, sorted by
 * sales). Hidden while it has no products.
 */
function EntryTile({
  href,
  title,
  note,
  query,
  image: ownImage,
  dark = false,
}: {
  href: string;
  title: string;
  note?: (total: number) => string;
  query: Record<string, string | number | boolean>;
  image?: string | null;
  dark?: boolean;
}) {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    query: { ...query, sort: "popular", page_size: 1 },
  });
  if (!data) return <div aria-hidden className="aspect-square animate-pulse rounded-2xl bg-stone-100" />;
  if (data.total === 0) return null;
  const image = ownImage || data.items[0]?.image_url;
  return (
    <Link
      href={href}
      className={`group relative aspect-square overflow-hidden rounded-2xl p-2.5 transition md:p-3.5 ${
        dark ? "bg-ink text-white" : "bg-stone-100 hover:bg-stone-200"
      }`}
    >
      <span className="relative z-10 block text-[13px] leading-tight font-semibold md:text-base">{title}</span>
      <span className={`relative z-10 mt-0.5 block text-[11px] md:text-xs ${dark ? "text-stone-300" : "text-muted"}`}>
        {note ? note(data.total) : `${data.total} ${plural(data.total, "аромат", "аромата", "ароматов")}`}
      </span>
      {image && (
        <span
          className={`absolute right-0 bottom-0 overflow-hidden ${
            dark ? "h-[52%] w-[58%] rounded-tl-2xl bg-white" : "h-[64%] w-[70%]"
          }`}
        >
          <img
            src={image}
            alt=""
            className={`h-full w-full object-contain object-right-bottom transition group-hover:scale-105 ${
              dark ? "" : "mix-blend-multiply"
            }`}
          />
        </span>
      )}
    </Link>
  );
}

/**
 * «С чего начнём?»: for her, for him, unisex, testers, niche, then the catalog's other sections
 * (sets, make-up…) as they appear. Three in a row on phones, six on computers.
 */
export function HomeStart() {
  const tree = useCategories();
  // The first perfume section is what the gender tiles already show.
  const sections = tree ? childrenOf(tree, null) : [];
  const perfume = sections.find((c) => c.kind === "perfume");
  const others = sections.filter((c) => c !== perfume);
  return (
    <Section title="С чего начнём?" link={<More href="/categories">Все категории →</More>}>
      <nav aria-label="С чего начнём" className="grid grid-cols-3 gap-2 md:grid-cols-6 md:gap-3">
        <EntryTile href="/catalog?gender=female" title="Для неё" query={{ gender: "female" }} />
        <EntryTile href="/catalog?gender=male" title="Для него" query={{ gender: "male" }} />
        <EntryTile href="/catalog?gender=unisex" title="Унисекс" query={{ gender: "unisex" }} />
        <EntryTile
          href="/catalog?tester=true"
          title="Тестеры"
          note={() => "дешевле флакона"}
          query={{ tester: true }}
          dark
        />
        <EntryTile href="/catalog?top=true" title="Ниша и люкс" query={{ top: true }} />
        {others.map((c) => (
          <EntryTile
            key={c.id}
            href={tree ? categoryHref(tree, c) : `/catalog?category_id=${c.id}`}
            title={c.name}
            note={(n) => `${n} ${plural(n, "товар", "товара", "товаров")}`}
            query={{ category_id: c.id }}
            image={c.image_url}
          />
        ))}
      </nav>
    </Section>
  );
}

/** «Хиты продаж»: the most bought lately, with how many times; before any sales, «Популярное». */
export function HomeHits() {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    query: { sort: "popular", page_size: 12 },
  });
  if (!data)
    return (
      <Section title="Хиты продаж">
        <RailSkeleton />
      </Section>
    );
  if (data.total === 0) return null;
  const sales = data.items.some((p) => (p.sold ?? 0) > 0);
  return (
    <Section
      title={sales ? "Хиты продаж" : "Популярное"}
      hint={sales ? "Что чаще всего покупают у нас" : undefined}
      link={<More href="/catalog?sort=popular" />}
    >
      <ProductRail
        label="Хиты продаж"
        items={data.items}
        more="/catalog?sort=popular"
        card={(p) => (
          <ProductCard
            product={p}
            compact
            note={(p.sold ?? 0) >= 3 ? `Купили ${p.sold} раз` : undefined}
          />
        )}
      />
    </Section>
  );
}

/** «Тестеры»: the same perfume cheaper, the tester's price next to the bottle's. */
export function HomeTesters() {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    query: { tester: true, sort: "popular", page_size: 12 },
  });
  if (!data || data.total === 0) return null;
  return (
    <section className="mx-auto max-w-7xl pt-9 md:px-6 md:pt-12">
      <div className="bg-ink px-4 py-6 text-white md:rounded-3xl md:px-6">
        <div className="mb-3 flex items-end justify-between gap-4 md:mb-4">
          <div>
            <h2 className="font-serif text-2xl font-bold md:text-3xl">Тестеры — тот же аромат дешевле</h2>
            <p className="mt-0.5 text-sm text-stone-300">
              Оригинальный парфюм в простой упаковке: без крышки или коробки
            </p>
          </div>
          <Link href="/catalog?tester=true" className="shrink-0 text-sm font-semibold text-[#e9dccb] hover:text-white">
            Все →
          </Link>
        </div>
        <div className="text-ink">
          <ProductRail
            label="Тестеры"
            items={data.items}
            more="/catalog?tester=true"
            card={(p) => <ProductCard product={p} compact tester />}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * «Выбор Kyko»: the products the shop recommends, marked in the admin panel (the latest marked
 * first). No block while none are: the latest added products are no recommendation.
 */
export function HomeChoice() {
  const { data, error } = useApi<Page<ProductListItem>>("/products", {
    query: { is_new: true, sort: "new", page_size: 12 },
  });
  if (error || !data || data.total === 0) return null;
  return (
    <Section title="Выбор Kyko" hint="Что мы советуем сами" link={<More href="/catalog?is_new=true" />}>
      <ProductRail label="Выбор Kyko" items={data.items} more="/catalog?is_new=true" />
    </Section>
  );
}

const BUDGETS = [
  { label: "до", value: "30 000 ₸", query: { max_price: 30000 } },
  { label: "до", value: "60 000 ₸", query: { max_price: 60000 } },
  { label: "до", value: "100 000 ₸", query: { max_price: 100000 } },
  { label: "от", value: "100 000 ₸", query: { min_price: 100000 }, dark: true },
];

function BudgetTile({ label, value, query, dark }: (typeof BUDGETS)[number]) {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    query: { ...query, sort: "popular", page_size: 1 },
  });
  if (!data) return <div aria-hidden className="min-h-28 animate-pulse rounded-2xl bg-stone-100 md:min-h-32" />;
  if (data.total === 0) return null;
  const href = `/catalog?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`;
  const image = data.items[0]?.image_url;
  return (
    <Link
      href={href}
      className={`group relative min-h-28 overflow-hidden rounded-2xl border p-3.5 md:min-h-32 md:p-4 ${
        dark ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-gold"
      }`}
    >
      <span className={`block text-xs ${dark ? "text-stone-300" : "text-muted"}`}>{label}</span>
      <span className="block font-serif text-2xl leading-none font-bold md:text-3xl">{value}</span>
      <span className={`mt-2 block text-xs font-semibold ${dark ? "text-[#e9dccb]" : "text-gold-dark"}`}>
        {data.total} {plural(data.total, "аромат", "аромата", "ароматов")} →
      </span>
      {image && (
        <span className={`absolute -right-1 -bottom-1 h-16 w-16 md:h-24 md:w-24 ${dark ? "overflow-hidden rounded-tl-xl bg-white" : ""}`}>
          <img src={image} alt="" className={`h-full w-full object-contain ${dark ? "" : "mix-blend-multiply"}`} />
        </span>
      )}
    </Link>
  );
}

/** «Подарок по бюджету»: the catalog up to a price, and the premium shelf. */
export function HomeBudget() {
  return (
    <Section title="Подарок по бюджету">
      <nav aria-label="Подарок по бюджету" className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {BUDGETS.map((b) => (
          <BudgetTile key={b.value + b.label} {...b} />
        ))}
      </nav>
    </Section>
  );
}

/** Advice where people hesitate: the shop answers in WhatsApp (where orders are agreed, too). */
export function HomeConsult() {
  const telegram = CONTACTS.find((c) => c.kind === "telegram");
  return (
    <section className="mx-auto max-w-7xl px-4 pt-9 sm:px-6 md:pt-12">
      <div className="grid items-center gap-5 rounded-3xl bg-gold-soft p-5 md:grid-cols-[1.3fr_1fr] md:p-8">
        <div>
          <h2 className="font-serif text-3xl leading-tight font-bold md:text-4xl">Не знаете, что выбрать?</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600 md:text-base">
            Расскажите, какие ароматы нравятся и для кого подарок, — подберём несколько вариантов и
            пришлём фото и цены. Бесплатно.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={whatsappLink("Здравствуйте! Помогите подобрать аромат")}
              target="_blank"
              rel="noopener"
              className="btn rounded-full bg-[#1f9d55] text-white hover:bg-[#178a49]"
            >
              <WhatsAppIcon width={18} height={18} /> Подобрать в WhatsApp
            </a>
            {telegram && (
              <a href={telegram.href} target="_blank" rel="noopener" className="btn btn-outline rounded-full">
                <TelegramIcon width={18} height={18} /> Telegram
              </a>
            )}
          </div>
        </div>
        <div aria-hidden className="hidden flex-col gap-2 rounded-2xl bg-white p-4 text-sm md:flex">
          <div className="max-w-[85%] self-end rounded-2xl bg-[#dcfce7] px-3 py-2">
            Ищу подарок девушке, любит сладкие ароматы
          </div>
          <div className="max-w-[85%] rounded-2xl bg-stone-100 px-3 py-2">
            Здравствуйте! Подобрали три аромата — отправляю фото и цены 👇
          </div>
        </div>
      </div>
    </section>
  );
}

/** «Вы смотрели»: the products this browser opened, the latest first, at today's prices. */
export function HomeRecent() {
  const ids = useRecentlyViewed();
  const { data } = useApi<Page<ProductListItem>>(ids.length ? "/products" : null, {
    query: { id: ids, page_size: ids.length || 1 },
  });
  if (!data || data.items.length === 0) return null;
  const items = ids
    .map((id) => data.items.find((p) => p.id === id))
    .filter((p): p is ProductListItem => !!p);
  return (
    <Section title="Вы смотрели">
      <Rail label="Вы смотрели">
        {items.map((p) => (
          <div key={p.id} className={`${PRODUCT_RAIL_ITEM} grid`}>
            <ProductCard product={p} compact />
          </div>
        ))}
      </Rail>
    </Section>
  );
}

/**
 * The top houses (`is_top`, ticked in «Бренды») in one short line that scrolls sideways; the
 * brands with the most products when none are ticked.
 */
export function HomeBrands() {
  const { data } = useApi<Brand[]>("/brands");
  if (!data || data.length === 0) return null;
  const top = data.filter((b) => b.is_top);
  const shown = (top.length ? top : data)
    .slice()
    .sort((a, b) => b.product_count - a.product_count)
    .slice(0, 20);
  return (
    <section className="mx-auto max-w-7xl px-4 pt-9 sm:px-6 md:pt-12">
      <nav aria-label="Бренды" className="flex items-center gap-3">
        <span className="shrink-0 font-serif text-lg font-bold">Бренды</span>
        <div className="rail flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {shown.map((b) => (
            <Link
              key={b.id}
              href={`/catalog?brand_id=${b.id}`}
              className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs whitespace-nowrap hover:border-gold"
            >
              {b.name}
            </Link>
          ))}
        </div>
        <More href="/brands">Все →</More>
      </nav>
    </section>
  );
}

/**
 * For shops and resellers, at the bottom: wholesale prices come with the wholesale status. Guests
 * go to registration (it ends on the account page with the request), a retail customer straight
 * to the request; wholesale customers and staff don't see it.
 */
export function HomeWholesale() {
  const { user, loading } = useAuth();
  if (loading || (user && user.role !== "retail")) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-9 sm:px-6 md:pt-12">
      <div className="flex flex-col items-start justify-between gap-3 rounded-3xl border border-line bg-white p-5 md:flex-row md:items-center md:p-6">
        <div>
          <h2 className="font-serif text-2xl font-bold">Для магазинов и салонов</h2>
          <p className="mt-0.5 text-sm text-muted">Оптовые цены — после регистрации и одобрения заявки</p>
        </div>
        <Link href={user ? "/account#upgrade" : "/register"} className="btn btn-primary rounded-full">
          Стать оптовым клиентом →
        </Link>
      </div>
    </section>
  );
}
