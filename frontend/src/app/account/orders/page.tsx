"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorBox, Pagination, Spinner, StatusBadge } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import type { OrderBrief, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 20;

export default function MyOrdersPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<Page<OrderBrief>>("/orders", {
    query: { page, page_size: PAGE_SIZE },
  });

  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (loading && !data) return <Spinner />;
  if (data && data.total === 0) {
    return (
      <Empty title="Заказов пока нет">
        <Link href="/catalog" className="btn btn-primary mt-2">
          Выбрать аромат
        </Link>
      </Empty>
    );
  }
  return (
    <>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Заказ</th>
              <th>Дата</th>
              <th>Товаров</th>
              <th>Сумма</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((o) => (
              <tr key={o.id} className="hover:bg-cream">
                <td>
                  <Link href={`/account/orders/${o.id}`} className="font-semibold text-gold">
                    № {o.id}
                  </Link>
                  {o.channel === "store" && (
                    <span className="ml-2 text-xs text-muted">в магазине</span>
                  )}
                </td>
                <td>{dateTime(o.created_at)}</td>
                <td>{o.items_count} шт.</td>
                <td className="font-semibold">
                  {money(o.total_amount)}
                  {o.returned_amount > 0 && (
                    <div className="text-xs font-normal text-red-600">
                      возврат −{money(o.returned_amount)}
                    </div>
                  )}
                </td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && (
        <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />
      )}
    </>
  );
}
