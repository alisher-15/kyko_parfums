import type { UserRole } from "./types";

/**
 * Who of the shop's staff sees which part of the admin panel. The API enforces the same table
 * (backend/app/permissions.py); here it only shapes the menu and the pages.
 */
export type Area = "till" | "orders" | "stock";

const ACCESS: Partial<Record<UserRole, Area[]>> = {
  cashier: ["till", "orders"],
  warehouse: ["stock", "orders"],
};

export const STAFF_ROLES: UserRole[] = ["admin", "cashier", "warehouse"];

export function isStaff(role: UserRole | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

/** `area` null: the owner's alone (products, prices, suppliers, users, settings, figures). */
export function may(role: UserRole | null | undefined, area: Area | null): boolean {
  if (role === "admin") return true;
  return area !== null && !!role && (ACCESS[role] ?? []).includes(area);
}

export const ADMIN_NAV: { href: string; label: string; area: Area | null }[] = [
  { href: "/admin", label: "Обзор", area: null },
  { href: "/admin/pos", label: "Продажа в магазине", area: "till" },
  { href: "/admin/orders", label: "Заказы и продажи", area: "orders" },
  { href: "/admin/receipts", label: "Приёмка", area: "stock" },
  { href: "/admin/inventory", label: "Инвентаризация", area: "stock" },
  { href: "/admin/products", label: "Товары", area: null },
  { href: "/admin/categories", label: "Категории", area: null },
  { href: "/admin/promotions", label: "Акции", area: null },
  { href: "/admin/creatives", label: "Баннеры и сторис", area: null },
  { href: "/admin/brands", label: "Бренды", area: null },
  { href: "/admin/users", label: "Пользователи", area: null },
  { href: "/admin/import", label: "Импорт Excel", area: null },
  { href: "/admin/suppliers", label: "Поставщики", area: null },
  { href: "/admin/settings", label: "Настройки", area: null },
];

/** The menu item a page belongs to. */
export function navItemOf(pathname: string) {
  return (
    ADMIN_NAV.filter((n) => (n.href === "/admin" ? pathname === n.href : pathname.startsWith(n.href)))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? ADMIN_NAV[0]
  );
}

/** Where a member of staff starts: the first part of the panel that is theirs. */
export function staffHome(role: UserRole | null | undefined): string {
  return ADMIN_NAV.find((n) => may(role, n.area))?.href ?? "/";
}
