"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ScanField, type ScanResult } from "@/components/admin/ScanField";
import { UnknownBarcode, showUnknown } from "@/components/admin/UnknownBarcode";
import { VariantPicker } from "@/components/admin/VariantPicker";
import { TrashIcon } from "@/components/icons";
import { ErrorBox, Spinner, SuccessBox } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { CountLine, StockCount } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function CountView({ id }: { id: number }) {
  const { data, error } = useApi<StockCount>(`/admin/counts/${id}`);
  const [doc, setDoc] = useState<StockCount | null>(null);
  // The latest document right away (state lags a render behind fast consecutive scans).
  const latest = useRef<StockCount | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmPost, setConfirmPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const count = doc ?? data;

  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!count) return <Spinner />;

  const draft = count.status === "draft";
  const base = `/admin/counts/${id}`;

  const apply = (c: StockCount) => {
    latest.current = c;
    setDoc(c);
  };

  const run = async (fn: () => Promise<StockCount | void>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const c = await fn();
      if (c) apply(c);
      if (okText) setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const scan = async (code: string): Promise<ScanResult> => {
    const before = latest.current ?? count;
    let c: StockCount;
    try {
      c = await api<StockCount>(`${base}/scan`, { body: { code } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setUnknown(code);
        return {
          ok: false,
          title: `Штрихкод ${code} не найден`,
          detail: "Его нет в каталоге. Привяжите код к товару — в следующий раз он найдётся сам.",
          action: { label: "Привязать к товару", run: () => showUnknown() },
        };
      }
      throw e;
    }
    apply(c);
    setUnknown(null);
    const line = c.items.find((i) => i.id === c.touched_line_id);
    if (!line) return { ok: true, title: "Посчитано" };
    const lineUrl = `${base}/lines/${line.id}`;
    // Undo removes a line this scan created; otherwise it puts the old count back.
    const existed = before.items.some((i) => i.id === line.id);
    const counted = line.counted - 1;
    return {
      ok: true,
      title: line.label,
      detail: line.expected !== null ? `В системе ${line.expected} шт.` : undefined,
      quantity: {
        label: "Посчитано, шт.",
        value: line.counted,
        min: 0,
        set: async (n) => {
          const updated = await api<StockCount>(lineUrl, { method: "PATCH", body: { counted: n } });
          apply(updated);
          return updated.items.find((i) => i.id === line.id)?.counted ?? n;
        },
      },
      undo: async () => {
        apply(
          await api<StockCount>(
            lineUrl,
            existed ? { method: "PATCH", body: { counted } } : { method: "DELETE" },
          ),
        );
      },
    };
  };

  const mismatches = count.items.filter((i) => i.expected !== null && i.counted !== i.expected);

  return (
    <div className="space-y-5">
      <Link href="/admin/inventory" className="text-sm text-muted hover:text-ink">
        ← Все инвентаризации
      </Link>
      <AdminHeader
        title={
          <>
            Инвентаризация № {count.id}{" "}
            <span className={`chip align-middle font-sans ${draft ? "border-gold text-gold" : ""}`}>
              {draft ? "Идёт пересчёт" : "Проведена"}
            </span>
          </>
        }
      />
      <NoteField key={`${count.id}-${draft}`} count={count} onSaved={(c) => apply(c)} />

      {draft && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <div className="label">Сканер</div>
            <ScanField onScan={scan} cameraTitle={`Инвентаризация № ${count.id}`} />
            <p className="mt-2 text-xs text-muted">
              Один скан — одна штука. Несколько одинаковых проще посчитать кнопками −/+.
            </p>
          </div>
          <div className="card p-4">
            <div className="label">Товар без штрихкода или которого нет на полке</div>
            <VariantPicker
              onPick={(item) =>
                run(
                  () =>
                    api<StockCount>(`${base}/lines`, {
                      body: { variant_id: item.variant_id, quantity: 0 },
                    }),
                  `Добавлено: ${item.brand_name} ${item.product_name}, ${item.volume_ml} мл — укажите количество`,
                )
              }
            />
          </div>
        </div>
      )}

      {unknown && draft && (
        <UnknownBarcode
          id="unknown-barcode"
          code={unknown}
          onCancel={() => setUnknown(null)}
          onAttached={(item) =>
            run(async () => {
              const c = await api<StockCount>(`${base}/scan`, { body: { code: unknown } });
              setUnknown(null);
              return c;
            }, `Штрихкод привязан к «${item.brand_name} ${item.product_name}, ${item.volume_ml} мл», посчитано +1`)
          }
        />
      )}

      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}

      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl font-semibold">Посчитано</h2>
          <span className="text-sm text-muted">
            {count.items.length} поз. · расхождений {mismatches.length} · итого{" "}
            <b className={count.difference < 0 ? "text-red-600" : count.difference > 0 ? "text-emerald-700" : "text-ink"}>
              {count.difference > 0 ? `+${count.difference}` : count.difference} шт.
            </b>
          </span>
        </div>
        {count.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Начните сканировать товар на полке.</p>
        ) : (
          <ul className="divide-y divide-line">
            {count.items.map((line) => (
              <CountRow
                key={`${line.id}-${line.counted}`}
                line={line}
                draft={draft}
                highlight={line.id === count.touched_line_id}
                disabled={busy}
                onChange={(counted) =>
                  run(() =>
                    api<StockCount>(`${base}/lines/${line.id}`, {
                      method: "PATCH",
                      body: { counted },
                    }),
                  )
                }
                onDelete={() =>
                  run(() => api<StockCount>(`${base}/lines/${line.id}`, { method: "DELETE" }))
                }
              />
            ))}
          </ul>
        )}
      </div>

      {draft ? (
        <div className="card space-y-3 p-4">
          <p className="text-xs text-muted">
            «В системе» — остаток прямо сейчас. Если во время пересчёта что-то продали, проводите
            документ сразу после подсчёта, чтобы продажи не посчитались дважды.
          </p>
          {confirmPost ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1 text-sm">
                Провести? Остатки {count.items.length} поз. станут равны посчитанному.
              </span>
              <button
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => {
                  setConfirmPost(false);
                  run(
                    () => api<StockCount>(`${base}/post`, { method: "POST" }),
                    "Инвентаризация проведена, остатки исправлены",
                  );
                }}
              >
                Да, провести
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setConfirmPost(false)}>
                Нет
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-primary flex-1 py-3"
                disabled={busy || count.items.length === 0}
                onClick={() => setConfirmPost(true)}
              >
                Провести инвентаризацию
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() => {
                  if (!confirm("Удалить эту инвентаризацию?")) return;
                  run(async () => {
                    await api(base, { method: "DELETE" });
                    router.replace("/admin/inventory");
                  });
                }}
              >
                Удалить
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Проведена {count.posted_at ? dateTime(count.posted_at) : ""}
          {count.posted_by_email ? ` · ${count.posted_by_email}` : ""}. «В системе» — остаток до
          проведения.
        </p>
      )}
    </div>
  );
}

