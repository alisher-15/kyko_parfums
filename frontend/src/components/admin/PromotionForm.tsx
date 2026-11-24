"use client";

import { useState, type FormEvent } from "react";
import { ErrorBox, Field, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { dayMonth, money, percentOff, volumeLabel } from "@/lib/format";
import type { AdminProduct, Brand, BrandBrief, Page, Promotion } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { CreativeMaker } from "./CreativeMaker";
import { ImageUpload } from "./ImageUpload";

type ProductChoice = { id: number; name: string; type: string | null; image_url: string | null; brand: BrandBrief };

type FormState = {
  title: string;
  description: string;
  image_url: string | null;
  image_only: boolean;
  discount: string;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
  scope: Scope;
  brands: BrandBrief[];
  products: ProductChoice[];
};

// One of three: a promotion on both brands and products would cover the whole brand,
// which is rarely what is meant ("Bvlgari Tygar" showing all of Bvlgari).
type Scope = "all" | "brands" | "products";

function scopeOf(p?: Promotion): Scope {
  if (p?.all_products) return "all";
  if (p?.brands.length && !p.products.length) return "brands";
  return "products";
}

function toForm(p?: Promotion): FormState {
  return {
    title: p?.title ?? "",
    description: p?.description ?? "",
    image_url: p?.image_url ?? null,
    image_only: p?.image_only ?? false,
    discount: p?.discount_percent != null ? String(p.discount_percent) : "",
    starts_on: p?.starts_on ?? "",
    ends_on: p?.ends_on ?? "",
    is_active: p?.is_active ?? true,
    scope: scopeOf(p),
    brands: p?.brands ?? [],
    products: p?.products ?? [],
  };
}

/**
 * A promotion: the banner on the home page and, with a percent, a discount off the retail
 * price of what it covers. Wholesale customers pay the lower of their price and the promotion's.
 */
export function PromotionForm({
  promotion,
  onSaved,
}: {
  promotion?: Promotion;
  onSaved: (p: Promotion) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(promotion));
  // The banner maker under the form, filled from it.
  const [making, setMaking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      image_url: form.image_url,
      image_only: form.image_only,
      discount_percent: form.discount.trim() ? Number(form.discount.replace(",", ".")) : null,
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      is_active: form.is_active,
      all_products: form.scope === "all",
      brand_ids: form.scope === "brands" ? form.brands.map((b) => b.id) : [],
      product_ids: form.scope === "products" ? form.products.map((p) => p.id) : [],
    };
    try {
      const saved = promotion
        ? await api<Promotion>(`/admin/promotions/${promotion.id}`, { method: "PUT", body })
        : await api<Promotion>("/admin/promotions", { body });
      setMsg({ ok: true, text: "Сохранено" });
      onSaved(saved);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card grid gap-6 p-6 lg:grid-cols-[280px_1fr]">
      <div>
        <span className="label">Баннер</span>
        <ImageUpload
          kind="original"
          minWidth={600}
          aspect={{ ratio: 3 / 2, label: "3:2" }}
          value={form.image_url}
          onChange={(url) => setForm({ ...form, image_url: url })}
          seed={promotion?.id ?? 0}
        />
        {form.image_url && (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-gold"
              checked={form.image_only}
              onChange={(e) => setForm({ ...form, image_only: e.target.checked })}
            />
            <span>
              Готовый баннер: текст уже на картинке
              <span className="block text-xs text-muted">
                Сайт покажет картинку целиком, без своего названия, дат и скидки поверх неё.
              </span>
            </span>
          </label>
        )}
        <button
          type="button"
          className="btn btn-outline btn-sm mt-3"
          aria-expanded={making}
          onClick={() => setMaking(!making)}
        >
          {making ? "Скрыть шаблоны" : "Сделать по шаблону"}
        </button>
        <p className="mt-2 text-xs text-muted">
          {form.image_url && form.image_only
            ? "Баннер — карточка 3:2 в ленте акций вверху главной, на телефоне их видно две с небольшим: картинка 1200×800 заполнит её целиком, без обрезки и полос. Карточка небольшая, поэтому пишите на картинке главное и крупно."
            : "Баннер — карточка 3:2 в ленте акций вверху главной: лучше всего картинка 1200×800. Сайт пишет поверх неё скидку, дату окончания и название, поэтому оставьте внизу место под текст. Без картинки карточка будет тёмной с текстом."}
        </p>
      </div>
      <div className="min-w-0 space-y-4">
        <Field label="Название">
          <input
            className="input"
            required
            placeholder="Осенняя распродажа"
            value={form.title}
            onChange={set("title")}
          />
        </Field>
        <Field label="Текст на баннере">
          <textarea
            className="input min-h-20"
            placeholder="Скидка на ароматы Chanel до конца месяца"
            value={form.description}
            onChange={set("description")}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Скидка, %" hint="Пусто — только баннер, цены не меняются">
            <input
              className="input"
              inputMode="decimal"
              placeholder="15"
              value={form.discount}
              onChange={(e) => setForm({ ...form, discount: e.target.value.replace(/[^\d.,]/g, "") })}
            />
          </Field>
          <Field label="Начало" hint="Пусто — сразу">
            <input className="input min-w-0" type="date" value={form.starts_on} onChange={set("starts_on")} />
          </Field>
          <Field label="Конец (включительно)" hint="Пусто — пока не выключите">
            <input className="input min-w-0" type="date" value={form.ends_on} onChange={set("ends_on")} />
          </Field>
        </div>
        <p className="text-xs text-muted">
          Скидка считается от розничной цены и округляется до целых. Оптовики платят меньшую из двух
          цен: свою оптовую или акционную. Скидки акций не суммируются между собой и со скидкой на
          кассе — действует большая.
        </p>

        <div>
          <span className="label">На что действует</span>
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["all", "Весь каталог"],
                ["brands", "Бренды целиком"],
                ["products", "Отдельные товары"],
              ] as [Scope, string][]
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="promotion-scope"
                  className="accent-gold"
                  checked={form.scope === value}
                  onChange={() => setForm({ ...form, scope: value })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        {promotion && promotion.brands.length > 0 && promotion.products.length > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Сейчас у акции выбраны и бренды ({promotion.brands.map((b) => b.name).join(", ")}), и
            товары, поэтому она действует на бренды целиком. Оставьте что-то одно и сохраните.
          </p>
        )}
        {form.scope === "brands" && (
          <BrandPicker
            selected={form.brands}
            onChange={(brands) => setForm({ ...form, brands })}
          />
        )}
        {form.scope === "products" && (
          <ProductPicker
            selected={form.products}
            onChange={(products) => setForm({ ...form, products })}
          />
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-gold"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Включена
        </label>
        {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}
        <button className="btn btn-primary" disabled={busy}>
          {promotion ? "Сохранить акцию" : "Создать акцию"}
        </button>
      </div>
      {making && (
        <div className="border-t border-line pt-6 lg:col-span-2">
          <h3 className="mb-1 font-serif text-xl font-semibold">Баннер по шаблону</h3>
          <p className="mb-4 text-sm text-muted">
            Заголовок, скидка, дата и товары взяты из акции — поправьте и поставьте баннер. Текст будет
            на картинке, поэтому у акции включится «Готовый баннер».
          </p>
          <CreativeMaker
            lockFormat
            initial={{
              format: "banner",
              title: form.title,
              subtitle: form.description.slice(0, 160),
              badge: form.discount.trim() ? percentOff(Number(form.discount.replace(",", "."))) : "",
              note: form.ends_on ? `до ${dayMonth(form.ends_on)}` : "",
              products: form.scope === "products" ? form.products.slice(0, 3) : [],
            }}
            onUse={(url) => {
              setForm({ ...form, image_url: url, image_only: true });
              setMaking(false);
            }}
          />
        </div>
      )}
    </form>
  );
}

function BrandPicker({
  selected,
  onChange,
}: {
  selected: BrandBrief[];
  onChange: (brands: BrandBrief[]) => void;
}) {
  const brands = useApi<Brand[]>("/admin/brands");
  const [search, setSearch] = useState("");
  const ids = new Set(selected.map((b) => b.id));
  const shown = (brands.data ?? []).filter((b) =>
    b.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const toggle = (b: BrandBrief) =>
    onChange(ids.has(b.id) ? selected.filter((x) => x.id !== b.id) : [...selected, { id: b.id, name: b.name }]);
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 text-sm font-semibold">Бренды{selected.length ? ` · ${selected.length}` : ""}</div>
      <input
        className="input mb-2"
        placeholder="Найти бренд"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-56 overflow-y-auto pr-1">
        {shown.map((b) => (
          <label key={b.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              className="accent-gold"
              checked={ids.has(b.id)}
              onChange={() => toggle(b)}
            />
            {b.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function ProductPicker({
  selected,
  onChange,
}: {
  selected: ProductChoice[];
  onChange: (products: ProductChoice[]) => void;
}) {
  const [search, setSearch] = useState("");
  const found = useApi<Page<AdminProduct>>(search.trim().length >= 2 ? "/admin/products" : null, {
    query: { q: search.trim(), page_size: 10 },
  });
  const ids = new Set(selected.map((p) => p.id));
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 text-sm font-semibold">Товары{selected.length ? ` · ${selected.length}` : ""}</div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span key={p.id} className="chip gap-1">
              {p.brand.name} {p.name}
              {p.type && <span className="text-muted">· {p.type}</span>}
              <button
                type="button"
                className="text-muted hover:text-red-600"
                aria-label={`Убрать ${p.name}`}
                onClick={() => onChange(selected.filter((x) => x.id !== p.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="input"
        placeholder="Найти товар: название или бренд"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {found.data && (
        <div className="mt-1 max-h-80 overflow-y-auto">
          {found.data.items.length === 0 && <p className="py-2 text-sm text-muted">Ничего не найдено</p>}
          {found.data.items.map((p) => (
            <ProductOption
              key={p.id}
              product={p}
              added={ids.has(p.id)}
              onAdd={() =>
                onChange([...selected, { id: p.id, name: p.name, type: p.type, image_url: p.image_url, brand: p.brand }])
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A found product as a small card: products of one name (an EDP and an Extrait, a bottle and a
 * set) differ by their type, volumes and price, so all of them are shown.
 */
function ProductOption({ product: p, added, onAdd }: { product: AdminProduct; added: boolean; onAdd: () => void }) {
  const volumes = [...p.variants].sort((a, b) => a.volume_ml - b.volume_ml || Number(a.is_tester) - Number(b.is_tester));
  const prices = volumes.map((v) => v.retail_price);
  const photo = p.image_url ?? volumes.find((v) => v.photo_url)?.photo_url ?? null;
  return (
    <button
      type="button"
      disabled={added}
      onClick={onAdd}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-cream disabled:opacity-50"
    >
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
        {photo && <img src={photo} alt="" className="h-full w-full object-contain" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span>
            <span className="text-muted">{p.brand.name}</span> {p.name}
          </span>
          {p.type && <span className="chip px-1.5 py-0 text-[11px]">{p.type}</span>}
          {!p.is_active && <span className="text-[11px] text-red-600">скрыт</span>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {volumes.length
            ? `${volumes.map((v) => volumeLabel(v.volume_ml, v.is_tester)).join(" · ")} · от ${money(Math.min(...prices))}`
            : "нет объёмов"}
        </span>
      </span>
      <span className="shrink-0 text-xs text-gold">{added ? "добавлен" : "+ добавить"}</span>
    </button>
  );
}
