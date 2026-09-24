"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Empty, ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { CountBrief, StockCount } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function InventoryPage() {
  const { data, error } = useApi<CountBrief[]>("/admin/counts");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setCreateError(null);
    try {
      const c = await api<StockCount>("/admin/counts", { body: {} });
      router.push(`/admin/inventory/${c.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <AdminHeader
        title="Инвентаризация"
        actions={
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={create}>
            + Новая инвентаризация
          </button>
        }
      />
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Пересчитайте полку или весь склад сканером. После проведения остатки отсканированных
        товаров станут равны посчитанному, расхождения попадут в журнал склада. Товары, которые вы
        не сканировали, не меняются.
      </p>
      {createError && <ErrorBox>{createError}</ErrorBox>}
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {!data && !error && <Spinner />}
      {data && data.length === 0 && <Empty title="Инвентаризаций пока не было" />}
      {data && data.length > 0 && (
        <ul className="space-y-2">
          {data.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/inventory/${c.id}`}
                className="card flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:border-ink"
              >
                <span className="font-semibold">Инвентаризация № {c.id}</span>
                <span className={`chip ${c.status === "draft" ? "border-gold text-gold" : ""}`}>
                  {c.status === "draft" ? "Идёт пересчёт" : "Проведена"}
                </span>
                {c.note && <span className="text-sm">{c.note}</span>}
                <span className="flex-1" />
                <span className="text-sm text-muted">
                  {c.lines} поз. · расхождение{" "}
                  <b className={c.difference < 0 ? "text-red-600" : c.difference > 0 ? "text-emerald-700" : ""}>
                    {c.difference > 0 ? `+${c.difference}` : c.difference} шт.
                  </b>
                </span>
                <span className="w-full text-xs text-muted sm:w-auto">
                  {dateTime(c.posted_at ?? c.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
