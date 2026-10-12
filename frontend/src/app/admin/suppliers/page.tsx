"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { VariantPicker } from "@/components/admin/VariantPicker";
import { ErrorBox, Spinner, SuccessBox } from "@/components/ui";
import { api, downloadFile } from "@/lib/api";
import { dateTime, money, plural } from "@/lib/format";
import type {
  LinksReport,
  PriceChangeLine,
  PriceFormat,
  PriceListReport,
  Supplier,
  UnmatchedLine,
} from "@/lib/types";
import { useApi } from "@/lib/use-api";

const FORMATS: Record<PriceFormat, string> = {
  usd_1c: "Прайс-лист 1С: цена в долларах и «ОПТ,ЦЕНА» в тенге",
  barcode_kzt: "Прайс со штрихкодами: «ОПТ» в тенге",
};

// How many unmatched lines and changes to show before «Показать все».
const SHOWN = 30;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const volumes = (n: number) => `${n} ${plural(n, "объёма", "объёмов", "объёмов")}`;

// Words of a price list line that say nothing about which perfume it is.
const NOISE = new Set(
  "edp edt edc eau de parfum parfume perfume extrait tester test new pour homme femme men women for spray ml m w l u".split(" "),
);

/** A search to start linking a line with: its first two words, without volume, type and notes. */
function guess(line: string): string {
  return line
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+([.,]\d+)?\s*(ml|мл|g)?\b/gi, " ")
    .replace(/[^\p{L}\p{N}&' -]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w.toLowerCase()))
    .slice(0, 2)
    .join(" ");
}

export default function SuppliersPage() {
  const { data, error, reload } = useApi<Supplier[]>("/admin/suppliers");
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!data) return <Spinner />;
  return (
    <div className="max-w-5xl space-y-6">
      <AdminHeader title="Поставщики" />
      <p className="text-sm text-muted">
        Себестоимость объёма — цена основного поставщика, а если у него этого товара нет — цена
        другого. Когда прайс меняет себестоимость, цены продажи считаются по наценкам объёма
        (себестоимость × наценка, вверх до 100{" "}₸) и никогда не снижаются: если выходит
        ниже, остаётся прежняя цена. Сначала сайт показывает, что изменится, а применяет только по
        кнопке.
      </p>
      {data.map((s) => (
        <SupplierCard key={s.id} supplier={s} onChanged={reload} />
      ))}
    </div>
  );
}

