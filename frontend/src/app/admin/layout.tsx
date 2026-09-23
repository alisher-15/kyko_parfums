"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/orders", label: "Заказы" },
  { href: "/admin/products", label: "Товары" },
  { href: "/admin/brands", label: "Бренды" },
  { href: "/admin/users", label: "Пользователи" },
  { href: "/admin/import", label: "Импорт Excel" },
  { href: "/admin/settings", label: "Цены и пороги" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  return (
    <RequireAuth role="admin">
      <div className="min-h-screen bg-stone-50 lg:grid lg:grid-cols-[230px_1fr]">
        <aside className="border-b border-line bg-ink text-stone-300 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between px-5 py-4 lg:block">
            <Link href="/" className="font-serif text-xl font-bold text-white">
              Kyko <span className="text-gold">Admin</span>
            </Link>
            <div className="hidden truncate pt-1 text-xs text-stone-400 lg:block">{user?.email}</div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm lg:flex-col lg:overflow-visible">
            {NAV.map((n) => {
              const active = n.href === "/admin" ? pathname === n.href : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-lg px-3 py-2 whitespace-nowrap ${
                    active ? "bg-white/10 font-semibold text-white" : "hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden px-6 py-4 text-xs lg:absolute lg:bottom-0 lg:block">
            <Link href="/" className="block py-1 hover:text-white">
              ← На сайт
            </Link>
            <button onClick={logout} className="py-1 hover:text-white">
              Выйти
            </button>
          </div>
        </aside>
        <div className="min-w-0 px-4 py-6 sm:px-8">{children}</div>
      </div>
    </RequireAuth>
  );
}
