"use client";

import { useState, type FormEvent } from "react";
import { ErrorBox, Field, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { categoryOptions } from "@/lib/categories";
import { GENDER_LABELS } from "@/lib/format";
import type { AdminCategory, AdminProduct, Brand, Gender } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { ImageUpload } from "./ImageUpload";

const TYPES = ["EDP", "EDT", "Parfum", "Extrait", "EDC"];

type FormState = {
  brand_id: string;
  name: string;
  category_id: string;
  type: string;
  olfactory_group: string;
  gender: Gender | "";
  longevity: string;
  top_notes: string;
  mid_notes: string;
  base_notes: string;
  description: string;
  image_url: string | null;
  is_active: boolean;
  is_new: boolean;
};

function toForm(p?: AdminProduct): FormState {
  return {
    brand_id: p ? String(p.brand_id) : "",
    name: p?.name ?? "",
    category_id: p?.category_id ? String(p.category_id) : "",
    type: p?.type ?? "",
    olfactory_group: p?.olfactory_group ?? "",
    gender: p?.gender ?? "",
    longevity: p?.longevity ?? "",
    top_notes: p?.top_notes ?? "",
    mid_notes: p?.mid_notes ?? "",
    base_notes: p?.base_notes ?? "",
    description: p?.description ?? "",
    image_url: p?.image_url ?? null,
    is_active: p?.is_active ?? true,
    is_new: p?.is_new ?? false,
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
  const categories = useApi<AdminCategory[]>("/admin/categories");
  const [form, setForm] = useState<FormState>(() => toForm(product));
  const category = categories.data?.find((c) => String(c.id) === form.category_id);
  // Concentration, olfactory group, longevity and notes are for perfumes. A product not placed
  // in the tree yet is one of the perfumes the shop started with.
  const perfume = category ? category.kind === "perfume" : !!product && !form.category_id;
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
    // A cosmetic has no perfume fields, even if they were typed before its section was chosen.
    const forPerfume = (s: string) => (perfume ? nullIfEmpty(s) : null);
    const body = {
      brand_id: Number(form.brand_id),
      name: form.name.trim(),
      category_id: form.category_id ? Number(form.category_id) : null,
      type: forPerfume(form.type),
      olfactory_group: forPerfume(form.olfactory_group),
      gender: form.gender || null,
      longevity: forPerfume(form.longevity),
      top_notes: forPerfume(form.top_notes),
      mid_notes: forPerfume(form.mid_notes),
      base_notes: forPerfume(form.base_notes),
      description: nullIfEmpty(form.description),
      image_url: form.image_url,
      is_active: form.is_active,
      is_new: form.is_new,
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
          <Field label="Категория" hint="Разделы и группы — в «Категориях»">
            <select
              className="input"
              required
              value={form.category_id}
              onChange={set("category_id")}
            >
              <option value="">— выберите —</option>
              {categories.data &&
                categoryOptions(categories.data).map((o) => (
                  <option key={o.id} value={o.id} className={o.depth === 0 ? "font-semibold" : ""}>
                    {o.label}
                  </option>
                ))}
            </select>
          </Field>
          {perfume && (
            <Field label="Тип (концентрация)">
              <input
                className="input"
                list="product-types"
                value={form.type}
                onChange={set("type")}
              />
              <datalist id="product-types">
                {TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          )}
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
          {perfume && (
            <>
              <Field label="Олфактивная группа">
                <input
                  className="input"
                  value={form.olfactory_group}
                  onChange={set("olfactory_group")}
                />
              </Field>
              <Field label="Стойкость">
                <input className="input" value={form.longevity} onChange={set("longevity")} />
              </Field>
            </>
          )}
        </div>
        {perfume && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Верхние ноты" hint="Через запятую">
              <textarea
                className="input min-h-20"
                value={form.top_notes}
                onChange={set("top_notes")}
              />
            </Field>
            <Field label="Ноты сердца">
              <textarea
                className="input min-h-20"
                value={form.mid_notes}
                onChange={set("mid_notes")}
              />
            </Field>
            <Field label="Базовые ноты">
              <textarea
                className="input min-h-20"
                value={form.base_notes}
                onChange={set("base_notes")}
              />
            </Field>
          </div>
        )}
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-gold"
            checked={form.is_new}
            onChange={(e) => setForm({ ...form, is_new: e.target.checked })}
          />
          Новинка — показывать в «Новых поступлениях» на главной
        </label>
        {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}
        <button className="btn btn-primary" disabled={busy}>
          {product ? "Сохранить изменения" : "Создать товар"}
        </button>
      </div>
    </form>
  );
}
