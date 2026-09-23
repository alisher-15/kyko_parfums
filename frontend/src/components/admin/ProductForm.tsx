"use client";

import { useState, type FormEvent } from "react";
import { ErrorBox, Field, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { GENDER_LABELS } from "@/lib/format";
import type { AdminProduct, Brand, Gender } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { ImageUpload } from "./ImageUpload";

const TYPES = ["EDP", "EDT", "Parfum", "Extrait", "EDC"];

type FormState = {
  brand_id: string;
  name: string;
  type: string;
  category: string;
  gender: Gender | "";
  longevity: string;
  top_notes: string;
  mid_notes: string;
  base_notes: string;
  description: string;
  image_url: string | null;
  is_active: boolean;
};

function toForm(p?: AdminProduct): FormState {
  return {
    brand_id: p ? String(p.brand_id) : "",
    name: p?.name ?? "",
    type: p?.type ?? "",
    category: p?.category ?? "",
    gender: p?.gender ?? "",
    longevity: p?.longevity ?? "",
    top_notes: p?.top_notes ?? "",
    mid_notes: p?.mid_notes ?? "",
    base_notes: p?.base_notes ?? "",
    description: p?.description ?? "",
    image_url: p?.image_url ?? null,
    is_active: p?.is_active ?? true,
  };
}

export function ProductForm({
  product,
  onSaved,
}: {
  product?: AdminProduct;
  onSaved: (p: AdminProduct) => void;
}) {
  const brands = useApi<Brand[]>("/admin/brands");
  const [form, setForm] = useState<FormState>(() => toForm(product));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set =
    (key: keyof FormState) =>
    (e: { target: { value: string } }) =>
      setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const nullIfEmpty = (s: string) => (s.trim() ? s.trim() : null);
    const body = {
      brand_id: Number(form.brand_id),
      name: form.name.trim(),
      type: nullIfEmpty(form.type),
      category: nullIfEmpty(form.category),
      gender: form.gender || null,
      longevity: nullIfEmpty(form.longevity),
      top_notes: nullIfEmpty(form.top_notes),
      mid_notes: nullIfEmpty(form.mid_notes),
      base_notes: nullIfEmpty(form.base_notes),
      description: nullIfEmpty(form.description),
      image_url: form.image_url,
      is_active: form.is_active,
    };
    try {
      const saved = product
        ? await api<AdminProduct>(`/admin/products/${product.id}`, { method: "PATCH", body })
        : await api<AdminProduct>("/admin/products", { body });
      setMsg({ ok: true, text: "Сохранено" });
      onSaved(saved);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card grid gap-6 p-6 lg:grid-cols-[240px_1fr]">
      <div>
        <span className="label">Главное фото</span>
        <ImageUpload
          value={form.image_url}
          onChange={(url) => setForm({ ...form, image_url: url })}
          seed={product?.id ?? 0}
        />
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Бренд">
            <select className="input" required value={form.brand_id} onChange={set("brand_id")}>
              <option value="">— выберите —</option>
              {brands.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Название">
            <input className="input" required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Тип">
            <input className="input" list="product-types" value={form.type} onChange={set("type")} />
            <datalist id="product-types">
              {TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Пол">
            <select className="input" value={form.gender} onChange={set("gender")}>
              <option value="">—</option>
              {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Олфактивная группа">
            <input className="input" value={form.category} onChange={set("category")} />
          </Field>
          <Field label="Стойкость">
            <input className="input" value={form.longevity} onChange={set("longevity")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Верхние ноты" hint="Через запятую">
            <textarea className="input min-h-20" value={form.top_notes} onChange={set("top_notes")} />
          </Field>
          <Field label="Ноты сердца">
            <textarea className="input min-h-20" value={form.mid_notes} onChange={set("mid_notes")} />
          </Field>
          <Field label="Базовые ноты">
            <textarea className="input min-h-20" value={form.base_notes} onChange={set("base_notes")} />
          </Field>
        </div>
        <Field label="Описание">
          <textarea className="input min-h-28" value={form.description} onChange={set("description")} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-gold"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Показывать на сайте
        </label>
        {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}
        <button className="btn btn-primary" disabled={busy}>
          {product ? "Сохранить изменения" : "Создать товар"}
        </button>
      </div>
    </form>
  );
}
