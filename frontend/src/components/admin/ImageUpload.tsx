"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ProductImage } from "../ui";

type Uploaded = { url: string; normalized: boolean; note: string | null };

/**
 * Upload a photo to the backend (/admin/uploads) or paste an external URL.
 * kind="product" (default): the server makes a product photo a white 600×600 square with the
 * bottle at the shop's scale. kind="original": banners and logos, only made smaller.
 * minWidth: a picture narrower than this (px) gets a warning that it will look blurry.
 */
export function ImageUpload({
  value,
  onChange,
  seed = 0,
  compact = false,
  kind = "product",
  minWidth,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  seed?: number;
  compact?: boolean;
  kind?: "product" | "original";
  minWidth?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const width = useNaturalWidth(minWidth ? value : null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setNote(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await api<Uploaded>("/admin/uploads", { form, query: { kind } });
      onChange(res.url);
      if (kind === "product" && !res.normalized && res.note) setNote(`Фото не обработано: ${res.note}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      <div
        className={`overflow-hidden rounded-xl border border-line bg-white ${
          compact ? "h-10 w-10 shrink-0" : "aspect-square w-full max-w-56"
        }`}
      >
        <ProductImage src={value} alt="Фото" seed={seed} />
      </div>
      <div className={compact ? "flex items-center gap-1" : "flex flex-wrap items-center gap-2"}>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {busy ? "Загрузка…" : compact ? "Фото" : "Загрузить фото"}
        </button>
        {value && (
          <button type="button" className="text-xs text-muted hover:text-red-600" onClick={() => onChange(null)}>
            Убрать
          </button>
        )}
      </div>
      {!compact && (
        <input
          className="input"
          placeholder="или ссылка на изображение"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}
      {note && <div className="max-w-56 text-xs text-amber-700">{note}</div>}
      {minWidth && width !== null && width < minWidth && (
        <div className="text-xs text-amber-700">
          Картинка всего {width} px в ширину: на сайте её растянет, и она будет размытой. Нужна
          от {minWidth} px, лучше около 2400.
        </div>
      )}
    </div>
  );
}

/** The picture's real width in px, once it has loaded; null before that or without a picture. */
function useNaturalWidth(src: string | null): number | null {
  const [loaded, setLoaded] = useState<{ src: string; width: number } | null>(null);
  useEffect(() => {
    if (!src) return;
    const img = new window.Image();
    img.onload = () => setLoaded({ src, width: img.naturalWidth });
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);
  return loaded && loaded.src === src ? loaded.width : null;
}
