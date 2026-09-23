"use client";

import { useState } from "react";
import { ErrorBox } from "@/components/ui";
import { api } from "@/lib/api";
import { CURRENCY } from "@/lib/format";
import type { AdminVariant } from "@/lib/types";
import { ImageUpload } from "./ImageUpload";

type Row = {
  volume_ml: string;
  sku: string;
  stock: string;
  retail_price: string;
  wholesale_price: string;
  bulk_price: string;
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
    photo_url: r.photo_url,
    is_active: r.is_active,
  };
}

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
    <div className="card overflow-x-auto p-4">
      <div className="mb-3 flex items-baseline justify-between">
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
      <table className="table-base min-w-[860px] [&_td]:px-1.5 [&_th]:px-1.5">
        <thead>
          <tr>
            <th>Фото</th>
            <th>Объём, мл</th>
            <th>Артикул</th>
            <th>Остаток</th>
            <th>Розница, {CURRENCY}</th>
            <th>Опт, {CURRENCY}</th>
            <th>Кр. опт, {CURRENCY}</th>
            <th>Активен</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <VariantRow
              key={v.id}
              initial={toRow(v)}
              seed={v.id}
              onSave={async (row) => {
                await api(`/admin/variants/${v.id}`, { method: "PATCH", body: toBody(row) });
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
        </tbody>
      </table>
    </div>
  );
}

function VariantRow({
  initial,
  seed,
  isNew = false,
  onSave,
  onDelete,
  onError,
}: {
  initial: Row;
  seed: number;
  isNew?: boolean;
  onSave: (row: Row) => Promise<void>;
  onDelete?: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [row, setRow] = useState<Row>(initial);
  const [busy, setBusy] = useState(false);
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

  const numInput = (key: keyof Row, required = false, width = "w-24") => (
    <input
      className={`input ${width}`}
      inputMode="decimal"
      required={required}
      value={row[key] as string}
      onChange={set(key)}
    />
  );

  return (
    <tr className={isNew ? "bg-cream/60" : ""}>
      <td>
        <ImageUpload
          compact
          seed={seed}
          value={row.photo_url}
          onChange={(url) => setRow({ ...row, photo_url: url })}
        />
      </td>
      <td>{numInput("volume_ml", true, "w-20")}</td>
      <td>
        <input className="input w-28" value={row.sku} onChange={set("sku")} />
      </td>
      <td>{numInput("stock", false, "w-20")}</td>
      <td>{numInput("retail_price", true)}</td>
      <td>{numInput("wholesale_price")}</td>
      <td>{numInput("bulk_price")}</td>
      <td className="text-center">
        <input
          type="checkbox"
          className="accent-gold"
          checked={row.is_active}
          onChange={(e) => setRow({ ...row, is_active: e.target.checked })}
        />
      </td>
      <td className="whitespace-nowrap">
        {isNew ? (
          <button
            className="btn btn-gold btn-sm"
            disabled={busy || !row.volume_ml || !row.retail_price}
            onClick={() => run(() => onSave(row))}
          >
            Добавить
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              className="btn btn-primary btn-sm"
              disabled={busy || !dirty}
              onClick={() => run(() => onSave(row))}
            >
              Сохранить
            </button>
            <button
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() => onDelete && run(onDelete)}
              title="Удалить объём"
            >
              ✕
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
