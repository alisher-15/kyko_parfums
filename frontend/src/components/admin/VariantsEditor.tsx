"use client";

import { useState } from "react";
import { ErrorBox } from "@/components/ui";
import { api } from "@/lib/api";
import { CURRENCY } from "@/lib/format";
import type { AdminVariant } from "@/lib/types";
import { BarcodeList } from "./BarcodeList";
import { ImageUpload } from "./ImageUpload";

type Row = {
  volume_ml: string;
  sku: string;
  stock: string;
  retail_price: string;
  wholesale_price: string;
  bulk_price: string;
  cost_price: string;
  photo_url: string | null;
  is_active: boolean;
};

const EMPTY: Row = {
  volume_ml: "",
  sku: "",
  stock: "0",
  retail_price: "",
  wholesale_price: "",
  bulk_price: "",
  cost_price: "",
  photo_url: null,
  is_active: true,
};

function toRow(v: AdminVariant): Row {
  const s = (n: number | null) => (n === null ? "" : String(n));
  return {
    volume_ml: String(v.volume_ml),
    sku: v.sku ?? "",
    stock: String(v.stock),
    retail_price: String(v.retail_price),
    wholesale_price: s(v.wholesale_price),
    bulk_price: s(v.bulk_price),
    cost_price: s(v.cost_price),
    photo_url: v.photo_url,
    is_active: v.is_active,
  };
}

function toBody(r: Row) {
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  return {
    volume_ml: Number(r.volume_ml),
    sku: r.sku.trim() || null,
    stock: Number(r.stock || 0),
    retail_price: num(r.retail_price),
    wholesale_price: num(r.wholesale_price),
    bulk_price: num(r.bulk_price),
    cost_price: num(r.cost_price),
    photo_url: r.photo_url,
    is_active: r.is_active,
  };
}

// Desktop (xl+) lays each volume out as one table-like row; smaller screens get a card per volume.
const GRID =
  "xl:grid xl:grid-cols-[112px_80px_minmax(90px,1fr)_80px_repeat(3,minmax(96px,1fr))_56px_150px] xl:items-center xl:gap-2";

