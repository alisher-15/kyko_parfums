"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { ROLE_LABELS } from "@/lib/format";
import { BagIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from "./icons";

const NAV = [
  { href: "/catalog", label: "Каталог" },
  { href: "/catalog?gender=female", label: "Женские" },
  { href: "/catalog?gender=male", label: "Мужские" },
  { href: "/catalog?gender=unisex", label: "Унисекс" },
  { href: "/brands", label: "Бренды" },
];

export function Header() {
  const { user } = useAuth();
  const { count } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

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
          Kyko <span className="text-gold">Parfums</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-5 text-sm font-medium lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-stone-600 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>

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
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="py-2">
                {n.label}
              </Link>
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
