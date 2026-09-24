"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/AuthCard";
import { ErrorBox, Field, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ detail: string }>("/auth/forgot-password", { body: { email } });
      setSent(res.detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Восстановление пароля"
      subtitle="Укажите email — пришлём ссылку для установки нового пароля."
      footer={
        <Link href="/login" className="font-semibold text-gold">
          Вернуться ко входу
        </Link>
      }
    >
      {sent ? (
        <SuccessBox>{sent}</SuccessBox>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button className="btn btn-primary w-full" disabled={busy}>
            Отправить ссылку
          </button>
        </form>
      )}
    </AuthCard>
  );
}
