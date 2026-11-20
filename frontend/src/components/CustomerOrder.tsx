"use client";

import Link from "next/link";
import { useState } from "react";
import { OrderHistory } from "@/components/OrderHistory";
import { OrderItemsTable } from "@/components/OrderItemsTable";
import { ErrorBox, Spinner, StatusBadge, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { PAYMENT_LABELS, dateTime } from "@/lib/format";
import type { Order } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/**
 * An order as its customer sees it: in the account, or by the link a guest gets after ordering
 * without an account (`/orders/{id}?key=…`; the key goes to the API in a header).
 */
export function CustomerOrder({
  id,
  created,
  guestKey,
}: {
  id: number;
  created: boolean;
  guestKey?: string;
}) {
  const path = guestKey === undefined ? `/orders/${id}` : `/orders/guest/${id}`;
  const headers = guestKey === undefined ? undefined : { "X-Order-Key": guestKey };
  const { data: order, error, reload } = useApi<Order>(path, { headers });
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorBox>{error.status === 404 ? "Заказ не найден" : error.message}</ErrorBox>;
  if (!order) return <Spinner />;

  const cancel = async () => {
    if (!confirm("Отменить заказ?")) return;
    setBusy(true);
    try {
      await api(`${path}/cancel`, { method: "POST", headers });
      reload();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {created && order.status === "new" && (
        <SuccessBox>
          Спасибо! Заказ № {order.id} создан. Менеджер свяжется с вами для подтверждения и оплаты
          (по факту или переводом).
          {guestKey !== undefined && (
            <>
              {" "}
              Сохраните эту страницу в закладки: по её адресу видно, что с заказом
              {order.contact_email ? `, и мы прислали его на ${order.contact_email}` : ""}.
            </>
          )}
        </SuccessBox>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {guestKey === undefined ? (
            <Link href="/account/orders" className="text-sm text-muted hover:text-ink">
              ← Все заказы
            </Link>
          ) : (
            <Link href="/catalog" className="text-sm text-muted hover:text-ink">
              ← В каталог
            </Link>
          )}
          <h2 className="mt-1 font-serif text-3xl font-bold">
            {order.channel === "store" ? "Покупка" : "Заказ"} № {order.id}{" "}
            <StatusBadge status={order.status} />
          </h2>
          <div className="text-sm text-muted">от {dateTime(order.created_at)}</div>
        </div>
        {order.status === "new" && (
          <button className="btn btn-danger btn-sm" onClick={cancel} disabled={busy}>
            Отменить заказ
          </button>
        )}
      </div>
      {cancelError && <ErrorBox>{cancelError}</ErrorBox>}

      <OrderItemsTable order={order} />
      <OrderHistory order={order} />

      {order.channel === "store" ? (
        <div className="card p-5 text-sm">
          <div className="label">Покупка в магазине</div>
          <div>
            Оплата: {order.payment_method ? PAYMENT_LABELS[order.payment_method] : "—"}
          </div>
          {order.comment && <div className="mt-2 text-muted">«{order.comment}»</div>}
        </div>
      ) : (
        <div className="card grid gap-4 p-5 text-sm sm:grid-cols-2">
          <div>
            <div className="label">Получатель</div>
            <div>{order.contact_name}</div>
            <div>{order.contact_phone}</div>
            <div>{order.contact_email}</div>
          </div>
          <div>
            <div className="label">Доставка</div>
            <div>
              {order.delivery_city}, {order.delivery_address}
            </div>
            {order.comment && <div className="mt-2 text-muted">«{order.comment}»</div>}
          </div>
        </div>
      )}
    </div>
  );
}
