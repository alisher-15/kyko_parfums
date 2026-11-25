import type { PromotionStatus, StockReason } from "./admin-types";
import type {
  Gender,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PriceTier,
  ProductSort,
  UserRole,
} from "./types";

// Same texts and rules as frontend/src/lib/format.ts.

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

/** Tenge. Prices on the storefront screens go through useCurrency().money (₸ or $). */
export function tenge(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${numberFormat.format(value)} ₸`;
}

/** How a volume is named everywhere: "100 мл" or "100 мл, тестер" (same as the backend). */
export function volumeLabel(volumeMl: number, isTester?: boolean): string {
  return isTester ? `${volumeMl} мл, тестер` : `${volumeMl} мл`;
}

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** "30 сентября" for a date such as "2026-09-30" (a calendar date, no time zone shift). */
export function dayMonth(isoDate: string): string {
  const [, m, d] = isoDate.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "19.11.2026, 18:05" in the phone's time zone. */
export function dateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "19 ноября 2026". */
export function longDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "−15%": a discount without trailing zeros. */
export function percentOff(value: number): string {
  return `−${Number(value.toFixed(2))}%`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function splitNotes(notes: string | null): string[] {
  if (!notes) return [];
  return notes
    .split(/[,;\n]/)
    .map((n) => n.trim())
    .filter(Boolean);
}

export const GENDER_LABELS: Record<Gender, string> = {
  female: "Женский",
  male: "Мужской",
  unisex: "Унисекс",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  retail: "Розница",
  wholesale: "Опт",
  bulk_wholesale: "Крупный опт",
  admin: "Администратор",
  cashier: "Кассир",
  warehouse: "Склад",
};

export const TIER_LABELS: Record<PriceTier, string> = {
  retail: "Розничная цена",
  wholesale: "Оптовая цена",
  bulk: "Цена крупного опта",
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый",
  processing: "В обработке",
  shipped: "Отправлен",
  delivered: "Доставлен",
  cancelled: "Отменён",
};

export const SORT_LABELS: Record<ProductSort, string> = {
  default: "По умолчанию",
  price_asc: "Сначала дешевле",
  price_desc: "Сначала дороже",
  name: "По названию",
  new: "Новинки",
  popular: "Популярные",
};

// ---------- Admin ----------

export const PROMOTION_STATUS_LABELS: Record<PromotionStatus, string> = {
  running: "Идёт",
  scheduled: "Запланирована",
  ended: "Закончилась",
  off: "Выключена",
};

export const CHANNEL_LABELS: Record<OrderChannel, string> = {
  online: "Сайт",
  store: "Магазин",
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Kaspi / перевод",
  other: "Другое",
};

export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  online_order: "Заказ на сайте",
  store_sale: "Продажа в магазине",
  order_cancel: "Отмена / возврат",
  manual: "Ручная правка",
  import: "Импорт Excel",
  order_edit: "Изменение заказа",
  return: "Возврат покупателя",
  receipt: "Приёмка",
  inventory: "Инвентаризация",
};

/** "12.11.2026" for a calendar date "2026-11-12". */
export function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/**
 * A phone number as it is typed, in the Kazakhstan format: «+7 701 234 56 78». The country
 * code is always +7: a leading 8 («8 701…») or a pasted 11-digit number becomes +7, and «701…»
 * typed without it gets it. Emptied by deleting back past «+7».
 */
export function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  let national: string;
  if (input.trimStart().startsWith("+7")) national = digits.slice(1);
  else if (digits[0] === "8" || (digits[0] === "7" && digits.length === 11))
    national = digits.slice(1);
  else national = digits;
  national = national.slice(0, 10);
  // «8» alone: the start of «8 701…», shown as +7; «+7» alone: being deleted.
  if (!national) return digits === "8" ? "+7 " : "";
  const parts = [
    national.slice(0, 3),
    national.slice(3, 6),
    national.slice(6, 8),
    national.slice(8, 10),
  ];
  return `+7 ${parts.filter(Boolean).join(" ")}`;
}
