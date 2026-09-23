import Link from "next/link";
import { TIER_LABELS, money } from "@/lib/format";
import type { Order } from "@/lib/types";

export function OrderItemsTable({ order, admin = false }: { order: Order; admin?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Товар</th>
            <th>Объём</th>
            <th>Цена</th>
            <th>Кол-во</th>
            <th className="text-right">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id}>
              <td>
                <div className="text-xs text-muted">{i.brand_name}</div>
                {i.product_id ? (
                  <Link
                    href={admin ? `/admin/products/${i.product_id}` : `/products/${i.product_id}`}
                    className="font-semibold hover:text-gold"
                  >
                    {i.product_name}
                  </Link>
                ) : (
                  <span className="font-semibold">{i.product_name}</span>
                )}
              </td>
              <td>{i.volume_ml} мл</td>
              <td>
                {money(i.price_applied)}
                <div className="text-[11px] text-gold">{TIER_LABELS[i.price_tier]}</div>
              </td>
              <td>{i.quantity}</td>
              <td className="text-right font-semibold">{money(i.line_total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="text-right font-semibold">
              Итого
            </td>
            <td className="text-right text-lg font-bold">{money(order.total_amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
