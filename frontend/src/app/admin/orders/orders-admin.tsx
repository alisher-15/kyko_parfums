"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ErrorBox, Pagination, Spinner, StatusBadge } from "@/components/ui";
import {
  CHANNEL_LABELS,
  PAYMENT_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  dateTime,
  money,
} from "@/lib/format";
import type { AdminOrderBrief, OrderChannel, OrderStatus, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 50;

export function OrdersAdmin({
  initialStatus,
  initialChannel,
}: {
  initialStatus: OrderStatus | "";
  initialChannel: OrderChannel | "";
}) {
  const [status, setStatus] = useState<OrderStatus | "">(initialStatus);
  const [channel, setChannel] = useState<OrderChannel | "">(initialChannel);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const router = useRouter();
  const { data, error, loading } = useApi<Page<AdminOrderBrief>>("/admin/orders", {
    query: { status, channel, q: search, page, page_size: PAGE_SIZE },
  });

  return (
    <>
      <AdminHeader
        title={`Заказы и продажи${data ? ` · ${data.total}` : ""}`}
        actions={
          <Link href="/admin/pos" className="btn btn-primary btn-sm">
            + Продажа в магазине
          </Link>
        }
      />
      <div className="mb-2 flex flex-wrap gap-2">
        {(["", "online", "store"] as (OrderChannel | "")[]).map((c) => (
          <button
            key={c || "all"}
            onClick={() => {
              setChannel(c);
              setPage(1);
            }}
            className={`btn btn-sm ${channel === c ? "btn-gold" : "btn-outline"}`}
          >
            {c ? CHANNEL_LABELS[c] : "Все каналы"}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["", ...Object.keys(STATUS_LABELS)] as (OrderStatus | "")[]).map((s) => (
          <button
            key={s || "all"}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`btn btn-sm ${status === s ? "btn-primary" : "btn-outline"}`}
          >
            {s ? STATUS_LABELS[s] : "Все"}
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q);
            setPage(1);
          }}
          className="ml-auto flex gap-2"
        >
          <input
            className="input"
            placeholder="№, email, имя, телефон"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn btn-outline btn-sm">Найти</button>
        </form>
      </div>
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {loading && !data && <Spinner />}
      {data && (
        <div className={loading ? "opacity-60" : ""}>
          {data.items.length === 0 && (
            <div className="card py-8 text-center text-sm text-muted">Заказов нет</div>
          )}
          {/* Phones: tappable cards. */}
          <div className="space-y-3 md:hidden">
            {data.items.map((o) => (
              <Link
                key={o.id}
                href={`/admin/orders/${o.id}`}
                className="card block p-3 active:bg-cream"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    № {o.id} <ChannelTag order={o} />
                  </span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="mt-1 text-sm">{o.contact_name ?? "Покупатель без имени"}</div>
                <div className="text-xs text-muted">
                  {[o.contact_phone, ROLE_LABELS[o.customer_role]].filter(Boolean).join(" · ")}
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-xs text-muted">
                    {dateTime(o.created_at)} · {o.items_count} шт.
                  </span>
                  <span className="font-semibold">{money(o.total_amount)}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: the whole row opens the order. */}
          {data.items.length > 0 && (
            <div className="card hidden overflow-x-auto md:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Канал</th>
                    <th>Дата</th>
                    <th>Покупатель</th>
                    <th>Тип клиента</th>
                    <th>Товаров</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((o) => (
                    <tr
                      key={o.id}
                      className="cursor-pointer hover:bg-cream"
                      onClick={() => router.push(`/admin/orders/${o.id}`)}
                    >
                      <td>
                        <Link href={`/admin/orders/${o.id}`} className="font-semibold text-gold">
                          {o.id}
                        </Link>
                      </td>
                      <td>
                        <ChannelTag order={o} />
                      </td>
                      <td className="text-xs">{dateTime(o.created_at)}</td>
                      <td>
                        <div>{o.contact_name ?? <span className="text-muted">—</span>}</div>
                        <div className="text-xs text-muted">
                          {[o.contact_phone, o.user_email].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="text-xs">{ROLE_LABELS[o.customer_role]}</td>
                      <td>{o.items_count}</td>
                      <td className="font-semibold">{money(o.total_amount)}</td>
                      <td>
                        <StatusBadge status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {data && <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />}
    </>
  );
}

function ChannelTag({ order }: { order: AdminOrderBrief }) {
  if (order.channel === "online") return <span className="chip">Сайт</span>;
  return (
    <span className="chip border-gold text-gold">
      Магазин{order.payment_method ? ` · ${PAYMENT_LABELS[order.payment_method]}` : ""}
    </span>
  );
}
