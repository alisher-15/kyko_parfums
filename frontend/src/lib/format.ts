import type {
  Gender,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PriceTier,
  StockReason,
  UserRole,
} from "./types";

export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "₸";

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${numberFormat.format(value)} ${CURRENCY}`;
}

/** How a volume is named everywhere: "100 мл" or "100 мл, тестер" (same as the backend). */
export function volumeLabel(volumeMl: number, isTester?: boolean): string {
  return isTester ? `${volumeMl} мл, тестер` : `${volumeMl} мл`;
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export const STATUS_COLORS: Record<OrderStatus, string> = {
  new: "bg-sky-50 text-sky-700 border-sky-200",
  processing: "bg-amber-50 text-amber-700 border-amber-200",
  shipped: "bg-violet-50 text-violet-700 border-violet-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-stone-100 text-stone-500 border-stone-200",
};

export function splitNotes(notes: string | null): string[] {
  if (!notes) return [];
  return notes
    .split(/[,;\n]/)
    .map((n) => n.trim())
    .filter(Boolean);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

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
