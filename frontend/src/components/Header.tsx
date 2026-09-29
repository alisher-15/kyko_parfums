"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { childrenOf, useCategories } from "@/lib/categories";
import { CurrencySwitch } from "@/lib/currency";
import { ROLE_LABELS } from "@/lib/format";
import { BagIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from "./icons";

type NavLink = { href: string; label: string };
type NavItem = NavLink & { items: NavLink[] };

const PERFUME_GENDERS: [string, string][] = [
  ["female", "Женские"],
  ["male", "Мужские"],
  ["unisex", "Унисекс"],
];

/** The shop's menu: the sections of the catalog tree that have products, each with its groups
 *  (and «Женские / Мужские / Унисекс» for perfumes). */
function useNav(): NavItem[] {
  const all = useCategories() ?? [];
  const sections = childrenOf(all, null)
    .filter((s) => s.product_count > 0)
    .map((s) => {
      const href = `/catalog?category_id=${s.id}`;
      const groups = childrenOf(all, s.id)
        .filter((g) => g.product_count > 0)
        .map((g) => ({ href: `/catalog?category_id=${g.id}`, label: g.name }));
      const genders =
        s.kind === "perfume"
          ? PERFUME_GENDERS.map(([g, label]) => ({ href: `${href}&gender=${g}`, label }))
          : [];
      return { href, label: s.name, items: [...genders, ...groups] };
    });
  return [
    { href: "/catalog", label: "Каталог", items: [] },
    ...sections,
    { href: "/brands", label: "Бренды", items: [] },
  ];
}

export function Header() {
  const { user } = useAuth();
  const { count } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const nav = useNav();

  if (pathname.startsWith("/admin")) return null;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setOpen(false);
    router.push(q.trim() ? `/catalog?q=${encodeURIComponent(q.trim())}` : "/catalog");
  };

  const isWholesale = user && (user.role === "wholesale" || user.role === "bulk_wholesale");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur">
      {isWholesale && (
        <div className="bg-ink py-1.5 text-center text-xs tracking-wide text-white">
          Вы вошли как оптовый покупатель · {ROLE_LABELS[user.role]} · в каталоге показаны ваши
          цены
        </div>
      )}
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <button
          className="rounded-full p-2 hover:bg-white lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Меню"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>

        <Link href="/" className="font-serif text-2xl font-bold tracking-wide whitespace-nowrap">
          Kyko <span className="text-gold">Parfum</span>
        </Link>

        <form onSubmit={onSearch} className="ml-auto hidden max-w-xs flex-1 md:block">
          <label className="relative block">
            <SearchIcon className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по аромату или бренду"
              className="input rounded-full pl-10"
            />
          </label>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <CurrencySwitch className="mr-1" />
          {user?.role === "admin" && (
            <Link href="/admin" className="btn btn-outline btn-sm mr-1 hidden sm:inline-flex">
              Админка
            </Link>
          )}
          <Link
            href={user ? "/account" : "/login"}
            className="flex items-center gap-2 rounded-full p-2 text-sm hover:bg-white"
            title={user ? user.email : "Войти"}
          >
            <UserIcon />
            <span className="hidden max-w-32 truncate sm:inline">
              {user ? (user.full_name ?? "Кабинет") : "Войти"}
            </span>
          </Link>
          <Link href="/cart" className="relative rounded-full p-2 hover:bg-white" title="Корзина">
            <BagIcon />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>

      <nav
        aria-label="Разделы каталога"
        className="mx-auto hidden max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pb-2.5 text-sm font-medium sm:px-6 lg:flex"
      >
        {nav.map((n) => (
          <div key={n.href} className="group relative">
            <Link href={n.href} className="block py-1 text-stone-600 hover:text-ink">
              {n.label}
            </Link>
            {n.items.length > 0 && (
              <div className="invisible absolute top-full left-0 z-40 pt-1 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="card min-w-48 py-2 shadow-lg shadow-stone-200/70">
                  {n.items.map((i) => (
                    <Link
                      key={i.href}
                      href={i.href}
                      className="block px-4 py-1.5 whitespace-nowrap text-stone-600 hover:bg-cream hover:text-ink"
                    >
                      {i.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </nav>

      {open && (
        <div className="border-t border-line px-4 pb-4 lg:hidden">
          <form onSubmit={onSearch} className="mt-3 md:hidden">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по аромату или бренду"
              className="input rounded-full"
            />
          </form>
          <nav className="mt-2 flex flex-col text-sm font-medium">
            {nav.map((n) => (
              <div key={n.href}>
                <Link href={n.href} onClick={() => setOpen(false)} className="block py-2">
                  {n.label}
                </Link>
                {n.items.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 pl-3 text-stone-500">
                    {n.items.map((i) => (
                      <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="py-1">
                        {i.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {user?.role === "admin" && (
              <Link href="/admin" onClick={() => setOpen(false)} className="py-2 text-gold">
                Админ-панель
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
