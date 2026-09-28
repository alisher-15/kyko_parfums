"use client";

import Link from "next/link";
import { ErrorBox, Spinner } from "@/components/ui";
import { GENDER_LABELS, PAYMENT_LABELS, money } from "@/lib/format";
import type { AdminOrder } from "@/lib/types";
import { useApi } from "@/lib/use-api";

// Only the note itself goes to the printer (or to "Save as PDF").
const PRINT_CSS = `
@media print {
  header, footer, aside, .no-print { display: none !important; }
  html, body, main, main * { background: white !important; }
  @page { size: A4 landscape; margin: 12mm; }
}
`;

/**
 * Delivery note (накладная) to print and put in the parcel. The same content as the Excel file
 * from the backend (app/services/invoice.py): lines removed before shipping are left out.
 */
export function InvoiceView({ id }: { id: number }) {
  const { data: order, error } = useApi<AdminOrder>(`/admin/orders/${id}`);
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!order) return <Spinner />;

  const lines = order.items.filter((i) => i.quantity > 0);
  const total = lines.reduce((s, i) => s + i.line_total, 0);
  const units = lines.reduce((s, i) => s + i.quantity, 0);
  const date = new Date(order.created_at).toLocaleDateString("ru-RU");
  const address = [order.delivery_city, order.delivery_address].filter(Boolean).join(", ");
  const info: [string, string | null][] = [
    ["Продавец", "Kyko Parfum"],
    [
      "Покупатель",
      order.contact_name || (order.channel === "store" ? "Покупатель в магазине" : null),
    ],
    ["Телефон", order.contact_phone],
    ["Email", order.contact_email],
    ["Адрес доставки", address || null],
    ["Оплата", order.payment_method ? PAYMENT_LABELS[order.payment_method] : null],
    ["Комментарий", order.comment],
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <Link href={`/admin/orders/${order.id}`} className="text-sm text-muted hover:text-ink">
          ← К заказу
        </Link>
        <span className="flex-1" />
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          Печать / сохранить в PDF
        </button>
      </div>

      <div className="bg-white p-8 text-sm text-black print:p-0">
        <h1 className="text-2xl font-bold">
          Накладная № {order.id} от {date}
        </h1>
        <dl className="mt-4 grid grid-cols-[140px_1fr] gap-x-4 gap-y-1">
          {info
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="font-semibold">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>

        <table className="mt-6 w-full border-collapse text-left">
          <thead>
            <tr className="[&>th]:border [&>th]:border-stone-400 [&>th]:px-2 [&>th]:py-1">
              <th>№</th>
              <th>Товар</th>
              <th>Тип</th>
              <th>Пол</th>
              <th className="text-right">Объём, мл</th>
              <th>Тестер</th>
              <th className="text-right">Кол-во</th>
              <th className="text-right">Цена</th>
              <th className="text-right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((item, n) => (
              <tr
                key={item.id}
                className="[&>td]:border [&>td]:border-stone-400 [&>td]:px-2 [&>td]:py-1"
              >
                <td>{n + 1}</td>
                <td>
                  {item.brand_name} {item.product_name}
                </td>
                <td>{item.product_type ?? "—"}</td>
                <td>{item.gender ? GENDER_LABELS[item.gender] : "—"}</td>
                <td className="text-right">{item.volume_ml}</td>
                <td>{item.is_tester ? "Да" : "Нет"}</td>
                <td className="text-right">{item.quantity}</td>
                <td className="text-right whitespace-nowrap">{money(item.price_applied)}</td>
                <td className="text-right whitespace-nowrap">{money(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold [&>td]:px-2 [&>td]:py-1">
              <td colSpan={7} className="text-right">
                Итого
              </td>
              <td className="text-right">{units}</td>
              <td />
              <td className="text-right whitespace-nowrap">{money(total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-16 grid grid-cols-2 gap-8">
          <div>Отпустил: ______________________</div>
          <div>Получил: ______________________</div>
        </div>
      </div>
    </div>
  );
}
