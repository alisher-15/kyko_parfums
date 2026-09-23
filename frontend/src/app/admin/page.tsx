"use client";

import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ErrorBox, Spinner } from "@/components/ui";
import { ROLE_LABELS, STATUS_LABELS, money } from "@/lib/format";
import type { OrderStatus, Stats, UserRole } from "@/lib/types";
import { useApi } from "@/lib/use-api";

function Tile({ label, value, href, accent }: { label: string; value: string | number; href?: string; accent?: boolean }) {
  const body = (
    <div className={`card h-full p-5 ${accent ? "border-gold bg-amber-50" : ""} ${href ? "hover:border-ink" : ""}`}>
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function AdminDashboard() {
  const { data, error } = useApi<Stats>("/admin/stats");
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!data) return <Spinner />;

  return (
    <>
      <AdminHeader
        title="Обзор"
        actions={
          <Link href="/admin/pos" className="btn btn-primary btn-sm">
            + Продажа в магазине
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Новые заказы" value={data.orders_by_status.new} href="/admin/orders?status=new" accent={data.orders_by_status.new > 0} />
        <Tile label="Выручка (без отменённых)" value={money(data.revenue_total)} />
        <Tile
          label={`Продажи в магазине сегодня · ${data.store_sales_today}`}
          value={money(data.store_revenue_today)}
          href="/admin/orders?channel=store"
        />
        <Tile label="Выручка сайта" value={money(data.revenue_by_channel.online)} href="/admin/orders?channel=online" />
        <Tile label="Выручка магазина" value={money(data.revenue_by_channel.store)} href="/admin/orders?channel=store" />
        <Tile label="Заявки на опт" value={data.wholesale_requests} href="/admin/users?wholesale_requested=true" accent={data.wholesale_requests > 0} />
        <Tile label="Мало на складе (≤ 3 шт.)" value={data.variants_low_stock} />
        <Tile label="Товаров" value={data.products_total} href="/admin/products" />
        <Tile label="Без цен / объёмов" value={data.products_without_variants} href="/admin/products?no_variants=true" />
        <Tile label="Брендов" value={data.brands_total} href="/admin/brands" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 font-semibold">Заказы по статусам</div>
          <ul className="space-y-2 text-sm">
            {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
              <li key={s} className="flex justify-between">
                <Link href={`/admin/orders?status=${s}`} className="hover:text-gold">
                  {STATUS_LABELS[s]}
                </Link>
                <span className="font-semibold">{data.orders_by_status[s]}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <div className="mb-3 font-semibold">Пользователи по ролям</div>
          <ul className="space-y-2 text-sm">
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <li key={r} className="flex justify-between">
                <Link href={`/admin/users?role=${r}`} className="hover:text-gold">
                  {ROLE_LABELS[r]}
                </Link>
                <span className="font-semibold">{data.users_by_role[r]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