function SupplierCard({ supplier, onChanged }: { supplier: Supplier; onChanged: () => void }) {
  const priceInput = useRef<HTMLInputElement>(null);
  const linksInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<PriceListReport | null>(null);
  const [linksReport, setLinksReport] = useState<LinksReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const last = supplier.last_list;

  const send = (f: File, dryRun: boolean) => {
    const form = new FormData();
    form.append("file", f);
    return api<PriceListReport>(`/admin/suppliers/${supplier.id}/price-list`, {
      form,
      query: { dry_run: dryRun },
    });
  };

  const check = async (f: File) => {
    setBusy(true);
    setError(null);
    try {
      setReport(await send(f, true));
    } catch (err) {
      setReport(null);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!file || !report) return;
    if (!confirm(`Загрузить прайс «${file.name}»? Цены изменятся у ${volumes(report.prices_raised)}.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await send(file, false);
      setReport(null);
      setFile(null);
      setNotice(
        `Прайс «${file.name}» загружен: сопоставлено ${r.matched} из ${r.lines} строк, ` +
          `цены выросли у ${volumes(r.prices_raised)}.`,
      );
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const link = async (line: string, variantId: number | null) => {
    await api(`/admin/suppliers/${supplier.id}/links`, { body: { line, variant_id: variantId } });
    onChanged();
    if (file) await check(file);
  };

  const importLinks = async (f: File) => {
    setBusy(true);
    setError(null);
    setLinksReport(null);
    const form = new FormData();
    form.append("file", f);
    try {
      setLinksReport(await api<LinksReport>(`/admin/suppliers/${supplier.id}/links/import`, { form }));
      onChanged();
      if (file) await check(file);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold">
            {supplier.name}
            {supplier.is_main && (
              <span className="ml-2 align-middle text-xs font-normal text-gold">основной</span>
            )}
          </h2>
          <p className="text-sm text-muted">{FORMATS[supplier.price_format]}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => priceInput.current?.click()}
        >
          Загрузить прайс
        </button>
        <input
          ref={priceInput}
          type="file"
          accept=".xlsx,.xlsm,.csv"
          className="hidden"
          aria-label={`Прайс ${supplier.name}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setFile(f);
            setNotice(null);
            void check(f);
          }}
        />
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted">Цены у товаров</div>
          {volumes(supplier.prices)}
        </div>
        <div>
          <div className="text-xs text-muted">Строк прайса привязано</div>
          {supplier.links}
          {supplier.ignored > 0 && <span className="text-muted"> · не наш товар: {supplier.ignored}</span>}
        </div>
        <div>
          <div className="text-xs text-muted">Последний прайс</div>
          {last ? (
            <>
              {last.file_name} · {dateTime(last.uploaded_at)}
              <div className="text-xs text-muted">
                сопоставлено {last.matched} из {last.lines}
              </div>
            </>
          ) : (
            "ещё не загружали"
          )}
        </div>
      </div>

      {notice && <SuccessBox>{notice}</SuccessBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && !report && <Spinner label="Читаю прайс…" />}
      {report && file && (
        <ReportView
          report={report}
          fileName={file.name}
          busy={busy}
          onApply={apply}
          onCancel={() => {
            setReport(null);
            setFile(null);
          }}
          onLink={link}
        />
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <div className="text-sm font-semibold">Сопоставление строк прайса с товарами</div>
        <p className="text-xs text-muted">
          Сайт запоминает, какой товар какой строке прайса соответствует: строки находятся по
          тексту, у прайса со штрихкодами — ещё и по штрихкоду. Сопоставление можно скачать,
          поправить в Excel и загрузить обратно.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() =>
              downloadFile(`/admin/suppliers/${supplier.id}/links/export`, `сопоставление_${supplier.name}.xlsx`)
            }
          >
            Скачать сопоставление
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy}
            onClick={() => linksInput.current?.click()}
          >
            Загрузить сопоставление
          </button>
          <input
            ref={linksInput}
            type="file"
            accept=".xlsx,.xlsm,.csv"
            className="hidden"
            aria-label={`Сопоставление ${supplier.name}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importLinks(f);
            }}
          />
        </div>
        {linksReport && (
          <div className="rounded-lg bg-cream/60 p-3 text-sm">
            Строк: {linksReport.rows}, привязано: {linksReport.linked}, не наш товар:{" "}
            {linksReport.ignored}.
            {linksReport.problems.length > 0 && (
              <>
                {" "}
                Не получилось: {linksReport.problems.length}.
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                  {linksReport.problems.map((p) => (
                    <li key={p.row}>
                      Строка {p.row}: {p.line} — {p.error}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportView({
  report,
  fileName,
  busy,
  onApply,
  onCancel,
  onLink,
}: {
  report: PriceListReport;
  fileName: string;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
  onLink: (line: string, variantId: number | null) => Promise<void>;
}) {
  const [allLines, setAllLines] = useState(false);
  const [allChanges, setAllChanges] = useState(false);
  const unmatched = allLines ? report.unmatched : report.unmatched.slice(0, SHOWN);
  const changes = allChanges ? report.changes : report.changes.slice(0, SHOWN);
  const facts: string[] = [];
  if (report.supplier_new) facts.push(`новая цена поставщика у ${volumes(report.supplier_new)}`);
  if (report.supplier_up) facts.push(`цена поставщика выросла у ${volumes(report.supplier_up)}`);
  if (report.supplier_down) facts.push(`снизилась у ${volumes(report.supplier_down)}`);

  return (
    <div className="space-y-4 rounded-xl border border-gold/60 bg-cream/40 p-4">
      <div className="space-y-1 text-sm">
        <div className="font-semibold">Проверка «{fileName}» — ещё ничего не изменено</div>
        <div>
          Строк с ценой: {report.lines}. Сопоставлено: {report.matched}
          {report.by_barcode > 0 && ` (по штрихкоду ${report.by_barcode})`}, не наш товар:{" "}
          {report.ignored}, не сопоставлено: {report.unmatched.length}.
          {report.duplicates > 0 &&
            ` Строк с тем же товаром, что и в другой строке: ${report.duplicates} (берётся большая цена).`}
        </div>
        {facts.length > 0 && <div>{upperFirst(facts.join(", "))}.</div>}
        <div>
          Себестоимость выросла у {volumes(report.cost_up)}, снизилась у{" "}
          {volumes(report.cost_down)}
          {report.prices_kept > 0 && ` (у ${volumes(report.prices_kept)} цены продажи остаются прежними)`}.
        </div>
        <div>
          <b>Цены продажи вырастут у {volumes(report.prices_raised)}.</b>
          {report.remembered > 0 &&
            ` У ${volumes(report.remembered)} это первая себестоимость: сайт запомнит наценки их цен, цены не изменятся.`}
        </div>
      </div>
      {report.waiting_for_main && (
        <ErrorBox>
          Прайс основного поставщика ещё не загружали. Пока его нет, этот прайс только запоминает
          цены поставщика: себестоимость и цены продажи не изменятся. Сначала загрузите прайс
          основного поставщика.
        </ErrorBox>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-gold" disabled={busy} onClick={onApply}>
          Применить
        </button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
      </div>

      {report.unmatched.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Не сопоставлено: {report.unmatched.length}
            <span className="font-normal text-muted">
              {" "}
              — привяжите строку к товару или отметьте «не наш товар», сайт это запомнит
            </span>
          </div>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {unmatched.map((u) => (
              <UnmatchedRow key={`${u.row}:${u.line}`} item={u} onLink={onLink} />
            ))}
          </ul>
          {!allLines && report.unmatched.length > SHOWN && (
            <button type="button" className="text-sm text-muted underline" onClick={() => setAllLines(true)}>
              Показать все {report.unmatched.length}
            </button>
          )}
        </div>
      )}

      {report.changes.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Что изменится</div>
          <div className="overflow-x-auto">
            <table className="table-base bg-white">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Поставщик</th>
                  <th>Себестоимость</th>
                  <th>Розница</th>
                  <th>Опт</th>
                  <th>Кр. опт</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <ChangeRow key={c.variant_id} change={c} />
                ))}
              </tbody>
            </table>
          </div>
          {!allChanges && report.changes.length > SHOWN && (
            <button type="button" className="text-sm text-muted underline" onClick={() => setAllChanges(true)}>
              Показать все {report.changes.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UnmatchedRow({
  item,
  onLink,
}: {
  item: UnmatchedLine;
  onLink: (line: string, variantId: number | null) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (variantId: number | null) => {
    setBusy(true);
    setError(null);
    try {
      await onLink(item.line, variantId);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium break-words">{item.line}</div>
          <div className="text-xs text-muted">
            {money(item.price)}
            {item.barcode && ` · ${item.barcode}`} · строка {item.row}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() => setPicking(!picking)}
        >
          Привязать
        </button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(null)}>
          Не наш товар
        </button>
      </div>
      {picking && (
        <VariantPicker
          autoFocus
          initialQuery={guess(item.line)}
          placeholder="Найдите товар на сайте"
          onPick={(v) => run(v.variant_id)}
        />
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </li>
  );
}

function ChangeRow({ change: c }: { change: PriceChangeLine }) {
  return (
    <tr>
      <td>
        <Link href={`/admin/products/${c.product_id}`} className="hover:text-gold">
          {c.label}
        </Link>
        <div className="text-xs text-muted">{c.line}</div>
      </td>
      <Cell from={c.supplier_old} to={c.supplier_new} />
      <Cell from={c.cost_old} to={c.cost_new} />
      <Cell from={c.retail_old} to={c.retail_new} />
      <Cell from={c.wholesale_old} to={c.wholesale_new} />
      <Cell from={c.bulk_old} to={c.bulk_new} />
    </tr>
  );
}

function Cell({ from, to }: { from: number | null; to: number | null }) {
  if (from === to) return <td className="whitespace-nowrap text-muted">{money(to)}</td>;
  return (
    <td className="whitespace-nowrap">
      <span className="text-muted">{money(from)} → </span>
      <b className={from !== null && to !== null && to < from ? "text-emerald-700" : ""}>{money(to)}</b>
    </td>
  );
}
