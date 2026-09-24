"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/AuthCard";
import { ErrorBox, Field, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";

export function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/auth/reset-password", { body: { token, new_password: password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Новый пароль">
      {!token ? (
        <ErrorBox>
          В ссылке нет токена. Запросите{" "}
          <Link href="/forgot-password" className="underline">
            новую ссылку
          </Link>
          .
        </ErrorBox>
      ) : done ? (
        <div className="space-y-4">
          <SuccessBox>Пароль изменён.</SuccessBox>
          <Link href="/login" className="btn btn-primary w-full">
            Войти
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Новый пароль" hint="Минимум 8 символов">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Повторите пароль">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button className="btn btn-primary w-full" disabled={busy}>
            Сохранить пароль
          </button>
        </form>
      )}
    </AuthCard>
  );
}
