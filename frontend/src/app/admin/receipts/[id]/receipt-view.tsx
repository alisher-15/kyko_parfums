"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ScanField, type ScanResult } from "@/components/admin/ScanField";
import { UnknownBarcode, showUnknown } from "@/components/admin/UnknownBarcode";
import { VariantPicker } from "@/components/admin/VariantPicker";
import { TrashIcon } from "@/components/icons";
import { ErrorBox, Spinner, SuccessBox } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { CURRENCY, dateTime, money, volumeLabel } from "@/lib/format";
import type { Receipt, ReceiptLine } from "@/lib/types";
import { useApi } from "@/lib/use-api";

function parseMoney(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".");
  return t === "" ? null : Number(t);
}

export function ReceiptView({ id }: { id: number }) {
  const { data, error } = useApi<Receipt>(`/admin/receipts/${id}`);
  const [doc, setDoc] = useState<Receipt | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmPost, setConfirmPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const receipt = doc ?? data;

  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!receipt) return <Spinner />;

  const draft = receipt.status === "draft";
  const base = `/admin/receipts/${id}`;

  const run = async (fn: () => Promise<Receipt | void>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r) setDoc(r);
      if (okText) setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const scan = async (code: string): Promise<ScanResult> => {
    let r: Receipt;
    try {
      r = await api<Receipt>(`${base}/scan`, { body: { code } });
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
    setDoc(r);
    setUnknown(null);
    const line = r.items.find((i) => i.id === r.touched_line_id);
    if (!line) return { ok: true, title: "Добавлено в приёмку" };
    const lineUrl = `${base}/lines/${line.id}`;
    const before = line.quantity - 1; // a scan adds one unit
    return {
      ok: true,
      title: line.label,
      detail:
        line.cost_price !== null
          ? `Закупочная цена ${money(line.cost_price)}`
          : "Закупочная цена не указана",
      quantity: {
        label: "В приёмке, шт.",
        value: line.quantity,
        min: 1,
        set: async (n) => {
          const updated = await api<Receipt>(lineUrl, { method: "PATCH", body: { quantity: n } });
          setDoc(updated);
          return updated.items.find((i) => i.id === line.id)?.quantity ?? n;
        },
      },
      undo: async () => {
        setDoc(
          await api<Receipt>(
            lineUrl,
            before > 0 ? { method: "PATCH", body: { quantity: before } } : { method: "DELETE" },
          ),
        );
      },
    };
  };

  const withoutCost = receipt.items.filter((i) => i.cost_price === null).length;

  return (
    <div className="space-y-5">
      <Link href="/admin/receipts" className="text-sm text-muted hover:text-ink">
        ← Все приёмки
      </Link>
      <AdminHeader
        title={
          <>
            Приёмка № {receipt.id}{" "}
            <span className={`chip align-middle font-sans ${draft ? "border-gold text-gold" : ""}`}>
              {draft ? "Черновик" : "Проведена"}
            </span>
          </>
        }
      />

      <ReceiptHeader key={`${receipt.id}-${draft}`} receipt={receipt} onSaved={setDoc} />

      {draft && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <div className="label">Сканер</div>
            <ScanField onScan={scan} cameraTitle={`Приёмка № ${receipt.id}`} />
            <p className="mt-2 text-xs text-muted">
              Один скан — одна штука. Несколько одинаковых коробок проще добавить кнопкой «+».
            </p>
          </div>
          <div className="card p-4">
            <div className="label">Товар без штрихкода</div>
            <VariantPicker
              onPick={(item) =>
                run(
                  () => api<Receipt>(`${base}/lines`, { body: { variant_id: item.variant_id } }),
                  `Добавлено: ${item.brand_name} ${item.product_name}, ${volumeLabel(item.volume_ml, item.is_tester)}`,
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
              const r = await api<Receipt>(`${base}/scan`, { body: { code: unknown } });
              setUnknown(null);
              return r;
            }, `Штрихкод привязан к «${item.brand_name} ${item.product_name}, ${volumeLabel(item.volume_ml, item.is_tester)}», +1 шт.`)
          }
        />
      )}

      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}

      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl font-semibold">Товары</h2>
          <span className="text-sm text-muted">
            {receipt.items.length} поз. · {receipt.total_quantity} шт. · на сумму{" "}
            <b className="text-ink">{money(receipt.total_cost)}</b>
          </span>
        </div>
        {receipt.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Отсканируйте первую коробку или найдите товар по названию.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {receipt.items.map((line) => (
              <LineRow
                key={`${line.id}-${line.quantity}-${line.cost_price}`}
                line={line}
                draft={draft}
                highlight={line.id === receipt.touched_line_id}
                disabled={busy}
                onChange={(body) =>
                  run(() => api<Receipt>(`${base}/lines/${line.id}`, { method: "PATCH", body }))
                }
                onDelete={() =>
                  run(() => api<Receipt>(`${base}/lines/${line.id}`, { method: "DELETE" }))
                }
              />
            ))}
          </ul>
        )}
      </div>

      {draft ? (
        <div className="card space-y-3 p-4">
          {withoutCost > 0 && receipt.items.length > 0 && (
            <p className="text-sm text-amber-700">
              У {withoutCost} поз. не указана закупочная цена: их себестоимость не изменится, а
              маржа по ним не посчитается.
            </p>
          )}
          {confirmPost ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1 text-sm">
                Провести приёмку? На склад добавится {receipt.total_quantity} шт. После проведения
                документ не меняется.
              </span>
              <button
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => {
                  setConfirmPost(false);
                  run(
                    () => api<Receipt>(`${base}/post`, { method: "POST" }),
                    "Приёмка проведена, товар на складе",
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
                disabled={busy || receipt.items.length === 0}
                onClick={() => setConfirmPost(true)}
              >
                Провести приёмку · {receipt.total_quantity} шт.
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() => {
                  if (!confirm("Удалить черновик приёмки?")) return;
                  run(async () => {
                    await api(base, { method: "DELETE" });
                    router.replace("/admin/receipts");
                  });
                }}
              >
                Удалить черновик
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Проведена {receipt.posted_at ? dateTime(receipt.posted_at) : ""}
          {receipt.posted_by_email ? ` · ${receipt.posted_by_email}` : ""}. Остатки и себестоимость
          обновлены; движения видны в карточках товаров.
        </p>
      )}
    </div>
  );
}

