"use client";

import { useState } from "react";
import { ErrorBox, QuantityInput } from "@/components/ui";
import { api } from "@/lib/api";
import { PAYMENT_LABELS, money } from "@/lib/format";
import type { AdminOrder, PaymentMethod } from "@/lib/types";

const PAYMENTS: PaymentMethod[] = ["cash", "card", "transfer", "other"];

function useSubmit(onDone: (o: AdminOrder) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (path: string, init: { method?: string; body: unknown }) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api<AdminOrder>(path, init));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** A. Before the order is shipped: reduce quantities or remove lines. */
export function EditItemsPanel({
  order,
  onDone,
  onClose,
}: {
  order: AdminOrder;
  onDone: (o: AdminOrder) => void;
  onClose: () => void;
}) {
  const active = order.items.filter((i) => i.quantity > 0);
  const [qty, setQty] = useState<Record<number, number>>(
    Object.fromEntries(active.map((i) => [i.id, i.quantity])),
  );
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onDone);

  const newTotal = active.reduce((s, i) => s + i.price_applied * (qty[i.id] ?? i.quantity), 0);
  const changed = active.filter((i) => qty[i.id] !== i.quantity);
  const allRemoved = active.every((i) => qty[i.id] === 0);

  return (
    <div className="card space-y-4 border-amber-300 p-4">
      <div>
        <div className="font-semibold">Изменить состав заказа</div>
        <p className="text-sm text-muted">
          Количество можно только уменьшить. Снятый товар вернётся на склад, цены остальных позиций
          не меняются. Покупатель увидит изменения в своём заказе.
        </p>
      </div>
      <ul className="divide-y divide-line">
        {active.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">{i.brand_name}</div>
              <div className={`font-semibold ${qty[i.id] === 0 ? "text-muted line-through" : ""}`}>
                {i.product_name}, {i.volume_ml} мл
              </div>
              <div className="text-xs text-muted">
                {money(i.price_applied)} × {i.quantity}
              </div>
            </div>
            <QuantityInput
              value={Math.max(qty[i.id], 1)}
              max={i.quantity}
              onChange={(v) => setQty({ ...qty, [i.id]: v })}
            />
            <button
              type="button"
              className={`btn btn-sm ${qty[i.id] === 0 ? "btn-outline" : "btn-danger"}`}
              onClick={() => setQty({ ...qty, [i.id]: qty[i.id] === 0 ? i.quantity : 0 })}
            >
              {qty[i.id] === 0 ? "Вернуть" : "Убрать"}
            </button>
          </li>
        ))}
      </ul>
      <label className="block">
        <span className="label">Причина (увидит покупатель)</span>
        <input
          className="input"
          placeholder="Нет в наличии, клиент передумал…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          Новая сумма: <b>{money(newTotal)}</b>
          <span className="text-muted"> (было {money(order.total_amount)})</span>
        </span>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || changed.length === 0 || allRemoved}
            onClick={() =>
              run(`/admin/orders/${order.id}/items`, {
                method: "PATCH",
                body: {
                  items: changed.map((i) => ({ order_item_id: i.id, quantity: qty[i.id] })),
                  reason: reason || null,
                },
              })
            }
          >
            Сохранить изменения
          </button>
        </div>
      </div>
      {allRemoved && (
        <p className="text-sm text-red-600">
          Чтобы убрать всё, отмените заказ целиком кнопкой «Отменён».
        </p>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}

/** B. After the goods were handed over: partial or full return. */
export function ReturnPanel({
  order,
  onDone,
  onClose,
}: {
  order: AdminOrder;
  onDone: (o: AdminOrder) => void;
  onClose: () => void;
}) {
  const returnable = order.items.filter((i) => i.quantity - i.returned_quantity > 0);
  const [qty, setQty] = useState<Record<number, number>>(
    Object.fromEntries(returnable.map((i) => [i.id, 0])),
  );
  const [restock, setRestock] = useState<Record<number, boolean>>(
    Object.fromEntries(returnable.map((i) => [i.id, true])),
  );
  const [method, setMethod] = useState<PaymentMethod>(order.payment_method ?? "cash");
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onDone);

  const chosen = returnable.filter((i) => qty[i.id] > 0);
  const refund = chosen.reduce((s, i) => s + i.price_applied * qty[i.id], 0);

  return (
    <div className="card space-y-4 border-red-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">Оформить возврат</div>
          <p className="text-sm text-muted">
            Укажите, что вернули. Деньги возвращаются по цене, за которую товар был куплен (с учётом
            скидки).
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() =>
            setQty(Object.fromEntries(returnable.map((i) => [i.id, i.quantity - i.returned_quantity])))
          }
        >
          Вернуть всё
        </button>
      </div>
      <ul className="divide-y divide-line">
        {returnable.map((i) => {
          const left = i.quantity - i.returned_quantity;
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted">{i.brand_name}</div>
                <div className="font-semibold">
                  {i.product_name}, {i.volume_ml} мл
                </div>
                <div className="text-xs text-muted">
                  {money(i.price_applied)} за шт. · можно вернуть {left} шт.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-8 w-8 rounded-full border border-line"
                  disabled={qty[i.id] <= 0}
                  onClick={() => setQty({ ...qty, [i.id]: qty[i.id] - 1 })}
                  aria-label="Меньше"
                >
                  −
                </button>
                <span className="w-6 text-center tabular-nums">{qty[i.id]}</span>
                <button
                  type="button"
                  className="h-8 w-8 rounded-full border border-line"
                  disabled={qty[i.id] >= left}
                  onClick={() => setQty({ ...qty, [i.id]: qty[i.id] + 1 })}
                  aria-label="Больше"
                >
                  +
                </button>
              </div>
              {qty[i.id] > 0 && (
                <div className="flex w-full gap-1.5 sm:w-auto">
                  <button
                    type="button"
                    aria-pressed={restock[i.id]}
                    onClick={() => setRestock({ ...restock, [i.id]: true })}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      restock[i.id] ? "border-ink bg-ink text-white" : "border-line bg-white"
                    }`}
                  >
                    На склад
                  </button>
                  <button
                    type="button"
                    aria-pressed={!restock[i.id]}
                    onClick={() => setRestock({ ...restock, [i.id]: false })}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      !restock[i.id] ? "border-red-600 bg-red-600 text-white" : "border-line bg-white"
                    }`}
                  >
                    Брак — списать
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div>
        <span className="label">Как вернули деньги</span>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENTS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={method === p}
              onClick={() => setMethod(p)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                method === p ? "border-ink bg-ink text-white" : "border-line bg-white"
              }`}
            >
              {PAYMENT_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="label">Причина</span>
        <input
          className="input"
          placeholder="Не подошёл аромат, брак, повреждена упаковка…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          К возврату: <b>{money(refund)}</b>
        </span>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn btn-danger btn-sm"
            disabled={busy || chosen.length === 0}
            onClick={() =>
              run(`/admin/orders/${order.id}/returns`, {
                body: {
                  items: chosen.map((i) => ({
                    order_item_id: i.id,
                    quantity: qty[i.id],
                    restock: restock[i.id],
                  })),
                  refund_method: method,
                  reason: reason || null,
                },
              })
            }
          >
            Оформить возврат
          </button>
        </div>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}
