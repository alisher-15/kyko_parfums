"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/AuthCard";
import { ErrorBox, Field } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null, fallback = "/account"): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      const fallback = user.role === "admin" ? "/admin" : "/account";
      router.replace(safeNext(params.get("next"), fallback));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const next = params.get("next");
  return (
    <AuthCard
      title="Вход"
      subtitle="Войдите, чтобы оформлять заказы и видеть свои цены."
      footer={
        <>
          Нет аккаунта?{" "}
          <Link
            href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
            className="font-semibold text-gold"
          >
            Зарегистрироваться
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Пароль">
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
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Входим…" : "Войти"}
        </button>
        <div className="text-center">
          <Link href="/forgot-password" className="text-sm text-muted hover:text-ink">
            Забыли пароль?
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
