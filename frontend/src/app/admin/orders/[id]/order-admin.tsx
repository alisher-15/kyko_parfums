"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { OrderItemsTable } from "@/components/OrderItemsTable";
import { ErrorBox, Spinner, StatusBadge, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { ROLE_LABELS, STATUS_LABELS, dateTime } from "@/lib/format";
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

export function OrderAdmin({ id }: { id: number }) {
  const { data: order, error, reload } = useApi<AdminOrder>(`/admin/orders/${id}`);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!order) return <Spinner />;

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
    if (s === "cancelled" && !confirm("Отменить заказ? Товары вернутся на склад.")) return;
    patch({ status: s }, `Статус изменён: ${STATUS_LABELS[s]}`);
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="text-sm text-muted hover:text-ink">
        ← Все заказы
      </Link>
      <AdminHeader
        title={
          <>
            Заказ № {order.id} <StatusBadge status={order.status} />
          </>
        }
      />
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <span className="mr-2 text-sm text-muted">Сменить статус:</span>
        {NEXT[order.status].length === 0 && (
          <span className="text-sm">Заказ в финальном статусе</span>
        )}
        {NEXT[order.status].map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => changeStatus(s)}
            className={`btn btn-sm ${s === "cancelled" ? "btn-danger" : "btn-outline"}`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}

      <OrderItemsTable order={order} admin />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 text-sm">
          <div className="label">Покупатель</div>
          <div className="font-semibold">{order.contact_name}</div>
          <div>{order.contact_phone}</div>
          <div>{order.contact_email}</div>
          <div className="mt-2 text-xs text-muted">
            Аккаунт: {order.user_email} · {ROLE_LABELS[order.customer_role]} на момент заказа
          </div>
          <Link href={`/admin/users?q=${encodeURIComponent(order.user_email)}`} className="text-xs text-gold">
            Открыть пользователя
          </Link>
        </div>
        <div className="card p-5 text-sm">
          <div className="label">Доставка</div>
          <div>{order.delivery_city}</div>
          <div>{order.delivery_address}</div>
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
