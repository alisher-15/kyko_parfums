"use client";

import Link from "next/link";
import { TrashIcon } from "@/components/icons";
import { QuoteHints } from "@/components/QuoteHints";
import { Empty, ErrorBox, ProductImage, QuantityInput, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { TIER_LABELS, money } from "@/lib/format";
import { useQuote } from "@/lib/use-quote";

export default function CartPage() {
  const { items, setQuantity, remove, ready } = useCart();
  const { user } = useAuth();
  const { quote, error, loading } = useQuote();

  if (!ready) return <Spinner />;
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Empty title="Корзина пуста">
          <Link href="/catalog" className="btn btn-primary mt-2">
            Перейти в каталог
          </Link>
        </Empty>
      </div>
    );
  }

  const lineByVariant = new Map(quote?.lines.map((l) => [l.variant_id, l]));
  const unavailable = new Set(quote?.unavailable_variant_ids);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-serif text-4xl font-bold">Корзина</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {error && <ErrorBox>{error}</ErrorBox>}
          {items.map((item) => {
            const line = lineByVariant.get(item.variantId);
            const gone = unavailable.has(item.variantId);
            return (
              <div key={item.variantId} className="card flex gap-4 p-4">
                <Link
                  href={`/products/${item.productId}`}
                  className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white"
                >
                  <ProductImage
                    src={line?.image_url ?? item.imageUrl}
                    alt={item.productName}
                    seed={item.productId}
                  />
                </Link>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="text-xs font-semibold tracking-widest text-gold uppercase">
                    {item.brandName}
                  </div>
                  <Link
                    href={`/products/${item.productId}`}
                    className="font-serif text-xl font-semibold"
                  >
                    {item.productName}
                  </Link>
                  <div className="text-sm text-muted">{item.volumeMl} мл</div>
                  {gone && <div className="text-sm text-red-600">Товар больше недоступен</div>}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {!gone && (
                      <QuantityInput
                        value={item.quantity}
                        onChange={(q) => setQuantity(item.variantId, q)}
                      />
                    )}
                    <button
                      className="flex items-center gap-1 text-xs text-muted hover:text-red-600"
                      onClick={() => remove(item.variantId)}
                    >
                      <TrashIcon width={14} height={14} /> Удалить
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  {line && (
                    <>
                      <div className="font-bold">{money(line.line_total)}</div>
                      <div className="text-xs text-muted">
                        {money(line.unit_price)} × {line.quantity}
                      </div>
                      {line.unit_price < line.retail_unit_price && (
                        <div className="text-xs text-muted line-through">
                          {money(line.retail_unit_price)}
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-gold">{TIER_LABELS[line.price_tier]}</div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {quote && <QuoteHints quote={quote} />}
          {quote?.next_tier_total != null && quote.next_tier_total < quote.total && (
            <div className="rounded-xl border border-gold/40 bg-amber-50/60 px-4 py-3 text-sm">
              <div>
                На крупном опте этот заказ стоил бы <b>{money(quote.next_tier_total)}</b> —
                экономия {money(quote.total - quote.next_tier_total)}.
              </div>
              <Link href="/account#upgrade" className="mt-1 inline-block font-semibold text-gold">
                Запросить крупный опт →
              </Link>
            </div>
          )}
          <div className={`card p-5 ${loading ? "opacity-70" : ""}`}>
            <div className="flex justify-between text-sm">
              <span className="text-muted">По розничным ценам</span>
              <span>{money(quote?.retail_total)}</span>
            </div>
            {!!quote?.savings && quote.savings > 0 && (
              <div className="mt-2 flex justify-between text-sm text-emerald-700">
                <span>Ваша выгода</span>
                <span>−{money(quote.savings)}</span>
              </div>
            )}
            <div className="mt-4 flex justify-between border-t border-line pt-4 text-lg font-bold">
              <span>Итого</span>
              <span>{money(quote?.total)}</span>
            </div>
            <p className="mt-2 text-xs text-muted">
              Оплата по факту или переводом после подтверждения менеджером.
            </p>
            {user ? (
              <Link
                href="/checkout"
                className={`btn btn-primary mt-4 w-full ${
                  !quote?.can_checkout || loading ? "pointer-events-none opacity-50" : ""
                }`}
                aria-disabled={!quote?.can_checkout}
              >
                Оформить заказ
              </Link>
            ) : (
              <Link href="/login?next=/checkout" className="btn btn-primary mt-4 w-full">
                Войти и оформить заказ
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
