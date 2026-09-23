"use client";

import { useState, type FormEvent } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ErrorBox, Field, Spinner, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { CURRENCY, dateTime } from "@/lib/format";
import type { PricingMode, PricingSettings } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function PricingSettingsPage() {
  const { data, error, reload } = useApi<PricingSettings>("/admin/settings/pricing");
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!data) return <Spinner />;
  return <SettingsForm key={data.updated_at} initial={data} onSaved={reload} />;
}

function SettingsForm({ initial, onSaved }: { initial: PricingSettings; onSaved: () => void }) {
  const [form, setForm] = useState({
    mode: initial.mode,
    wholesale_min_order_amount: String(initial.wholesale_min_order_amount),
    bulk_min_order_amount: String(initial.bulk_min_order_amount),
    wholesale_min_item_qty: String(initial.wholesale_min_item_qty),
    bulk_min_item_qty: String(initial.bulk_min_item_qty),
    max_store_discount_percent: String(initial.max_store_discount_percent),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api("/admin/settings/pricing", {
        method: "PUT",
        body: {
          mode: form.mode,
          wholesale_min_order_amount: Number(form.wholesale_min_order_amount || 0),
          bulk_min_order_amount: Number(form.bulk_min_order_amount || 0),
          wholesale_min_item_qty: Number(form.wholesale_min_item_qty || 1),
          bulk_min_item_qty: Number(form.bulk_min_item_qty || 1),
          max_store_discount_percent: Number(form.max_store_discount_percent.replace(",", ".") || 0),
        },
      });
      setMsg({ ok: true, text: "Настройки сохранены — новые правила уже действуют в корзине." });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-6">
      <AdminHeader title="Цены, пороги и скидки" />
      <p className="text-sm text-muted">
        У каждого объёма три цены: розница, опт и крупный опт. Роль пользователя определяет лучшую
        доступную ему цену, а порог — когда она применяется. Если порог не достигнут, заказ
        считается по рознице, а в корзине покупатель видит, сколько не хватает.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Mode
          current={form.mode}
          onSelect={(mode) => setForm({ ...form, mode })}
          value="order_total"
          title="По сумме заказа"
          text="Оптовая цена применяется ко всему заказу, если его сумма (по оптовым ценам) не меньше порога."
        />
        <Mode
          current={form.mode}
          onSelect={(mode) => setForm({ ...form, mode })}
          value="item_quantity"
          title="По количеству единиц"
          text="Оптовая цена применяется к позиции, если её количество в заказе не меньше порога."
        />
      </div>

      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        {form.mode === "order_total" ? (
          <>
            <Field label={`Опт: минимальная сумма, ${CURRENCY}`} hint="0 — без порога">
              <input
                className="input"
                inputMode="decimal"
                value={form.wholesale_min_order_amount}
                onChange={set("wholesale_min_order_amount")}
              />
            </Field>
            <Field label={`Крупный опт: минимальная сумма, ${CURRENCY}`}>
              <input
                className="input"
                inputMode="decimal"
                value={form.bulk_min_order_amount}
                onChange={set("bulk_min_order_amount")}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Опт: минимум штук одной позиции" hint="1 — без порога">
              <input
                className="input"
                inputMode="numeric"
                value={form.wholesale_min_item_qty}
                onChange={set("wholesale_min_item_qty")}
              />
            </Field>
            <Field label="Крупный опт: минимум штук одной позиции">
              <input
                className="input"
                inputMode="numeric"
                value={form.bulk_min_item_qty}
                onChange={set("bulk_min_item_qty")}
              />
            </Field>
          </>
        )}
      </div>

      <div className="card p-5">
        <div className="mb-1 font-semibold">Продажи в магазине</div>
        <p className="mb-3 text-sm text-muted">
          Максимальная скидка, которую можно дать на позицию при продаже в магазине.
        </p>
        <Field label="Максимальная скидка, %" className="max-w-xs">
          <input
            className="input"
            inputMode="decimal"
            value={form.max_store_discount_percent}
            onChange={set("max_store_discount_percent")}
          />
        </Field>
      </div>

      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}
      <div className="flex items-center gap-4">
        <button className="btn btn-primary">Сохранить</button>
        {initial.updated_at && (
          <span className="text-xs text-muted">Изменено {dateTime(initial.updated_at)}</span>
        )}
      </div>
    </form>
  );
}

function Mode({
  value,
  current,
  onSelect,
  title,
  text,
}: {
  value: PricingMode;
  current: PricingMode;
  onSelect: (mode: PricingMode) => void;
  title: string;
  text: string;
}) {
  return (
    <label
      className={`card flex cursor-pointer gap-3 p-4 ${current === value ? "border-gold ring-2 ring-gold/20" : ""}`}
    >
      <input
        type="radio"
        name="mode"
        className="mt-1 accent-gold"
        checked={current === value}
        onChange={() => onSelect(value)}
      />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="text-sm text-muted">{text}</span>
      </span>
    </label>
  );
}
