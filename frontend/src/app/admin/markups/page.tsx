"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ErrorBox, Field, Spinner, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { BrandMarkup, MarkupLevels, Markups, RepriceReport } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const LEVELS: { key: keyof MarkupLevels; label: string }[] = [
  { key: "retail", label: "Розница" },
  { key: "wholesale", label: "Опт" },
  { key: "bulk", label: "Крупный опт" },
];

// A brand's addition: 0–100% in steps of 10.
const STEPS = Array.from({ length: 11 }, (_, i) => i * 10);

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function MarkupsPage() {
  const { data, error, reload } = useApi<Markups>("/admin/markups");
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!data) return <Spinner />;
  // A check made before the markups changed is out of date: start it over.
  const version = JSON.stringify([data.base, data.brands.map((b) => [b.retail, b.wholesale, b.bulk])]);
  return (
    <div className="max-w-5xl space-y-6">
      <AdminHeader title="Наценки" />
      <p className="text-sm text-muted">
        Цена = себестоимость × (1 + базовая наценка + надбавка бренда), с округлением вверх до 100 ₸:
        себестоимость 10 000 ₸ с наценкой 30% даёт 13 000 ₸. Цены на сайте меняются только после
        «Пересчитать цены». Объёмы с отметкой «Цена вручную» и без себестоимости пересчёт не трогает.
      </p>
      <BaseCard base={data.base} onSaved={reload} />
      <RecalcCard key={version} brands={data.brands} />
      <BrandsCard base={data.base} brands={data.brands} onSaved={reload} />
    </div>
  );
}

function BaseCard({ base, onSaved }: { base: MarkupLevels; onSaved: () => void }) {
  const [form, setForm] = useState({
    retail: String(base.retail),
    wholesale: String(base.wholesale),
    bulk: String(base.bulk),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      await api("/admin/markups/base", {
        method: "PUT",
        body: {
          retail: Number(form.retail || 0),
          wholesale: Number(form.wholesale || 0),
          bulk: Number(form.bulk || 0),
        },
      });
      setMsg({ ok: true, text: "Базовая наценка сохранена. Цены изменятся после пересчёта." });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Базовая наценка</h2>
        <p className="text-sm text-muted">Для всех брендов, к ней прибавляется надбавка бренда.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {LEVELS.map(({ key, label }) => (
          <Field key={key} label={`${label}, %`}>
            <input
              className="input"
              inputMode="numeric"
              required
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
        ))}
      </div>
      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}
      <button className="btn btn-primary" disabled={busy}>
        Сохранить
      </button>
    </form>
  );
}

function RecalcCard({ brands }: { brands: BrandMarkup[] }) {
  const [brandId, setBrandId] = useState("");
  const [report, setReport] = useState<RepriceReport | null>(null);
  const [applied, setApplied] = useState<RepriceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<RepriceReport>("/admin/markups/recalculate", {
        method: "POST",
        query: { dry_run: dryRun, brand_id: brandId || undefined },
      });
      setReport(dryRun ? r : null);
      setApplied(dryRun ? null : r);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Пересчитать цены</h2>
        <p className="text-sm text-muted">
          Сначала проверьте, что изменится, потом примените. Пересчёт берёт текущую себестоимость:
          после приёмок она могла сдвинуться.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          className="input w-auto max-w-full"
          aria-label="Какие товары"
          value={brandId}
          onChange={(e) => {
            setBrandId(e.target.value);
            setReport(null);
            setApplied(null);
          }}
        >
          <option value="">Все бренды</option>
          {brands
            .filter((b) => b.product_count > 0)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(true)}>
          Проверить
        </button>
        {report && report.changed > 0 && (
          <button
            type="button"
            className="btn btn-gold"
            disabled={busy}
            onClick={() => confirm(`Изменить цены у ${report.changed} объёмов?`) && run(false)}
          >
            Применить
          </button>
        )}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {applied && <SuccessBox>Цены обновлены у {applied.changed} объёмов.</SuccessBox>}
      {report && <ReportView report={report} />}
    </div>
  );
}