function ReceiptHeader({ receipt, onSaved }: { receipt: Receipt; onSaved: (r: Receipt) => void }) {
  const initial = {
    supplier: receipt.supplier ?? "",
    number: receipt.number ?? "",
    note: receipt.note ?? "",
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: suppliers } = useApi<string[]>(
    receipt.status === "draft" ? "/admin/receipts/suppliers" : null,
  );
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  if (receipt.status !== "draft") {
    return (
      <div className="card grid gap-3 p-4 text-sm sm:grid-cols-3">
        <div>
          <div className="label">Поставщик</div>
          {receipt.supplier ?? "—"}
        </div>
        <div>
          <div className="label">Накладная</div>
          {receipt.number ?? "—"}
        </div>
        <div>
          <div className="label">Комментарий</div>
          {receipt.note ?? "—"}
        </div>
      </div>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api<Receipt>(`/admin/receipts/${receipt.id}`, { method: "PATCH", body: form }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Поставщик</span>
          <input
            className="input"
            list="receipt-suppliers"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          />
          <datalist id="receipt-suppliers">
            {suppliers?.map((s) => <option key={s} value={s} />)}
          </datalist>
        </label>
        <label className="block">
          <span className="label">№ накладной</span>
          <input
            className="input"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="label">Комментарий</span>
          <input
            className="input"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {dirty && (
        <button className="btn btn-outline btn-sm mt-3" disabled={busy} onClick={save}>
          Сохранить
        </button>
      )}
    </div>
  );
}

function LineRow({
  line,
  draft,
  highlight,
  disabled,
  onChange,
  onDelete,
}: {
  line: ReceiptLine;
  draft: boolean;
  highlight: boolean;
  disabled: boolean;
  onChange: (body: { quantity?: number; cost_price?: number | null }) => void;
  onDelete: () => void;
}) {
  const [qty, setQty] = useState(String(line.quantity));
  const [cost, setCost] = useState(line.cost_price === null ? "" : String(line.cost_price));

  const commitQty = () => {
    const n = Number(qty);
    if (Number.isInteger(n) && n >= 1 && n !== line.quantity) onChange({ quantity: n });
    else setQty(String(line.quantity));
  };
  const commitCost = () => {
    const n = parseMoney(cost);
    if (n !== null && (Number.isNaN(n) || n < 0)) {
      setCost(line.cost_price === null ? "" : String(line.cost_price));
      return;
    }
    if (n !== line.cost_price) onChange({ cost_price: n });
  };
  const sum = line.cost_price !== null ? line.cost_price * line.quantity : null;
  // New purchase price against the current average cost.
  const delta =
    line.cost_price !== null && line.current_cost !== null ? line.cost_price - line.current_cost : 0;

  return (
    <li className={`flex flex-wrap items-center gap-3 py-3 ${highlight ? "bg-emerald-50" : ""}`}>
      <div className="min-w-0 flex-1 basis-60">
        <div className="font-semibold">{line.label}</div>
        <div className="text-xs text-muted">
          {line.sku ? `${line.sku} · ` : ""}
          {line.stock !== null && `на складе ${line.stock} шт.`}
          {line.current_cost !== null && ` · себестоимость ${money(line.current_cost)}`}
          {delta !== 0 && (
            <span className={delta > 0 ? "text-red-600" : "text-emerald-700"}>
              {" "}
              ({delta > 0 ? "дороже" : "дешевле"} прежней)
            </span>
          )}
        </div>
      </div>
      {draft ? (
        <>
          <label className="flex items-center gap-1 text-xs text-muted">
            Кол-во
            <input
              className="input w-20 px-2 py-1 text-right"
              inputMode="numeric"
              value={qty}
              disabled={disabled}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
              onBlur={commitQty}
              onKeyDown={(e) => e.key === "Enter" && commitQty()}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted">
            Цена, {CURRENCY}
            <input
              className="input w-28 px-2 py-1 text-right"
              inputMode="decimal"
              placeholder="не указана"
              value={cost}
              disabled={disabled}
              onChange={(e) => setCost(e.target.value.replace(/[^\d.,\s]/g, ""))}
              onBlur={commitCost}
              onKeyDown={(e) => e.key === "Enter" && commitCost()}
            />
          </label>
        </>
      ) : (
        <span className="text-sm">
          {line.quantity} шт. × {money(line.cost_price)}
        </span>
      )}
      <span className="w-28 text-right font-semibold tabular-nums">{money(sum)}</span>
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
