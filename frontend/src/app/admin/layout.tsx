"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBox } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ADMIN_NAV, STAFF_ROLES, may, navItemOf, staffHome } from "@/lib/staff";


export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const role = user?.role;
  const allowed = may(role, navItemOf(pathname).area);
  // The overview is the owner's: the rest of the staff start on their own first page.
  useEffect(() => {
    if (role && pathname === "/admin" && !allowed) router.replace(staffHome(role));
  }, [role, pathname, allowed, router]);

  return (
    <RequireAuth roles={STAFF_ROLES}>
      <div className="min-h-screen bg-stone-50 lg:grid lg:grid-cols-[230px_1fr]">
        <aside className="border-b border-line bg-ink text-stone-300 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between px-5 py-4 lg:block">
            <Link href="/" className="font-serif text-xl font-bold text-white">
              Kyko <span className="text-gold">Admin</span>
            </Link>
            <div className="hidden truncate pt-1 text-xs text-stone-400 lg:block">{user?.email}</div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm lg:flex-col lg:overflow-visible">
            {ADMIN_NAV.filter((n) => may(role, n.area)).map((n) => {
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
            <button onClick={() => logout()} className="py-1 hover:text-white">
              Выйти
            </button>
          </div>
        </aside>
        <div className="min-w-0 px-4 py-6 sm:px-8">
          {allowed ? (
            children
          ) : pathname === "/admin" ? null : (
            <ErrorBox>
              Нет доступа к этому разделу.{" "}
              <Link href={staffHome(role)} className="underline">
                К своим разделам
              </Link>
            </ErrorBox>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