function ReportView({ report }: { report: RepriceReport }) {
  const kept = `уже по наценке ${report.unchanged}, «Цена вручную» ${report.locked}, без себестоимости ${report.no_cost}`;
  if (report.changed === 0)
    return <SuccessBox>Все цены уже посчитаны по наценкам. Не меняются: {kept}.</SuccessBox>;
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-cream/60 p-3 text-sm">
        Изменятся цены у <b>{report.changed}</b> объёмов: розница дороже у {report.raised}, дешевле
        у {report.lowered}. Не меняются: {kept}.
        {report.lines.length < report.changed &&
          ` Ниже ${report.lines.length} самых больших изменений розничной цены.`}
      </div>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Товар</th>
              <th>Себестоимость</th>
              <th>Розница</th>
              <th>Опт</th>
              <th>Крупный опт</th>
            </tr>
          </thead>
          <tbody>
            {report.lines.map((l) => (
              <tr key={l.variant_id}>
                <td>
                  <Link href={`/admin/products/${l.product_id}`} className="hover:text-gold">
                    {l.label}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{money(l.cost_price)}</td>
                <PriceChange from={l.old_retail} to={l.retail} />
                <PriceChange from={l.old_wholesale} to={l.wholesale} />
                <PriceChange from={l.old_bulk} to={l.bulk} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceChange({ from, to }: { from: number | null; to: number }) {
  if (from === to) return <td className="whitespace-nowrap text-muted">{money(to)}</td>;
  return (
    <td className="whitespace-nowrap">
      <span className="text-muted">{money(from)} → </span>
      <b className={from !== null && to < from ? "text-emerald-700" : ""}>{money(to)}</b>
    </td>
  );
}

function BrandsCard({
  base,
  brands,
  onSaved,
}: {
  base: MarkupLevels;
  brands: BrandMarkup[];
  onSaved: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [onlyAdded, setOnlyAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = filter.trim().toLowerCase();
  const shown = brands.filter(
    (b) => b.name.toLowerCase().includes(q) && (!onlyAdded || b.retail || b.wholesale || b.bulk),
  );

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Надбавки брендов</h2>
        <p className="text-sm text-muted">
          Сколько процентов бренд добавляет к базовой наценке. Опт не может выйти дороже розницы, а
          крупный опт дороже опта.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Найти бренд"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-gold"
            checked={onlyAdded}
            onChange={(e) => setOnlyAdded(e.target.checked)}
          />
          Только с надбавкой
        </label>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Бренд</th>
              {LEVELS.map(({ key, label }) => (
                <th key={key}>
                  {label} <span className="font-normal normal-case">(база {base[key]}%)</span>
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <BrandRow
                key={`${b.id}:${b.retail}:${b.wholesale}:${b.bulk}`}
                base={base}
                brand={b}
                onSaved={onSaved}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="py-4 text-sm text-muted">Брендов не найдено.</p>}
      </div>
    </div>
  );
}

function BrandRow({
  base,
  brand,
  onSaved,
  onError,
}: {
  base: MarkupLevels;
  brand: BrandMarkup;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [levels, setLevels] = useState<MarkupLevels>({
    retail: brand.retail,
    wholesale: brand.wholesale,
    bulk: brand.bulk,
  });
  const [busy, setBusy] = useState(false);
  const dirty = LEVELS.some(({ key }) => levels[key] !== brand[key]);

  const save = async () => {
    setBusy(true);
    onError(null);
    try {
      await api(`/admin/markups/brands/${brand.id}`, { method: "PUT", body: levels });
      onSaved();
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td>
        <Link href={`/admin/products?brand_id=${brand.id}`} className="hover:text-gold">
          {brand.name}
        </Link>
        <span className="ml-1 text-xs text-muted">· {brand.product_count}</span>
      </td>
      {LEVELS.map(({ key, label }) => (
        <td key={key} className="whitespace-nowrap">
          <select
            className="input w-auto"
            aria-label={`${brand.name}: ${label}`}
            value={levels[key]}
            onChange={(e) => setLevels({ ...levels, [key]: Number(e.target.value) })}
          >
            {(STEPS.includes(levels[key]) ? STEPS : [...STEPS, levels[key]].sort((a, b) => a - b)).map(
              (step) => (
                <option key={step} value={step}>
                  +{step}%
                </option>
              ),
            )}
          </select>
          <span className="ml-2 text-xs text-muted">= {base[key] + levels[key]}%</span>
        </td>
      ))}
      <td>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={save}>
          Сохранить
        </button>
      </td>
    </tr>
  );
}