/** Inline editor for volumes: each volume has its own stock and three price tiers. */
export function VariantsEditor({
  productId,
  variants,
  onChanged,
}: {
  productId: number;
  variants: AdminVariant[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl font-semibold">Объёмы, цены и остатки</h2>
        <span className="text-xs text-muted">
          Пустая оптовая / крупнооптовая цена = берётся цена уровнем выше
        </span>
      </div>
      {error && (
        <div className="mb-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      <div
        className={`hidden border-b border-line pb-2 text-xs font-semibold tracking-wide text-muted uppercase ${GRID}`}
      >
        <span>Фото</span>
        <span>Объём, мл</span>
        <span>Артикул</span>
        <span>Остаток</span>
        <span>Розница, {CURRENCY}</span>
        <span>Опт, {CURRENCY}</span>
        <span>Кр. опт, {CURRENCY}</span>
        <span>Активен</span>
        <span></span>
      </div>
      <div className="space-y-3 xl:space-y-0">
        {variants.map((v) => (
          <VariantRow
            key={v.id}
            initial={toRow(v)}
            seed={v.id}
            extra={<BarcodeList variantId={v.id} barcodes={v.barcodes} onChanged={onChanged} />}
            onSave={async (row, stockNote) => {
              await api(`/admin/variants/${v.id}`, {
                method: "PATCH",
                body: { ...toBody(row), stock_note: stockNote || null },
              });
              onChanged();
            }}
            onDelete={async () => {
              if (!confirm(`Удалить объём ${v.volume_ml} мл?`)) return;
              await api(`/admin/variants/${v.id}`, { method: "DELETE" });
              onChanged();
            }}
            onError={setError}
          />
        ))}
        <VariantRow
          key={`new-${variants.length}`}
          initial={EMPTY}
          seed={0}
          isNew
          onSave={async (row) => {
            await api(`/admin/products/${productId}/variants`, { body: toBody(row) });
            onChanged();
          }}
          onError={setError}
        />
      </div>
    </div>
  );
}

function VariantRow({
  initial,
  seed,
  isNew = false,
  extra,
  onSave,
  onDelete,
  onError,
}: {
  initial: Row;
  seed: number;
  isNew?: boolean;
  extra?: React.ReactNode;
  onSave: (row: Row, stockNote: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [row, setRow] = useState<Row>(initial);
  const [stockNote, setStockNote] = useState("");
  const [busy, setBusy] = useState(false);
  const stockChanged = !isNew && row.stock !== initial.stock;
  const dirty = JSON.stringify(row) !== JSON.stringify(initial);

  const set = (key: keyof Row) => (e: { target: { value: string } }) =>
    setRow({ ...row, [key]: e.target.value });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    onError(null);
    try {
      await fn();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // The label is shown on cards (phones/tablets) and hidden in the desktop row, which has a header.
  const field = (label: string, key: keyof Row, opts: { required?: boolean; numeric?: boolean } = {}) => (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase xl:hidden">
        {label}
      </span>
      <input
        className="input"
        inputMode={opts.numeric === false ? "text" : "decimal"}
        required={opts.required}
        value={row[key] as string}
        onChange={set(key)}
      />
    </label>
  );

  return (
    <div
      className={`rounded-xl border border-line p-3 xl:rounded-none xl:border-0 xl:border-b xl:px-0 xl:py-2 ${
        isNew ? "bg-cream/60 xl:bg-cream/60" : ""
      } ${GRID}`}
    >
      {isNew && (
        <div className="mb-2 text-sm font-semibold xl:hidden">Добавить объём</div>
      )}
      <div className="mb-3 xl:mb-0">
        <ImageUpload
          compact
          seed={seed}
          value={row.photo_url}
          onChange={(url) => setRow({ ...row, photo_url: url })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:contents">
        {field(`Объём, мл`, "volume_ml", { required: true })}
        {field("Артикул", "sku", { numeric: false })}
        {field("Остаток, шт.", "stock")}
        {field(`Розница, ${CURRENCY}`, "retail_price", { required: true })}
        {field(`Опт, ${CURRENCY}`, "wholesale_price")}
        {field(`Кр. опт, ${CURRENCY}`, "bulk_price")}
        {/* Phones and tablets: next to the prices, above "Save". Desktop: in the row below. */}
        <div className="xl:hidden">{field(`Себестоимость, ${CURRENCY}`, "cost_price")}</div>
      </div>
      {stockChanged && (
        <label className="mt-2 block xl:col-span-full xl:mt-1">
          <span className="text-xs text-muted">
            Остаток {initial.stock} → {row.stock || 0}. Причина (попадёт в журнал склада). Приход
            от поставщика удобнее оформлять через «Приёмку»:
          </span>
          <input
            className="input mt-1"
            placeholder="Списание брака, пересчёт…"
            value={stockNote}
            onChange={(e) => setStockNote(e.target.value)}
          />
        </label>
      )}
      <label className="mt-3 flex items-center gap-2 text-sm xl:mt-0 xl:justify-center">
        <input
          type="checkbox"
          className="accent-gold"
          checked={row.is_active}
          onChange={(e) => setRow({ ...row, is_active: e.target.checked })}
        />
        <span className="xl:hidden">Показывать на сайте</span>
      </label>
      <div className="mt-3 flex gap-2 xl:mt-0">
        {isNew ? (
          <button
            type="button"
            className="btn btn-gold btn-sm flex-1 xl:flex-none"
            disabled={busy || !row.volume_ml || !row.retail_price}
            onClick={() => run(() => onSave(row, ""))}
          >
            Добавить
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm flex-1 xl:flex-none"
              disabled={busy || !dirty}
              onClick={() =>
                run(async () => {
                  await onSave(row, stockNote);
                  setStockNote("");
                })
              }
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() => onDelete && run(onDelete)}
              title="Удалить объём"
            >
              <span className="xl:hidden">Удалить</span>
              <span className="hidden xl:inline">✕</span>
            </button>
          </>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-3 xl:col-span-full xl:mt-1 xl:pb-1">
        <label className="hidden w-40 shrink-0 xl:block">
          <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">
            Себестоимость, {CURRENCY}
          </span>
          <input
            className="input"
            inputMode="decimal"
            placeholder="не указана"
            value={row.cost_price}
            onChange={set("cost_price")}
          />
        </label>
        {extra}
      </div>
    </div>
  );
}
