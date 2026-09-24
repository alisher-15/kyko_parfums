"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/format";
import type { User } from "@/lib/types";
import { ErrorBox, Field, SuccessBox } from "./ui";

/** "Ask for the next price level" — retail -> wholesale, wholesale -> bulk. */
export function UpgradeRequest({ compact = false }: { compact?: boolean }) {
  const { user, setUser } = useAuth();
  // null = not edited here: follow the profile, which can change on the same page.
  const [companyEdit, setCompany] = useState<string | null>(null);
  const [phoneEdit, setPhone] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(!compact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <Link href="/register?next=/account" className="btn btn-gold btn-sm">
        Оставить заявку
      </Link>
    );
  }
  const target = user.role === "retail" ? "wholesale" : user.role === "wholesale" ? "bulk_wholesale" : null;
  if (!target) return null;

  if (user.wholesale_requested) {
    return (
      <SuccessBox>
        Заявка на «{ROLE_LABELS[user.requested_role ?? target]}» отправлена. Менеджер свяжется с
        вами; новые цены появятся автоматически.
      </SuccessBox>
    );
  }

  const needsCompany = target === "wholesale";
  const company = companyEdit ?? user.company_name ?? "";
  const phone = phoneEdit ?? user.phone ?? "";
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUser(
        await api<User>("/me/upgrade-request", {
          body: { company_name: company || null, phone: phone || null, note: note || null },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const label = target === "wholesale" ? "Запросить оптовые цены" : "Запросить крупный опт";

  if (!open) {
    return (
      <button type="button" className="btn btn-gold btn-sm" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {needsCompany && (
        <>
          <Field label="Компания / ИП">
            <input className="input" required value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
          <Field label="Телефон для связи">
            <input className="input" required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </>
      )}
      <Field label={needsCompany ? "Комментарий (необязательно)" : "Объём закупок, комментарий (необязательно)"}>
        <input
          className="input"
          placeholder={needsCompany ? "Магазин, салон, маркетплейс…" : "Например: 200 флаконов в месяц"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {error && <ErrorBox>{error}</ErrorBox>}
      <button className="btn btn-gold btn-sm" disabled={busy}>
        {label}
      </button>
    </form>
  );
}
