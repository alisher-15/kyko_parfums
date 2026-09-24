"use client";

import Link from "next/link";
import { ErrorBox, Spinner } from "@/components/ui";
import { STOCK_REASON_LABELS, dateTime } from "@/lib/format";
import type { StockMovement } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Stock journal of one product: every sale, return, manual edit and import. */
export function StockHistory({ productId, version }: { productId: number; version: string }) {
  const { data, error } = useApi<StockMovement[]>(`/admin/products/${productId}/stock-movements`, {
    query: { v: version },
  });
  return (
    <div className="card p-4">
      <h2 className="mb-3 font-serif text-2xl font-semibold">Движение склада</h2>
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {!data && !error && <Spinner />}
      {data && data.length === 0 && (
        <p className="text-sm text-muted">Пока нет изменений остатков.</p>
      )}
      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Объём</th>
                <th>Изменение</th>
                <th>Стало</th>
                <th>Причина</th>
                <th>Кто</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <td className="text-xs whitespace-nowrap">{dateTime(m.created_at)}</td>
                  <td>{m.volume_ml} мл</td>
                  <td
                    className={`font-semibold tabular-nums ${m.delta > 0 ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </td>
                  <td className="tabular-nums">{m.stock_after}</td>
                  <td className="text-xs">
                    {STOCK_REASON_LABELS[m.reason]}
                    {m.order_id && (
                      <>
                        {" · "}
                        <Link href={`/admin/orders/${m.order_id}`} className="text-gold">
                          № {m.order_id}
                        </Link>
                      </>
                    )}
                    {m.note && <div className="text-muted">{m.note}</div>}
                  </td>
                  <td className="text-xs text-muted">{m.user_email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
