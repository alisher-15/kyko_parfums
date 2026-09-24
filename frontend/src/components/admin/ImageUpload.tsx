"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { ProductImage } from "../ui";

/** Upload a photo to the backend (/admin/uploads) or paste an external URL. */
export function ImageUpload({
  value,
  onChange,
  seed = 0,
  compact = false,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  seed?: number;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await api<{ url: string }>("/admin/uploads", { form });
      onChange(res.url);
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
    </div>
  );
}
