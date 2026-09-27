"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PromotionForm } from "@/components/admin/PromotionForm";
import { ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { PROMOTION_STATUS_LABELS } from "@/lib/format";
import type { Promotion } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function PromotionEdit({ id }: { id: number }) {
  const router = useRouter();
  const { data: promotion, error, reload } = useApi<Promotion>(`/admin/promotions/${id}`);

  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!promotion) return <Spinner />;

  const remove = async () => {
    if (!confirm(`Удалить акцию «${promotion.title}»? Проданные по ней заказы сохранят цену.`)) return;
    try {
      await api(`/admin/promotions/${id}`, { method: "DELETE" });
      router.replace("/admin/promotions");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/promotions" className="text-sm text-muted hover:text-ink">
        ← Все акции
      </Link>
      <AdminHeader
        title={
          <>
            {promotion.title}{" "}
            <span className="align-middle text-base font-normal text-muted">
              · {PROMOTION_STATUS_LABELS[promotion.status]}
            </span>
          </>
        }
        actions={
          <>
            {promotion.status === "running" && (
              <Link
                href={`/catalog?promotion_id=${promotion.id}`}
                className="btn btn-outline btn-sm"
                target="_blank"
              >
                Открыть на сайте
              </Link>
            )}
            <button className="btn btn-danger btn-sm" onClick={remove}>
              Удалить акцию
            </button>
          </>
        }
      />
      <PromotionForm key={promotion.updated_at} promotion={promotion} onSaved={reload} />
    </div>
  );
}
