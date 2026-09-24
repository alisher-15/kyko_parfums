"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { ScanField, type ScanResult } from "./ScanField";

/** Barcodes of one volume: remove with ×, add by scanning or typing. */
export function BarcodeList({
  variantId,
  barcodes,
  onChanged,
}: {
  variantId: number;
  barcodes: string[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const add = async (code: string): Promise<ScanResult> => {
    await api(`/admin/variants/${variantId}/barcodes`, { body: { code } });
    onChanged();
    return { ok: true, text: `Штрихкод ${code} добавлен` };
  };

  const remove = async (code: string) => {
    setError(null);
    try {
      await api(`/admin/variants/${variantId}/barcodes/${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-w-0 flex-1 basis-64">
      <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">
        Штрихкоды
      </span>
      {barcodes.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {barcodes.map((code) => (
            <span key={code} className="chip gap-1 font-mono text-xs">
              {code}
              <button
                type="button"
                className="text-muted hover:text-red-600"
                onClick={() => remove(code)}
                aria-label={`Удалить штрихкод ${code}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <ScanField
        compact
        autoFocus={false}
        onScan={add}
        placeholder="Отсканируйте или введите штрихкод"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
