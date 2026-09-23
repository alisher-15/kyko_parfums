"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";

const TABS = [
  { href: "/account", label: "Профиль" },
  { href: "/account/orders", label: "Мои заказы" },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  return (
    <RequireAuth>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-serif text-4xl font-bold">Личный кабинет</h1>
          <button className="btn btn-outline btn-sm" onClick={logout}>
            Выйти
          </button>
        </div>
        <nav className="mb-6 flex gap-2 border-b border-line">
          {TABS.map((t) => {
            const active =
              t.href === "/account" ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
                  active ? "border-gold text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </RequireAuth>
  );
}
