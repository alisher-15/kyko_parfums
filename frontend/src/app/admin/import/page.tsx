"use client";

import { useRef, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ErrorBox, Field, SuccessBox } from "@/components/ui";
import { api, downloadFile } from "@/lib/api";
import type { ImportReport } from "@/lib/types";

export default function ImportPage() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setReport(null);
    const form = new FormData();
    form.append("file", file);
    try {
      setReport(
        await api<ImportReport>("/admin/import/catalog", {
          form,
          query: { dry_run: dryRun, sheet: sheet || undefined },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <AdminHeader
        title="Импорт каталога из Excel"
        actions={
          <button
            className="btn btn-outline btn-sm"
            onClick={() => downloadFile("/admin/import/template", "catalog_template.xlsx")}
          >
            Скачать шаблон
          </button>
        }
      />
      <div className="card space-y-3 p-5 text-sm text-muted">
        <p>
          Поддерживаются <b>.xlsx</b> и <b>.csv</b>. Строка заголовков ищется автоматически; колонки
          распознаются по названию (рус./англ.): <i>Бренд, Название, Тип, Категория / Олфактивная
          группа, Пол, Стойкость, Верхние ноты, Ноты сердца, Базовые ноты, Описание, Фото, Объём,
          Тестер, Цена / Розница, Опт, Крупный опт, Остаток, Артикул, Штрихкод, Себестоимость</i>. В
          ячейке «Штрихкод» можно указать несколько кодов через запятую.
        </p>
        <p>
          <b>Тестеры.</b> Строка считается тестером, если в колонке «Тестер» стоит «да», или в
          названии, объёме или типе есть слово «тестер» / «tester» («Coco Mademoiselle Tester»,
          «100 мл тестер»). Слово убирается из названия, и тестер добавляется к тому же товару рядом
          с обычным флаконом, со своими ценами розница / опт / крупный опт.
        </p>
        <p>
          Одна строка = один товар (+ один объём, если заполнены объём и розничная цена). Несколько
          строк с одинаковым брендом, названием и типом добавляют объёмы к одному товару. Повторный
          импорт обновляет существующие товары: пустые ячейки не затирают данные.
        </p>
      </div>

      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="label">Файл</span>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.xlsm,.csv"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setReport(null);
              }}
            />
            <button className="btn btn-outline" onClick={() => input.current?.click()}>
              {file ? file.name : "Выбрать файл"}
            </button>
          </div>
          <Field label="Лист (необязательно)" className="w-56">
            <input
              className="input"
              placeholder="по умолчанию — активный"
              value={sheet}
              onChange={(e) => setSheet(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-outline" disabled={!file || busy} onClick={() => run(true)}>
            Проверить (без сохранения)
          </button>
          <button className="btn btn-primary" disabled={!file || busy} onClick={() => run(false)}>
            {busy ? "Импортируем…" : "Импортировать"}
          </button>
        </div>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}
      {report && <Report report={report} />}
    </div>
  );
}

function Report({ report }: { report: ImportReport }) {
  const stats: [string, number][] = [
    ["Строк в файле", report.rows_total],
    ["Пропущено строк", report.rows_skipped],
    ["Новых брендов", report.brands_created],
    ["Новых товаров", report.products_created],
    ["Обновлено товаров", report.products_updated],
    ["Новых объёмов", report.variants_created],
    ["Обновлено объёмов", report.variants_updated],
    ["Тестеров в файле", report.tester_rows],
  ];
  return (
    <div className="space-y-4">
      {report.dry_run ? (
        <SuccessBox>Проверка завершена — в базу ничего не записано. Так будет выглядеть импорт:</SuccessBox>
      ) : (
        <SuccessBox>Импорт выполнен.</SuccessBox>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-xs text-muted">{label}</div>
            <div className="text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>
      {report.unmapped_columns.length > 0 && (
        <div className="card p-4 text-sm">
          <b>Не распознаны колонки</b> (проигнорированы): {report.unmapped_columns.join(", ")}
        </div>
      )}
      {report.errors.length > 0 && (
        <div className="card overflow-x-auto p-4">
          <div className="mb-2 font-semibold">Замечания ({report.errors.length})</div>
          <table className="table-base">
            <thead>
              <tr>
                <th>Строка</th>
                <th>Проблема</th>
              </tr>
            </thead>
            <tbody>
              {report.errors.slice(0, 500).map((e, i) => (
                <tr key={i}>
                  <td>{e.row}</td>
                  <td>{e.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
