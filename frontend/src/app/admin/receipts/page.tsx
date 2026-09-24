"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Empty, ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import type { Receipt, ReceiptBrief } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function ReceiptsPage() {
  const { data, error } = useApi<ReceiptBrief[]>("/admin/receipts");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setCreateError(null);
    try {
      const r = await api<Receipt>("/admin/receipts", { body: {} });
      router.push(`/admin/receipts/${r.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <AdminHeader
        title="Приёмка товара"
        actions={
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={create}>
            + Новая приёмка
          </button>
        }
      />
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Приходная накладная от поставщика: сканируйте коробки, укажите закупочные цены и проведите
        документ. Товар добавится на склад, а себестоимость пересчитается по средней.
      </p>
      {createError && <ErrorBox>{createError}</ErrorBox>}
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {!data && !error && <Spinner />}
      {data && data.length === 0 && (
        <Empty title="Приёмок пока нет">
          <p className="text-sm text-muted">Создайте первую, когда придёт товар.</p>
        </Empty>
      )}
      {data && data.length > 0 && (
        <ul className="space-y-2">
          {data.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/receipts/${r.id}`}
                className="card flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:border-ink"
              >
                <span className="font-semibold">Приёмка № {r.id}</span>
                <span className={`chip ${r.status === "draft" ? "border-gold text-gold" : ""}`}>
                  {r.status === "draft" ? "Черновик" : "Проведена"}
                </span>
                <span className="text-sm">
                  {r.supplier ?? "Поставщик не указан"}
                  {r.number ? ` · накл. ${r.number}` : ""}
                </span>
                <span className="flex-1" />
                <span className="text-sm text-muted">
                  {r.lines} поз. · {r.total_quantity} шт.
                  {r.total_cost > 0 ? ` · ${money(r.total_cost)}` : ""}
                </span>
                <span className="w-full text-xs text-muted sm:w-auto">
                  {dateTime(r.posted_at ?? r.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
