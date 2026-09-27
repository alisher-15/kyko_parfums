"use client";

import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Empty, ErrorBox, ProductImage, Spinner } from "@/components/ui";
import { PROMOTION_STATUS_LABELS, dayMonth, percentOff, plural } from "@/lib/format";
import type { PromotionBrief, PromotionStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const STATUS_COLORS: Record<PromotionStatus, string> = {
  running: "text-emerald-700",
  scheduled: "text-sky-700",
  ended: "text-muted",
  off: "text-muted",
};

function period(p: PromotionBrief): string {
  if (p.starts_on && p.ends_on) return `${dayMonth(p.starts_on)} — ${dayMonth(p.ends_on)}`;
  if (p.starts_on) return `с ${dayMonth(p.starts_on)}`;
  if (p.ends_on) return `до ${dayMonth(p.ends_on)}`;
  return "без срока";
}

function scope(p: PromotionBrief): string {
  if (p.discount_percent === null && !p.all_products && !p.brands_count && !p.products_count) {
    return "только баннер";
  }
  if (p.all_products) return "весь каталог";
  const parts = [];
  if (p.brands_count) parts.push(`${p.brands_count} ${plural(p.brands_count, "бренд", "бренда", "брендов")}`);
  if (p.products_count) {
    parts.push(`${p.products_count} ${plural(p.products_count, "товар", "товара", "товаров")}`);
  }
  return parts.join(", ");
}

export default function PromotionsPage() {
  const { data, error } = useApi<PromotionBrief[]>("/admin/promotions");
  return (
    <div className="max-w-5xl">
      <AdminHeader
        title="Акции"
        actions={
          <Link href="/admin/promotions/new" className="btn btn-primary btn-sm">
            + Новая акция
          </Link>
        }
      />
      <p className="mb-4 text-sm text-muted">
        Идущие акции показываются баннерами на главной, а товары со скидкой — в блоке «Акции». Цена
        по акции сама применяется в корзине и на кассе и сама перестаёт действовать после
        последнего дня.
      </p>
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {!data && !error && <Spinner />}
      {data && data.length === 0 && (
        <Empty title="Акций пока нет">
          <Link href="/admin/promotions/new" className="btn btn-primary mt-2">
            Создать первую акцию
          </Link>
        </Empty>
      )}
      <div className="space-y-3">
        {data?.map((p) => (
          <Link
            key={p.id}
            href={`/admin/promotions/${p.id}`}
            className="card flex items-center gap-4 p-3 hover:border-gold"
          >
            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-ink">
              {p.image_url && <ProductImage src={p.image_url} alt="" seed={p.id} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{p.title}</div>
              <div className="text-sm text-muted">
                {p.discount_percent !== null ? percentOff(p.discount_percent) : "без скидки"} ·{" "}
                {period(p)} · {scope(p)}
              </div>
            </div>
            <span className={`chip shrink-0 ${STATUS_COLORS[p.status]}`}>
              {PROMOTION_STATUS_LABELS[p.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
