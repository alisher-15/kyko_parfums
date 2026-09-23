"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { EditItemsPanel, ReturnPanel } from "@/components/admin/OrderActions";
import { OrderHistory } from "@/components/OrderHistory";
import { OrderItemsTable } from "@/components/OrderItemsTable";
import { ErrorBox, Spinner, StatusBadge, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { CHANNEL_LABELS, PAYMENT_LABELS, ROLE_LABELS, STATUS_LABELS, dateTime } from "@/lib/format";
import type { AdminOrder, OrderStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

// Mirrors backend TRANSITIONS (app/services/orders.py).
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  new: ["processing", "shipped", "cancelled"],
  processing: ["new", "shipped", "cancelled"],
  shipped: ["processing", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

function nextStatuses(order: AdminOrder): OrderStatus[] {
  return NEXT[order.status];
}

export function OrderAdmin({ id }: { id: number }) {
  const { data: order, error, reload } = useApi<AdminOrder>(`/admin/orders/${id}`);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [panel, setPanel] = useState<"edit" | "return" | null>(null);

  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!order) return <Spinner />;

  const isStore = order.channel === "store";

  const patch = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/admin/orders/${id}`, { method: "PATCH", body });
      setMsg({ ok: true, text: okText });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (s: OrderStatus) => {
    if (s === "cancelled") {
      setConfirmCancel(true);
      return;
    }
    patch({ status: s }, `Статус изменён: ${STATUS_LABELS[s]}`);
  };

  const canEdit = order.status === "new" || order.status === "processing";
  const canReturn = order.status === "delivered" && !order.fully_returned;
  const panelDone = (text: string) => () => {
    setPanel(null);
    setMsg({ ok: true, text });
    reload();
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="text-sm text-muted hover:text-ink">
        ← Все заказы
      </Link>
      <AdminHeader
        title={
          <>
            {isStore ? "Продажа" : "Заказ"} № {order.id} <StatusBadge status={order.status} />
          </>
        }
        actions={
          <span className={`chip ${isStore ? "border-gold text-gold" : ""}`}>
            {CHANNEL_LABELS[order.channel]}
            {order.payment_method ? ` · ${PAYMENT_LABELS[order.payment_method]}` : ""}
          </span>
        }
      />
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <span className="mr-2 text-sm text-muted">
          {isStore && order.status === "delivered" ? "Товар выдан покупателю." : "Сменить статус:"}
        </span>
        {nextStatuses(order).length === 0 && (
          <span className="text-sm">Заказ в финальном статусе</span>
        )}
        {nextStatuses(order).map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => changeStatus(s)}
            className={`btn btn-sm ${s === "cancelled" ? "btn-danger" : "btn-outline"}`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
        <span className="flex-1" />
        {canEdit && (
          <button className="btn btn-gold btn-sm" onClick={() => setPanel("edit")}>
            Изменить состав
          </button>
        )}
        {canReturn && (
          <button className="btn btn-danger btn-sm" onClick={() => setPanel("return")}>
            Оформить возврат
          </button>
        )}
        {order.fully_returned && <span className="chip text-red-600">Возвращён полностью</span>}
      </div>
      {panel === "edit" && (
        <EditItemsPanel
          order={order}
          onDone={panelDone("Состав заказа изменён")}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "return" && (
        <ReturnPanel
          order={order}
          onDone={panelDone("Возврат оформлен")}
          onClose={() => setPanel(null)}
        />
      )}
      {confirmCancel && (
        <div className="card flex flex-wrap items-center gap-3 border-red-200 bg-red-50 p-4 text-sm">
          <span className="flex-1">Отменить заказ? Товары вернутся на склад.</span>
          <button
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={() => {
              setConfirmCancel(false);
              patch({ status: "cancelled" }, "Заказ отменён");
            }}
          >
            Да, отменить
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setConfirmCancel(false)}>
            Нет
          </button>
        </div>
      )}
      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}

      <OrderItemsTable order={order} admin />
      <OrderHistory order={order} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 text-sm">
          <div className="label">Покупатель</div>
          {order.contact_name || order.contact_phone || order.contact_email ? (
            <>
              {order.contact_name && <div className="font-semibold">{order.contact_name}</div>}
              {order.contact_phone && <div>{order.contact_phone}</div>}
              {order.contact_email && <div>{order.contact_email}</div>}
            </>
          ) : (
            <div className="text-muted">Анонимный покупатель</div>
          )}
          {order.user_email && (
            <>
              <div className="mt-2 text-xs text-muted">
                Аккаунт: {order.user_email} · {ROLE_LABELS[order.customer_role]} на момент заказа
              </div>
              <Link
                href={`/admin/users?q=${encodeURIComponent(order.user_email)}`}
                className="text-xs text-gold"
              >
                Открыть пользователя
              </Link>
            </>
          )}
        </div>
        <div className="card p-5 text-sm">
          <div className="label">{isStore ? "Продажа" : "Доставка"}</div>
          {isStore ? (
            <>
              <div>Продано в магазине</div>
              {order.created_by_email && (
                <div className="text-muted">Провёл: {order.created_by_email}</div>
              )}
            </>
          ) : (
            <>
              <div>{order.delivery_city}</div>
              <div>{order.delivery_address}</div>
            </>
          )}
          {order.comment && <div className="mt-2 text-muted">Комментарий: «{order.comment}»</div>}
          <div className="mt-2 text-xs text-muted">
            Создан {dateTime(order.created_at)} · обновлён {dateTime(order.updated_at)}
          </div>
        </div>
        <div className="card p-5 text-sm">
          <div className="label">Заметка менеджера</div>
          <textarea
            className="input min-h-24"
            value={note ?? order.admin_note ?? ""}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className="btn btn-outline btn-sm mt-2"
            disabled={busy || note === null}
            onClick={() => patch({ admin_note: note || null }, "Заметка сохранена")}
          >
            Сохранить заметку
          </button>
        </div>
      </div>
    </div>
  );
}
