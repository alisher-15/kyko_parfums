"use client";

import { ErrorBox, Spinner } from "@/components/ui";
import { dateTime, money, volumeLabel } from "@/lib/format";
import type { PriceChange, PriceField } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const FIELD_LABELS: Record<PriceField, string> = {
  cost: "Себестоимость",
  retail: "Розница",
  wholesale: "Опт",
  bulk: "Крупный опт",
};

/** Every change of the product's costs and prices: by hand, by an import, a price list, a receipt. */
export function PriceHistory({ productId, version }: { productId: number; version: string }) {
  const { data, error } = useApi<PriceChange[]>(`/admin/products/${productId}/price-history`, {
    query: { v: version },
  });
  return (
    <div className="card p-4">
      <h2 className="mb-3 font-serif text-2xl font-semibold">История цен</h2>
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {!data && !error && <Spinner />}
      {data && data.length === 0 && <p className="text-sm text-muted">Цены пока не менялись.</p>}
      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Объём</th>
                <th>Цена</th>
                <th>Было</th>
                <th>Стало</th>
                <th>Откуда</th>
                <th>Кто</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => {
                const up = c.old_value !== null && c.new_value !== null && c.new_value > c.old_value;
                const down = c.old_value !== null && c.new_value !== null && c.new_value < c.old_value;
                return (
                  <tr key={c.id}>
                    <td className="text-xs whitespace-nowrap">{dateTime(c.created_at)}</td>
                    <td>{volumeLabel(c.volume_ml, c.is_tester)}</td>
                    <td className="text-xs">{FIELD_LABELS[c.field]}</td>
                    <td className="tabular-nums text-muted">
                      {c.old_value === null ? "—" : money(c.old_value)}
                    </td>
                    <td
                      className={`font-semibold tabular-nums ${up ? "text-emerald-700" : down ? "text-red-600" : ""}`}
                    >
                      {c.new_value === null ? "—" : money(c.new_value)}
                    </td>
                    <td className="text-xs">{c.source}</td>
                    <td className="text-xs text-muted">{c.user_email ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