function NoteField({ count, onSaved }: { count: StockCount; onSaved: (c: StockCount) => void }) {
  const [note, setNote] = useState(count.note ?? "");
  const [busy, setBusy] = useState(false);
  if (count.status !== "draft") {
    return count.note ? <p className="text-sm">Комментарий: {count.note}</p> : null;
  }
  const save = async () => {
    setBusy(true);
    try {
      onSaved(
        await api<StockCount>(`/admin/counts/${count.id}`, {
          method: "PATCH",
          body: { note },
        }),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block min-w-0 flex-1">
        <span className="label">Что пересчитываем</span>
        <input
          className="input"
          placeholder="Например: витрина, склад, бренд Chanel"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {note !== (count.note ?? "") && (
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={save}>
          Сохранить
        </button>
      )}
    </div>
  );
}

function CountRow({
  line,
  draft,
  highlight,
  disabled,
  onChange,
  onDelete,
}: {
  line: CountLine;
  draft: boolean;
  highlight: boolean;
  disabled: boolean;
  onChange: (counted: number) => void;
  onDelete: () => void;
}) {
  const [value, setValue] = useState(String(line.counted));
  const commit = () => {
    const n = Number(value);
    if (value !== "" && Number.isInteger(n) && n >= 0 && n !== line.counted) onChange(n);
    else setValue(String(line.counted));
  };
  const diff = line.expected === null ? null : line.counted - line.expected;

  return (
    <li className={`flex flex-wrap items-center gap-3 py-3 ${highlight ? "bg-emerald-50" : ""}`}>
      <div className="min-w-0 flex-1 basis-60">
        <div className="font-semibold">{line.label}</div>
        {line.sku && <div className="text-xs text-muted">{line.sku}</div>}
      </div>
      <div className="text-sm text-muted">
        В системе: <span className="tabular-nums">{line.expected ?? "—"}</span>
      </div>
      {draft ? (
        <label className="flex items-center gap-1 text-xs text-muted">
          Посчитано
          <input
            className="input w-20 px-2 py-1 text-right"
            inputMode="numeric"
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </label>
      ) : (
        <div className="text-sm">
          Посчитано: <b className="tabular-nums">{line.counted}</b>
        </div>
      )}
      <span
        className={`w-16 text-right font-semibold tabular-nums ${
          diff === null || diff === 0 ? "text-muted" : diff < 0 ? "text-red-600" : "text-emerald-700"
        }`}
      >
        {diff === null ? "" : diff > 0 ? `+${diff}` : diff}
      </span>
      {draft && (
        <button
          className="text-muted hover:text-red-600"
          disabled={disabled}
          onClick={onDelete}
          aria-label="Убрать строку"
        >
          <TrashIcon width={16} height={16} />
        </button>
      )}
    </li>
  );
}
