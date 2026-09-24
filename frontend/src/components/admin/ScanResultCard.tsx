"use client";

import { useState } from "react";

export interface ScanQuantity {
  label: string;
  value: number;
  min?: number;
  max?: number;
  /** Save a new quantity; resolves to the quantity actually saved. */
  set: (value: number) => Promise<number>;
}

/** What a scan did, shown right after it (under the input or on the camera screen). */
export interface ScanResult {
  ok: boolean;
  /** Product name, or what went wrong. */
  title: string;
  detail?: string;
  /** The quantity the scan changed, with −/+ to correct it. */
  quantity?: ScanQuantity;
  /** Revert exactly what this scan did. */
  undo?: () => Promise<void>;
  /** A way out of a failed scan, e.g. attach an unknown barcode (closes the camera). */
  action?: { label: string; run: () => void };
}

export function ScanResultCard({
  result,
  dark = false,
  compact = false,
  onAction,
}: {
  result: ScanResult;
  dark?: boolean;
  compact?: boolean;
  onAction?: (action: NonNullable<ScanResult["action"]>) => void;
}) {
  const [qty, setQty] = useState(result.quantity?.value ?? 0);
  const [undone, setUndone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = result.quantity;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const tone = dark
    ? result.ok && !undone
      ? "bg-stone-800 text-white"
      : "bg-red-950 text-white"
    : result.ok && !undone
      ? "border border-emerald-200 bg-emerald-50 text-ink"
      : "border border-red-200 bg-red-50 text-ink";
  const stepBtn = `flex h-10 w-10 items-center justify-center rounded-full text-xl font-semibold disabled:opacity-40 ${
    dark ? "bg-white/15 active:bg-white/25" : "border border-line bg-white active:bg-cream"
  }`;

  return (
    <div className={`rounded-xl ${compact ? "p-2.5 text-xs" : "p-3 text-sm"} ${tone}`} role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            undone ? "bg-stone-500" : result.ok ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {undone ? "↺" : result.ok ? "✓" : "!"}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`font-semibold ${compact ? "" : "text-base"}`}>
            {undone ? `Отменено: ${result.title}` : result.title}
          </div>
          {result.detail && !undone && <div className="opacity-80">{result.detail}</div>}
        </div>
      </div>

      {q && !undone && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="opacity-80">{q.label}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={stepBtn}
              disabled={busy || qty <= (q.min ?? 0)}
              onClick={() => run(async () => setQty(await q.set(qty - 1)))}
              aria-label="Уменьшить количество"
            >
              −
            </button>
            <span className="w-10 text-center text-lg font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              className={stepBtn}
              disabled={busy || (q.max !== undefined && qty >= q.max)}
              onClick={() => run(async () => setQty(await q.set(qty + 1)))}
              aria-label="Увеличить количество"
            >
              +
            </button>
          </div>
        </div>
      )}

      {!undone && (result.undo || result.action) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {result.action && (
            <button
              type="button"
              className={`btn btn-sm ${dark ? "bg-white text-ink" : "btn-primary"}`}
              onClick={() => onAction?.(result.action!)}
            >
              {result.action.label}
            </button>
          )}
          {result.undo && (
            <button
              type="button"
              className="underline underline-offset-2 opacity-80 disabled:opacity-40"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await result.undo!();
                  setUndone(true);
                })
              }
            >
              Отменить этот скан
            </button>
          )}
        </div>
      )}
      {error && <div className={`mt-2 font-semibold ${dark ? "text-red-300" : "text-red-600"}`}>{error}</div>}
    </div>
  );
}
