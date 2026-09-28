"use client";

import { useState, type FormEvent } from "react";
import { ErrorBox, Field, Spinner, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { RateInfo } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const rate = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STEPS = [-10, -5, 5, 10];

const toNumber = (s: string): number => Number(s.replace(",", ".").trim());

/**
 * The dollar rate behind the ₸ / $ switch on the site. It comes from mig.kz and the last good one
 * is kept; here the admin shifts it by a few tenge, types a rate by hand, or reads mig.kz again.
 */
export function RateCard() {
  const { data, error, reload } = useApi<RateInfo>("/admin/currency");
  // The form starts over when the saved rate changes (its fields take the new values), so the
  // result message lives out here: kept inside, the reload would wipe it before it is read.
  const [msg, setMsg] = useState<Message | null>(null);
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!data) return <Spinner />;
  const key = [data.source_rate, data.adjustment, data.manual_rate, data.checked_at].join("|");
  return <RateForm key={key} rate={data} onChanged={reload} msg={msg} setMsg={setMsg} />;
}

type Message = { ok: boolean; text: string };

function RateForm({
  rate: r,
  onChanged,
  msg,
  setMsg,
}: {
  rate: RateInfo;
  onChanged: () => void;
  msg: Message | null;
  setMsg: (msg: Message | null) => void;
}) {
  const [adjustment, setAdjustment] = useState(String(r.adjustment));
  const [manual, setManual] = useState(r.manual_rate === null ? "" : String(r.manual_rate));
  const [busy, setBusy] = useState(false);

  const adj = adjustment.trim() === "" ? 0 : toNumber(adjustment);
  const manualValue = manual.trim() === "" ? null : toNumber(manual);
  const valid =
    Number.isFinite(adj) &&
    Math.abs(adj) <= 50 &&
    (manualValue === null || (Number.isFinite(manualValue) && manualValue > 0));
  const preview =
    manualValue !== null ? manualValue : r.source_rate !== null ? r.source_rate + adj : null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    return run(
      () =>
        api("/admin/currency", {
          method: "PUT",
          body: { adjustment: adj, manual_rate: manualValue },
        }),
      "Курс сохранён",
    );
  };

  const refresh = () =>
    run(() => api("/admin/currency/refresh", { body: {} }), "Курс обновлён с mig.kz");

  return (
    <form onSubmit={save} className="card max-w-3xl space-y-4 p-5" aria-label="Курс доллара">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Курс доллара</h2>
        <p className="mt-1 text-sm text-muted">
          Покупатели могут смотреть цены в долларах (кнопка ₸ / $ в шапке сайта). Считаются они
          только для просмотра: заказ оформляется и оплачивается в тенге. Курс берётся с mig.kz
          сам, раз в несколько часов.
        </p>
      </div>

      <div className="rounded-xl bg-cream p-4">
        <div className="text-xs font-semibold tracking-wide text-muted uppercase">
          Сейчас на сайте
        </div>
        <div className="mt-1 text-2xl font-bold">
          {r.effective_rate !== null ? `1 $ = ${rate.format(r.effective_rate)} ₸` : "курс не задан"}
        </div>
        <div className="mt-1 text-sm text-muted">
          {r.manual_rate !== null
            ? "Указан вручную."
            : r.source_rate !== null
              ? `mig.kz ${rate.format(r.source_rate)} ₸ ${r.adjustment >= 0 ? "+" : "−"} ${rate.format(Math.abs(r.adjustment))} ₸ поправка.`
              : "С mig.kz курс ещё не получен. Без курса кнопки ₸ / $ на сайте нет."}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-muted">
          mig.kz:{" "}
          {r.source_rate !== null
            ? `${rate.format(r.source_rate)} ₸, получен ${r.source_updated_at ? dateTime(r.source_updated_at) : "—"}`
            : "курс не получен"}
        </span>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={refresh}>
          Обновить сейчас
        </button>
      </div>
      {r.source_error && (
        <ErrorBox>
          Последнее обновление не удалось: {r.source_error}.{" "}
          {r.source_rate !== null
            ? "Пока используется последний полученный курс."
            : "Введите курс вручную ниже."}
        </ErrorBox>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Field label="Поправка, ₸" hint="От −50 до +50 к курсу mig.kz">
            <input
              className="input"
              inputMode="decimal"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value.replace(/[^\d.,-]/g, ""))}
            />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STEPS.map((s) => (
              <button
                key={s}
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() =>
                  setAdjustment(String(Math.round(((Number.isFinite(adj) ? adj : 0) + s) * 100) / 100))
                }
              >
                {s > 0 ? `+${s}` : `−${-s}`}
              </button>
            ))}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAdjustment("0")}>
              0
            </button>
          </div>
        </div>
        <Field
          label="Свой курс, ₸"
          hint="Если заполнено, используется он, а mig.kz и поправка не учитываются. Очистите поле, чтобы вернуться к mig.kz."
        >
          <input
            className="input"
            inputMode="decimal"
            placeholder="например, 505"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/[^\d.,]/g, ""))}
          />
        </Field>
      </div>

      <div className="text-sm">
        После сохранения на сайте будет:{" "}
        <b>{preview !== null && valid ? `1 $ = ${rate.format(preview)} ₸` : "—"}</b>
      </div>
      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}
      <button className="btn btn-primary" disabled={busy || !valid}>
        Сохранить курс
      </button>
    </form>
  );
}
