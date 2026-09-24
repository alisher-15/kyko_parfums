"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/AuthCard";
import { ErrorBox, Field } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

export function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ email: "", password: "", full_name: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({
        email: form.email,
        password: form.password,
        full_name: form.full_name || undefined,
        phone: form.phone || undefined,
      });
      router.replace(safeNext(params.get("next")));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Регистрация"
      subtitle="Оптовым покупателям: после регистрации отправьте заявку в личном кабинете — менеджер присвоит оптовый статус."
      footer={
        <>
          Уже есть аккаунт?{" "}
          <Link href="/login" className="font-semibold text-gold">
            Войти
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Имя">
          <input className="input" autoComplete="name" value={form.full_name} onChange={set("full_name")} />
        </Field>
        <Field label="Телефон">
          <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set("email")}
          />
        </Field>
        <Field label="Пароль" hint="Минимум 8 символов">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={set("password")}
          />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Создаём аккаунт…" : "Зарегистрироваться"}
        </button>
      </form>
    </AuthCard>
  );
}
