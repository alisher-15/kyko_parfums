"use client";

import { useState, type FormEvent } from "react";
import { UpgradeRequest } from "@/components/UpgradeRequest";
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
      <DeleteAccount />
    </div>
  );
}

function StatusCard({ user }: { user: User }) {
  const { data: rules } = useApi<PricingRules>("/pricing/rules");
  const isWholesale = user.role === "wholesale" || user.role === "bulk_wholesale";
  const thresholds =
    rules &&
    (rules.mode === "order_total"
      ? !!(rules.wholesale_min_order_amount || rules.bulk_min_order_amount)
      : (rules.wholesale_min_item_qty ?? 1) > 1 || (rules.bulk_min_item_qty ?? 1) > 1);

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
            {!thresholds ? (
              <li>
                {user.role === "bulk_wholesale" ? "Цены крупного опта" : "Оптовые цены"} действуют
                на любой заказ.
              </li>
            ) : rules.mode === "order_total" ? (
              <>
                <li>Оптовые цены — при заказе от {money(rules.wholesale_min_order_amount)}</li>
                {rules.bulk_min_order_amount !== null && (
                  <li>Цены крупного опта — при заказе от {money(rules.bulk_min_order_amount)}</li>
                )}
                <li>Ниже порога заказ считается по розничным ценам.</li>
              </>
            ) : (
              <>
                <li>Оптовые цены — от {rules.wholesale_min_item_qty} шт. одной позиции</li>
                {rules.bulk_min_item_qty !== null && (
                  <li>Крупный опт — от {rules.bulk_min_item_qty} шт. одной позиции</li>
                )}
                <li>Ниже порога заказ считается по розничным ценам.</li>
              </>
            )}
          </ul>
        </div>
      )}

      {user.role === "retail" && (
        <div className="mt-6 space-y-3" id="upgrade">
          <div className="font-semibold">Хотите покупать оптом?</div>
          <p className="text-sm text-muted">
            Оставьте данные компании — после проверки менеджер присвоит оптовый статус, и цены в
            каталоге обновятся.
          </p>
          <UpgradeRequest />
        </div>
      )}

      {user.role === "wholesale" && (
        <div className="mt-6 space-y-3" id="upgrade">
          <div className="font-semibold">Крупный опт</div>
          <p className="text-sm text-muted">
            {rules?.next_tier_terms ||
              "Цены ниже оптовых для постоянных крупных закупок. Условия уточнит менеджер."}
          </p>
          <UpgradeRequest />
        </div>
      )}
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

/** The same rules as the app's «Удалить аккаунт»: personal data goes, orders stay. */
function DeleteAccount() {
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm("Удалить аккаунт навсегда? Восстановить его будет нельзя.")) return;
    setBusy(true);
    setError(null);
    try {
      await api("/me/delete", { body: { password } });
      logout("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <details className="card p-6 md:col-start-2">
      <summary className="cursor-pointer text-sm font-semibold text-red-700">Удалить аккаунт</summary>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Email, имя, телефон и название компании удаляются с сервера магазина.</li>
          <li>Войти в аккаунт будет нельзя — ни на сайте, ни в приложении.</li>
          <li>Заказы остаются в учёте магазина: это документы о продажах.</li>
          <li>Позже можно зарегистрироваться заново с тем же email.</li>
        </ul>
        <Field label="Пароль для подтверждения">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button className="btn btn-outline w-full border-red-200 text-red-700" disabled={busy}>
          {busy ? "Удаляем…" : "Удалить аккаунт навсегда"}
        </button>
      </form>
    </details>
  );
}
