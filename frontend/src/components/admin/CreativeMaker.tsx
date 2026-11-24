"use client";

import { useEffect, useMemo, useState } from "react";
import { ErrorBox } from "@/components/ui";
import { api } from "@/lib/api";
import type { AdminProduct, BrandBrief, CreativeOut, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export type CreativeFormat = "banner" | "story";
export type CreativeTheme = "dark" | "light" | "gold";
type Chosen = { id: number; name: string; type: string | null; brand: BrandBrief };

export interface CreativeDraft {
  format: CreativeFormat;
  theme: CreativeTheme;
  title: string;
  subtitle: string;
  badge: string;
  note: string;
  products: Chosen[];
}

const FORMATS: { value: CreativeFormat; label: string; hint: string }[] = [
  { value: "banner", label: "Баннер 1200×800", hint: "карточка акции на главной" },
  { value: "story", label: "Сторис 1080×1920", hint: "Instagram, WhatsApp-статус" },
];
const THEMES: { value: CreativeTheme; label: string; swatch: string }[] = [
  { value: "dark", label: "Тёмный", swatch: "#1c1917" },
  { value: "light", label: "Светлый", swatch: "#faf8f5" },
  { value: "gold", label: "Золотой", swatch: "#f3ebe1" },
];
const MAX_PRODUCTS = 3;

/**
 * A banner or a story drawn from the shop's templates (POST /admin/creatives/render): the
 * title, the badge, the date and up to three real bottles of the catalog. The preview redraws a
 * moment after a change; «Скачать» saves it, and with `onUse` (the promotion form) the banner
 * is stored and becomes the promotion's picture.
 */
export function CreativeMaker({
  initial,
  onUse,
  lockFormat = false,
}: {
  initial?: Partial<CreativeDraft>;
  onUse?: (url: string) => void;
  lockFormat?: boolean;
}) {
  const [draft, setDraft] = useState<CreativeDraft>({
    format: "banner",
    theme: "dark",
    title: "",
    subtitle: "",
    badge: "",
    note: "",
    products: [],
    ...initial,
  });
  const [preview, setPreview] = useState<{ key: string; src: string; missing: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const body = {
    format: draft.format,
    theme: draft.theme,
    title: draft.title.trim(),
    subtitle: draft.subtitle,
    badge: draft.badge,
    note: draft.note,
    product_ids: draft.products.map((p) => p.id),
  };
  const key = JSON.stringify(body);

  // Redraw a moment after the last change.
  useEffect(() => {
    if (!body.title) return;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const r = await api<CreativeOut>("/admin/creatives/render", { body: JSON.parse(key) });
        if (!stale) {
          setPreview({ key, src: r.preview ?? "", missing: r.missing_photos });
          setError(null);
        }
      } catch (e) {
        if (!stale) setError(e instanceof Error ? e.message : String(e));
      }
    }, 500);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // body.title is part of key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = <K extends keyof CreativeDraft>(k: K, v: CreativeDraft[K]) => setDraft({ ...draft, [k]: v });
  const fresh = preview?.key === key;
  const fileName = `kyko-${draft.format === "banner" ? "banner" : "story"}.jpg`;

  // Phones get the system share sheet («Сохранить изображение» to Photos, Instagram, WhatsApp):
  // iPhone Safari won't save a data: link («Загрузить» does nothing). Computers download a file.
  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  // Made ahead, not on the tap: Safari opens the share sheet only straight from the tap.
  const src = preview?.src ?? "";
  const file = useMemo(() => (src ? jpegFile(src, fileName) : null), [src, fileName]);
  const save = async () => {
    if (!file) return;
    setError(null);
    if (touch && canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: draft.title });
      } catch (e) {
        // Closing the sheet is not an error.
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const use = async () => {
    if (!onUse) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api<CreativeOut>("/admin/creatives/render", { body, query: { save: true } });
      if (r.url) onUse(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="creative-maker">
      <div className="min-w-0 space-y-4">
        {!lockFormat && (
          <div>
            <span className="label">Формат</span>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => set("format", f.value)}
                  aria-pressed={draft.format === f.value}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${
                    draft.format === f.value ? "border-ink bg-ink text-white" : "border-line bg-white"
                  }`}
                >
                  <span className="block font-semibold">{f.label}</span>
                  <span className={`text-xs ${draft.format === f.value ? "text-stone-300" : "text-muted"}`}>
                    {f.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <span className="label">Оформление</span>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => set("theme", t.value)}
                aria-pressed={draft.theme === t.value}
                className={`chip gap-2 ${draft.theme === t.value ? "border-ink ring-2 ring-ink/20" : ""}`}
              >
                <span className="h-4 w-4 rounded-full border border-line" style={{ background: t.swatch }} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="label">Заголовок</span>
          <input
            className="input"
            maxLength={80}
            placeholder="Новогодняя неделя Tom Ford"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Подзаголовок</span>
          <input
            className="input"
            maxLength={160}
            placeholder="Скидка на культовые ароматы к праздникам"
            value={draft.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
          />
        </label>
        <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-3">
          <label className="block">
            <span className="label">Плашка</span>
            <input
              className="input"
              maxLength={16}
              placeholder="−15%"
              value={draft.badge}
              onChange={(e) => set("badge", e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">Рядом с плашкой</span>
            <input
              className="input"
              maxLength={40}
              placeholder="до 31 декабря"
              value={draft.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </label>
        </div>
        <ProductChooser selected={draft.products} onChange={(products) => set("products", products)} />
      </div>

      <div className="min-w-0 space-y-3">
        <span className="label">Превью</span>
        <div
          className={`relative overflow-hidden rounded-2xl border border-line bg-stone-100 ${
            draft.format === "banner" ? "aspect-[3/2]" : "mx-auto aspect-[9/16] max-h-[640px]"
          }`}
        >
          {preview?.src ? (
            <img
              src={preview.src}
              alt="Превью"
              data-testid="creative-preview"
              className={`h-full w-full object-contain transition ${fresh ? "" : "opacity-60"}`}
            />
          ) : (
            <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
              Напишите заголовок — превью появится здесь
            </p>
          )}
        </div>
        {preview && preview.missing.length > 0 && (
          <p className="text-xs text-amber-800">
            У части товаров не нашлось фото — их место осталось пустым.
          </p>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex flex-wrap gap-2">
          {preview?.src && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void save()}>
              {touch && canShare ? "Сохранить или поделиться" : "Скачать JPG"}
            </button>
          )}
          {onUse && draft.format === "banner" && (
            <button
              type="button"
              className="btn btn-gold btn-sm"
              disabled={!fresh || saving}
              onClick={() => void use()}
            >
              {saving ? "Сохраняем…" : "Поставить баннером акции"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A data:image/jpeg;base64 preview as a file to share or download. */
function jpegFile(dataUrl: string, name: string): File {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: "image/jpeg" });
}

/** Up to three products for the picture, found by name or brand. */
function ProductChooser({ selected, onChange }: { selected: Chosen[]; onChange: (p: Chosen[]) => void }) {
  const [search, setSearch] = useState("");
  const found = useApi<Page<AdminProduct>>(search.trim().length >= 2 ? "/admin/products" : null, {
    query: { q: search.trim(), page_size: 8 },
  });
  const ids = new Set(selected.map((p) => p.id));
  const full = selected.length >= MAX_PRODUCTS;
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 text-sm font-semibold">
        Флаконы на картинке · {selected.length} из {MAX_PRODUCTS}
      </div>
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
        placeholder={full ? "Уже три флакона — уберите один, чтобы добавить" : "Найти товар: название или бренд"}
        disabled={full}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {found.data && !full && search.trim().length >= 2 && (
        <div className="mt-1 max-h-64 overflow-y-auto">
          {found.data.items.length === 0 && <p className="py-2 text-sm text-muted">Ничего не найдено</p>}
          {found.data.items.map((p) => {
            const photo = p.image_url ?? p.variants.find((v) => v.photo_url)?.photo_url ?? null;
            return (
              <button
                key={p.id}
                type="button"
                disabled={ids.has(p.id)}
                onClick={() => {
                  onChange([...selected, { id: p.id, name: p.name, type: p.type, brand: p.brand }]);
                  setSearch("");
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-cream disabled:opacity-50"
              >
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
                  {photo && <img src={photo} alt="" className="h-full w-full object-contain" />}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-muted">{p.brand.name}</span> {p.name}
                  {p.type && <span className="text-muted"> · {p.type}</span>}
                  {!photo && <span className="text-amber-800"> · нет фото</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
