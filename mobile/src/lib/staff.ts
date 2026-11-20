import type { IconName } from "@/components/ui";
import type { UserRole } from "./types";

/**
 * Who of the shop's staff sees which part of the admin, as on the website
 * (frontend/src/lib/staff.ts, backend/app/permissions.py). The API enforces it; here it only
 * shapes the menu.
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

export interface AdminSection {
  href:
    | "/admin/overview"
    | "/admin/pos"
    | "/admin/orders"
    | "/admin/receipts"
    | "/admin/counts"
    | "/admin/products"
    | "/admin/promotions"
    | "/admin/brands"
    | "/admin/users"
    | "/admin/import"
    | "/admin/suppliers"
    | "/admin/settings";
  title: string;
  hint: string;
  icon: IconName;
  area: Area | null;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    href: "/admin/overview",
    title: "Обзор",
    hint: "Выручка, заказы, склад",
    icon: "stats-chart-outline",
    area: null,
  },
  {
    href: "/admin/pos",
    title: "Продажа в магазине",
    hint: "Касса со сканером",
    icon: "cart-outline",
    area: "till",
  },
  {
    href: "/admin/orders",
    title: "Заказы и продажи",
    hint: "Статусы, сборка, возвраты",
    icon: "receipt-outline",
    area: "orders",
  },
  {
    href: "/admin/receipts",
    title: "Приёмка",
    hint: "Товар от поставщика",
    icon: "download-outline",
    area: "stock",
  },
  {
    href: "/admin/counts",
    title: "Инвентаризация",
    hint: "Пересчёт остатков",
    icon: "clipboard-outline",
    area: "stock",
  },
  {
    href: "/admin/products",
    title: "Товары",
    hint: "Цены, объёмы, фото",
    icon: "pricetag-outline",
    area: null,
  },
  {
    href: "/admin/promotions",
    title: "Акции",
    hint: "Баннеры и скидки",
    icon: "megaphone-outline",
    area: null,
  },
  {
    href: "/admin/brands",
    title: "Бренды",
    hint: "Названия и логотипы",
    icon: "ribbon-outline",
    area: null,
  },
  {
    href: "/admin/users",
    title: "Пользователи",
    hint: "Роли, заявки на опт",
    icon: "people-outline",
    area: null,
  },
  {
    href: "/admin/import",
    title: "Импорт Excel",
    hint: "Каталог из файла",
    icon: "document-text-outline",
    area: null,
  },
  {
    href: "/admin/suppliers",
    title: "Поставщики",
    hint: "Прайсы и себестоимость",
    icon: "business-outline",
    area: null,
  },
  {
    href: "/admin/settings",
    title: "Настройки",
    hint: "Пороги, курс, Telegram",
    icon: "settings-outline",
    area: null,
  },
];
