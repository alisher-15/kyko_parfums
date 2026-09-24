import Link from "next/link";
import { TIER_LABELS, money } from "@/lib/format";
import type { Order } from "@/lib/types";

export function OrderItemsTable({
  order,
  admin = false,
  variantStock,
}: {
  order: Order;
  admin?: boolean;
  /** Admin: current stock by volume, to tell whether backordered goods have arrived. */
  variantStock?: Record<number, number>;
}) {
  // Until the order leaves the shop, lines that were missing at checkout are marked.
  const open = order.status === "new" || order.status === "processing";
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
          {order.items.map((i) => {
            const removed = i.quantity === 0;
            return (
              <tr key={i.id} className={removed ? "text-muted" : ""}>
                <td>
                  <div className="text-xs text-muted">{i.brand_name}</div>
                  {i.product_id ? (
                    <Link
                      href={admin ? `/admin/products/${i.product_id}` : `/products/${i.product_id}`}
                      className={`font-semibold hover:text-gold ${removed ? "line-through" : ""}`}
                    >
                      {i.product_name}
                    </Link>
                  ) : (
                    <span className={`font-semibold ${removed ? "line-through" : ""}`}>
                      {i.product_name}
                    </span>
                  )}
                  {removed && <div className="text-xs">убрано менеджером</div>}
                </td>
                <td>{i.volume_ml} мл</td>
                <td>
                  {money(i.price_applied)}
                  {i.discount_percent > 0 && (
                    <div className="text-[11px] text-muted">
                      <span className="line-through">{money(i.list_price)}</span> −
                      {i.discount_percent}%
                    </div>
                  )}
                  <div className="text-[11px] text-gold">{TIER_LABELS[i.price_tier]}</div>
                </td>
                <td>
                  {i.quantity}
                  {i.original_quantity !== i.quantity && (
                    <div className="text-[11px] text-muted">было {i.original_quantity}</div>
                  )}
                  {i.returned_quantity > 0 && (
                    <div className="text-[11px] text-red-600">возвращено {i.returned_quantity}</div>
                  )}
                  {open && i.backordered > 0 && i.quantity > 0 && (
                    <div className="text-[11px] text-amber-700">
                      под заказ {Math.min(i.backordered, i.quantity)} шт.
                      {variantStock && i.variant_id !== null && i.variant_id in variantStock && (
                        <>
                          {" · "}
                          {variantStock[i.variant_id] < 0
                            ? `на складе не хватает ${-variantStock[i.variant_id]} шт.`
                            : "уже на складе"}
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td className="text-right font-semibold">{money(i.line_total)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {order.discount_total > 0 && (
            <tr>
              <td colSpan={4} className="text-right text-muted">
                Скидка
              </td>
              <td className="text-right text-muted">−{money(order.discount_total)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={4} className="text-right font-semibold">
              Итого
            </td>
            <td className="text-right text-lg font-bold">{money(order.total_amount)}</td>
          </tr>
          {order.returned_amount > 0 && (
            <>
              <tr>
                <td colSpan={4} className="text-right text-red-600">
                  Возвращено
                </td>
                <td className="text-right text-red-600">−{money(order.returned_amount)}</td>
              </tr>
              <tr>
                <td colSpan={4} className="text-right font-semibold">
                  Итого с учётом возвратов
                </td>
                <td className="text-right text-lg font-bold">{money(order.net_total)}</td>
              </tr>
            </>
          )}
        </tfoot>
      </table>
    </div>
  );
}
