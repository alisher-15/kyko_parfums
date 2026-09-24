"use client";

import { useEffect, useState } from "react";
import { ProductImage } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { VariantSearchItem } from "@/lib/types";

/** Search a volume by name, brand, SKU or barcode and pick it from the list. */
export function VariantPicker({
  onPick,
  placeholder = "Название или бренд",
  autoFocus = false,
}: {
  onPick: (item: VariantSearchItem) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<VariantSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!term) {
        setResults([]);
        return;
      }
      api<VariantSearchItem[]>("/admin/store/variants", { query: { q: term } })
        .then((r) => {
          if (!cancelled) {
            setResults(r);
            setError(null);
          }
        })
        .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  return (
    <div>
      <input
        autoFocus={autoFocus}
        className="input"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {q.trim() && results.length === 0 && !error && (
        <p className="mt-2 text-sm text-muted">Ничего не найдено</p>
      )}
      {results.length > 0 && (
        <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white">
          {results.map((r) => (
            <li key={r.variant_id}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQ("");
                  setResults([]);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-cream"
              >
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-white">
                  <ProductImage src={r.image_url} alt={r.product_name} seed={r.product_id} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {r.brand_name} {r.product_name}, {r.volume_ml} мл
                  </div>
                  <div className="text-xs text-muted">
                    {r.stock} шт. на складе{r.sku ? ` · ${r.sku}` : ""}
                  </div>
                </div>
                <div className="text-right text-xs text-muted">{money(r.retail_price)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
