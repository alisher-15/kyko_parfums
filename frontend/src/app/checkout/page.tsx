"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { QuoteHints } from "@/components/QuoteHints";
import { RequireAuth } from "@/components/RequireAuth";
import { Empty, ErrorBox, Field, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import type { Order, User } from "@/lib/types";
import { useQuote } from "@/lib/use-quote";

export default function CheckoutPage() {
  return (
    <RequireAuth>
      <Checkout />
    </RequireAuth>
  );
}

function Checkout() {
  const { user } = useAuth() as { user: User };
  const { items, clear, ready } = useCart();
  const { quote, loading } = useQuote();
  const router = useRouter();
  const [form, setForm] = useState({
    contact_name: user.full_name ?? "",
    contact_phone: user.phone ?? "",
    // A login like "admin" is not a deliverable address — don't prefill it into an email field.
    contact_email: user.email.includes("@") ? user.email : "",
    delivery_city: "",
    delivery_address: "",
    comment: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!ready) return <Spinner />;
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Empty title="Корзина пуста">
          <Link href="/catalog" className="btn btn-primary mt-2">
            В каталог
          </Link>
        </Empty>
      </div>
    );
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const order = await api<Order>("/orders", {
        body: {
          ...form,
          contact_email: form.contact_email || null,
          comment: form.comment || null,
          items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
        },
      });
      clear();
      router.push(`/account/orders/${order.id}?created=1`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? `${err.message}. Вернитесь в корзину и проверьте количество.`
          : err instanceof Error
            ? err.message
            : String(err),
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-serif text-4xl font-bold">Оформление заказа</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <form onSubmit={submit} className="card space-y-4 p-6">
          <h2 className="font-serif text-2xl font-semibold">Контакты</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Имя и фамилия">
              <input className="input" required value={form.contact_name} onChange={set("contact_name")} />
            </Field>
            <Field label="Телефон">
              <input
                className="input"
                required
                type="tel"
                value={form.contact_phone}
                onChange={set("contact_phone")}
                placeholder="+7 ___ ___ __ __"
              />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.contact_email} onChange={set("contact_email")} />
            </Field>
          </div>
          <h2 className="pt-2 font-serif text-2xl font-semibold">Доставка</h2>
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <Field label="Город">
              <input className="input" required value={form.delivery_city} onChange={set("delivery_city")} />
            </Field>
            <Field label="Адрес">
              <input
                className="input"
                required
                value={form.delivery_address}
                onChange={set("delivery_address")}
                placeholder="Улица, дом, квартира / офис"
              />
            </Field>
          </div>
          <Field label="Комментарий к заказу">
            <textarea className="input min-h-24" value={form.comment} onChange={set("comment")} />
          </Field>
          <div className="rounded-xl bg-cream px-4 py-3 text-sm text-muted">
            Онлайн-оплаты пока нет: после оформления менеджер свяжется с вами, подтвердит наличие
            и срок доставки. Оплата — по факту получения или переводом.
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button
            className="btn btn-primary w-full"
            disabled={submitting || loading || !quote?.can_checkout}
          >
            {submitting ? "Оформляем…" : `Подтвердить заказ${quote ? ` на ${money(quote.total)}` : ""}`}
          </button>
          {quote && !quote.can_checkout && (
            <p className="text-center text-sm text-red-600">
              В корзине есть недоступные позиции —{" "}
              <Link href="/cart" className="underline">
                исправьте корзину
              </Link>
            </p>
          )}
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {quote && <QuoteHints quote={quote} />}
          <div className="card p-5">
            <h2 className="mb-3 font-serif text-2xl font-semibold">Ваш заказ</h2>
            <ul className="space-y-2 text-sm">
              {quote?.lines.map((l) => (
                <li key={l.variant_id} className="flex justify-between gap-3">
                  <span>
                    {l.brand_name} {l.product_name}, {l.volume_ml} мл × {l.quantity}
                  </span>
                  <span className="shrink-0 font-semibold">{money(l.line_total)}</span>
                </li>
              ))}
            </ul>
            {!!quote?.savings && quote.savings > 0 && (
              <div className="mt-3 flex justify-between text-sm text-emerald-700">
                <span>Выгода</span>
                <span>−{money(quote.savings)}</span>
              </div>
            )}
            <div className="mt-3 flex justify-between border-t border-line pt-3 text-lg font-bold">
              <span>Итого</span>
              <span>{money(quote?.total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
