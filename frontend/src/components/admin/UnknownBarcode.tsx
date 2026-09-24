"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorBox } from "@/components/ui";
import { api } from "@/lib/api";
import type { AdminVariant, VariantSearchItem } from "@/lib/types";
import { VariantPicker } from "./VariantPicker";

/** Scroll to the «attach an unknown barcode» panel once it is on the page. */
export function showUnknown(elementId = "unknown-barcode") {
  setTimeout(() => document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth" }), 50);
}

/** A scanned code that is not in the catalog: attach it to a volume, or create the product. */
export function UnknownBarcode({
  id,
  code,
  onAttached,
  onCancel,
}: {
  id?: string;
  code: string;
  onAttached: (item: VariantSearchItem) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attach = async (item: VariantSearchItem) => {
    setBusy(true);
    setError(null);
    try {
      await api<AdminVariant>(`/admin/variants/${item.variant_id}/barcodes`, { body: { code } });
      onAttached(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id={id} className="card scroll-mt-4 border-gold/60 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">
            Штрихкод <span className="font-mono">{code}</span> не найден
          </div>
          <p className="text-sm text-muted">
            Найдите товар и объём, к которым он относится. Код запомнится, и в следующий раз товар
            определится сам.
          </p>
        </div>
        <button className="text-sm text-muted hover:text-ink" onClick={onCancel}>
          Отмена
        </button>
      </div>
      <div className={`mt-3 ${busy ? "pointer-events-none opacity-60" : ""}`}>
        <VariantPicker onPick={attach} autoFocus placeholder="Товар для этого штрихкода" />
      </div>
      {error && (
        <div className="mt-2">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Такого товара ещё нет?{" "}
        <Link href="/admin/products/new" target="_blank" className="font-semibold text-gold">
          Создайте его
        </Link>
        , добавьте объём и отсканируйте код ещё раз.
      </p>
    </div>
  );
}
