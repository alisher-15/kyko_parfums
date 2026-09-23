"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import { DropIcon } from "./icons";

const PALETTES = [
  "from-amber-100 to-rose-100",
  "from-stone-100 to-amber-50",
  "from-rose-50 to-violet-100",
  "from-emerald-50 to-sky-100",
  "from-orange-50 to-stone-200",
];

/** Product photo, or an elegant placeholder when the catalog has no photo yet. */
export function ProductImage({
  src,
  alt,
  seed,
  className = "",
}: {
  src: string | null | undefined;
  alt: string;
  seed: number;
  className?: string;
}) {
  if (src) {
    return (
      <img src={src} alt={alt} className={`h-full w-full object-contain ${className}`} />
    );
  }
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${
        PALETTES[seed % PALETTES.length]
      } ${className}`}
      role="img"
      aria-label={alt}
    >
      <DropIcon width={40} height={40} className="text-gold/60" />
    </div>
  );
}

export function Spinner({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-gold" />
      {label}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </div>
  );
}

export function SuccessBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <DropIcon width={32} height={32} className="text-gold" />
      <div className="font-serif text-2xl font-semibold">{title}</div>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const around = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const list = [...around].sort((a, b) => a - b);
  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1" aria-label="Страницы">
      <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ←
      </button>
      {list.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - list[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
          <button
            className={`btn btn-sm ${p === page ? "btn-primary" : "btn-outline"}`}
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        </span>
      ))}
      <button
        className="btn btn-outline btn-sm"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        →
      </button>
    </nav>
  );
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span>/</span>}
          {it.href ? (
            <Link href={it.href} className="hover:text-ink">
              {it.label}
            </Link>
          ) : (
            <span className="text-ink">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function QuantityInput({
  value,
  onChange,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  const clamp = (v: number) => Math.max(1, max !== undefined ? Math.min(v, Math.max(max, 1)) : v);
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-white">
      <button
        type="button"
        className="px-3 py-1.5 text-lg leading-none disabled:opacity-30"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= 1}
        aria-label="Меньше"
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 1))}
        className="w-12 [appearance:textfield] bg-transparent text-center text-sm outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        className="px-3 py-1.5 text-lg leading-none disabled:opacity-30"
        onClick={() => onChange(clamp(value + 1))}
        disabled={max !== undefined && value >= max}
        aria-label="Больше"
      >
        +
      </button>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
