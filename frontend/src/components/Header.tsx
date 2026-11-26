"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { CurrencySwitch } from "@/lib/currency";
import { ROLE_LABELS } from "@/lib/format";
import { isStaff, staffHome } from "@/lib/staff";
import { BagIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from "./icons";

const NAV = [
  { href: "/catalog", label: "Каталог" },
  { href: "/categories", label: "Категории" },
  { href: "/catalog?gender=female", label: "Женские" },
  { href: "/catalog?gender=male", label: "Мужские" },
  { href: "/catalog?gender=unisex", label: "Унисекс" },
  { href: "/catalog?tester=true", label: "Тестеры" },
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
    // The jewel box's velvet band: the light logo with the pearl, the menu, the search.
    <header className="velvet sticky top-0 z-30 text-white shadow-[0_8px_24px_rgb(42_7_14/0.18)]">
      {isWholesale && (
        <div className="bg-nacre py-1.5 text-center text-xs tracking-wide text-cherry">
          Вы вошли как оптовый покупатель · {ROLE_LABELS[user.role]} · в каталоге показаны ваши
          цены
        </div>
      )}
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <button
          className="rounded-md p-2 hover:bg-white/10 lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Меню"
          aria-expanded={open}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>

        <Link href="/" className="shrink-0" aria-label="Kyko">
          {/* KYKO, the O a pearl (the brand file «Каждая — жемчужина»). */}
          <img src="/logo-pearl-light.png" alt="Kyko" width={105} height={28} className="h-7 w-auto" />
        </Link>

        <nav className="ml-6 hidden items-center gap-5 text-sm font-medium lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-nacre-muted hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>

        <form onSubmit={onSearch} className="ml-auto hidden max-w-xs flex-1 md:block">
          <label className="relative block">
            <SearchIcon className="absolute top-1/2 left-3 -translate-y-1/2 text-nacre" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по аромату или бренду"
              className="w-full rounded-md border border-nacre/40 bg-white/10 py-2 pr-3 pl-10 text-sm text-white outline-none placeholder:text-nacre-muted focus:border-nacre"
            />
          </label>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <CurrencySwitch className="mr-1" tone="dark" />
          {isStaff(user?.role) && (
            <Link
              href={staffHome(user?.role)}
              className="btn btn-sm mr-1 hidden border border-nacre/50 text-pearl hover:bg-white/10 sm:inline-flex"
            >
              Админка
            </Link>
          )}
          <Link
            href={user ? "/account" : "/login"}
            className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-white/10"
            title={user ? user.email : "Войти"}
          >
            <UserIcon />
            <span className="hidden max-w-32 truncate sm:inline">
              {user ? (user.full_name ?? "Кабинет") : "Войти"}
            </span>
          </Link>
          <Link
            href="/cart"
            className="relative rounded-md p-2 hover:bg-white/10"
            title="Корзина"
            aria-label={count > 0 ? `Корзина, товаров: ${count}` : "Корзина"}
          >
            <BagIcon />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-nacre px-1 text-[10px] font-bold text-cherry">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/15 px-4 pb-4 lg:hidden">
          <form onSubmit={onSearch} className="mt-3 md:hidden">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по аромату или бренду"
              className="w-full rounded-md border border-nacre/40 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-nacre-muted focus:border-nacre"
            />
          </form>
          <nav className="mt-2 flex flex-col text-sm font-medium">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="py-2">
                {n.label}
              </Link>
            ))}
            {isStaff(user?.role) && (
              <Link href={staffHome(user?.role)} onClick={() => setOpen(false)} className="py-2 text-nacre">
                Админ-панель
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
