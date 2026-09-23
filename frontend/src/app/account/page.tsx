"use client";

import { useState, type FormEvent } from "react";
import { ErrorBox, Field, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, dateTime, money } from "@/lib/format";
import type { PricingRules, TokenPair, User } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function AccountPage() {
  const { user } = useAuth() as { user: User };
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <StatusCard user={user} />
      <ProfileForm user={user} />
      <PasswordForm />
    </div>
  );
}

function StatusCard({ user }: { user: User }) {
  const { setUser } = useAuth();
  const { data: rules } = useApi<PricingRules>("/pricing/rules");
  const [company, setCompany] = useState(user.company_name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isWholesale = user.role === "wholesale" || user.role === "bulk_wholesale";

  const requestWholesale = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUser(await api<User>("/me/wholesale-request", { body: { company_name: company, phone } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6 md:row-span-2">
      <div className="label">Статус</div>
      <div className="font-serif text-3xl font-bold">{ROLE_LABELS[user.role]}</div>
      <div className="mt-1 text-sm text-muted">
        {user.email} · с {dateTime(user.created_at).split(",")[0]}
      </div>

      {isWholesale && rules && (
        <div className="mt-5 rounded-xl bg-cream p-4 text-sm">
          <div className="font-semibold">Ваши условия</div>
          <ul className="mt-2 space-y-1 text-muted">
            {rules.mode === "order_total" ? (
              <>
                <li>Оптовые цены — при заказе от {money(rules.wholesale_min_order_amount)}</li>
                {rules.bulk_min_order_amount !== null && (
                  <li>Цены крупного опта — при заказе от {money(rules.bulk_min_order_amount)}</li>
                )}
              </>
            ) : (
              <>
                <li>Оптовые цены — от {rules.wholesale_min_item_qty} шт. одной позиции</li>
                {rules.bulk_min_item_qty !== null && (
                  <li>Крупный опт — от {rules.bulk_min_item_qty} шт. одной позиции</li>
                )}
              </>
            )}
            <li>Ниже порога заказ считается по розничным ценам.</li>
          </ul>
        </div>
      )}

      {user.role === "retail" &&
        (user.wholesale_requested ? (
          <div className="mt-5">
            <SuccessBox>
              Заявка на оптовый статус отправлена. Менеджер проверит данные и сменит статус —
              новые цены появятся автоматически.
            </SuccessBox>
          </div>
        ) : (
          <form onSubmit={requestWholesale} className="mt-6 space-y-3">
            <div className="font-semibold">Хотите покупать оптом?</div>
            <p className="text-sm text-muted">
              Оставьте данные компании — после проверки менеджер присвоит статус «Опт» или «Крупный
              опт».
            </p>
            <Field label="Компания / ИП">
              <input
                className="input"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </Field>
            <Field label="Телефон для связи">
              <input
                className="input"
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            {error && <ErrorBox>{error}</ErrorBox>}
            <button className="btn btn-gold" disabled={busy}>
              Отправить заявку
            </button>
          </form>
        ))}
    </div>
  );
}

function ProfileForm({ user }: { user: User }) {
  const { setUser } = useAuth();
  const [form, setForm] = useState({
    full_name: user.full_name ?? "",
    phone: user.phone ?? "",
    company_name: user.company_name ?? "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setUser(
        await api<User>("/me", {
          method: "PATCH",
          body: {
            full_name: form.full_name || null,
            phone: form.phone || null,
            company_name: form.company_name || null,
          },
        }),
      );
      setMsg({ ok: true, text: "Сохранено" });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div className="font-serif text-2xl font-semibold">Профиль</div>
      <Field label="Имя">
        <input className="input" value={form.full_name} onChange={set("full_name")} />
      </Field>
      <Field label="Телефон">
        <input className="input" type="tel" value={form.phone} onChange={set("phone")} />
      </Field>
      <Field label="Компания">
        <input className="input" value={form.company_name} onChange={set("company_name")} />
      </Field>
      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}
      <button className="btn btn-primary">Сохранить</button>
    </form>
  );
}

function PasswordForm() {
  const { setSession } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const pair = await api<TokenPair>("/me/change-password", {
        body: { current_password: current, new_password: next },
      });
      setSession(pair);
      setCurrent("");
      setNext("");
      setMsg({ ok: true, text: "Пароль изменён. Другие сеансы завершены." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div className="font-serif text-2xl font-semibold">Смена пароля</div>
      <Field label="Текущий пароль">
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field label="Новый пароль" hint="Минимум 8 символов">
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>
      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}
      <button className="btn btn-outline">Изменить пароль</button>
    </form>
  );
}
