"use client";

import Link from "next/link";
import { useState } from "react";
import { UpgradeRequest } from "@/components/UpgradeRequest";
import { Breadcrumbs, ErrorBox, ProductImage, QuantityInput, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { GENDER_LABELS, TIER_LABELS, money, splitNotes } from "@/lib/format";
import type { PricingRules, ProductDetail, VariantPublic } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function ProductView({ id }: { id: number }) {
  const valid = Number.isInteger(id) && id > 0;
  const { data: product, error } = useApi<ProductDetail>(valid ? `/products/${id}` : null);
  const { data: rules } = useApi<PricingRules>("/pricing/rules");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (!valid || error?.status === 404) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-4xl font-bold">Товар не найден</h1>
        <Link href="/catalog" className="btn btn-primary mt-6">
          В каталог
        </Link>
      </div>
    );
  }
  if (error) return <div className="mx-auto max-w-3xl p-8"><ErrorBox>{error.message}</ErrorBox></div>;
  if (!product) return <Spinner />;

  const variant =
    product.variants.find((v) => v.id === selectedId) ??
    product.variants.find((v) => v.availability !== "out") ??
    product.variants[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { href: "/catalog", label: "Каталог" },
          { href: `/catalog?brand_id=${product.brand.id}`, label: product.brand.name },
          { label: product.name },
        ]}
      />
      <div className="grid gap-10 md:grid-cols-2">
        <div className="card aspect-square overflow-hidden p-8">
          <ProductImage
            src={variant?.photo_url ?? product.image_url}
            alt={`${product.brand.name} ${product.name}`}
            seed={product.id}
            className="rounded-xl"
          />
        </div>

        <div>
          <Link
            href={`/catalog?brand_id=${product.brand.id}`}
            className="text-sm font-semibold tracking-[0.2em] text-gold uppercase"
          >
            {product.brand.name}
          </Link>
          <h1 className="mt-2 font-serif text-5xl leading-tight font-bold">{product.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {product.type && <span className="chip">{product.type}</span>}
            {product.gender && <span className="chip">{GENDER_LABELS[product.gender]}</span>}
            {product.category && <span className="chip">{product.category}</span>}
            {product.longevity && <span className="chip">Стойкость: {product.longevity}</span>}
          </div>

          {product.variants.length === 0 ? (
            <div className="card mt-8 p-6 text-sm text-muted">
              Цена и наличие уточняются. Оставьте заказ через менеджера или загляните позже.
            </div>
          ) : (
            <Purchase product={product} variant={variant} rules={rules} onSelect={setSelectedId} />
          )}

          <NotesPyramid product={product} />

          {product.description && (
            <div className="mt-8">
              <h2 className="label">Описание</h2>
              <p className="leading-relaxed whitespace-pre-line text-stone-700">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Purchase({
  product,
  variant,
  rules,
  onSelect,
}: {
  product: ProductDetail;
  variant: VariantPublic;
  rules: PricingRules | undefined;
  onSelect: (id: number) => void;
}) {
  const { user } = useAuth();
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const discounted = variant.price < variant.retail_price;
  const outOfStock = variant.availability === "out";

  const addToCart = () => {
    add(
      {
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        brandName: product.brand.name,
        volumeMl: variant.volume_ml,
        imageUrl: variant.photo_url ?? product.image_url,
      },
      qty,
    );
    setAdded(true);
  };

  return (
    <div className="mt-8">
      <div className="label">Объём</div>
      <div className="flex flex-wrap gap-2">
        {product.variants.map((v) => (
          <button
            key={v.id}
            onClick={() => {
              onSelect(v.id);
              setQty(1);
              setAdded(false);
            }}
            className={`rounded-xl border px-4 py-2 text-left text-sm transition ${
              v.id === variant.id ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"
            } ${v.availability === "out" ? "opacity-60" : ""}`}
          >
            <div className="font-semibold">{v.volume_ml} мл</div>
            <div className={`text-xs ${v.id === variant.id ? "text-stone-300" : "text-muted"}`}>
              {money(v.price)}
            </div>
          </button>
        ))}
      </div>

      <div className="card mt-6 p-5">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-3xl font-bold">{money(variant.price)}</span>
          {discounted && (
            <span className="text-lg text-muted line-through">{money(variant.retail_price)}</span>
          )}
          <span className="chip">{TIER_LABELS[variant.price_tier]}</span>
        </div>

        {(variant.wholesale_price !== null || variant.bulk_price !== null) && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <PriceCell label="Розница" value={variant.retail_price} />
            {variant.wholesale_price !== null && (
              <PriceCell
                label="Опт"
                value={variant.wholesale_price}
                hint={thresholdHint(rules, "wholesale")}
              />
            )}
            {variant.bulk_price !== null && (
              <PriceCell label="Крупный опт" value={variant.bulk_price} hint={thresholdHint(rules, "bulk")} />
            )}
          </div>
        )}

        {discounted && rules && hasThresholds(rules) && <ThresholdNote rules={rules} />}

        <div className="mt-4 text-sm">
          <StockNote variant={variant} />
          {variant.sku && <span className="ml-3 text-xs text-muted">Артикул: {variant.sku}</span>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <QuantityInput value={qty} onChange={setQty} max={variant.stock ?? undefined} />
          <button className="btn btn-primary flex-1" disabled={outOfStock} onClick={addToCart}>
            В корзину
          </button>
        </div>
        {added && (
          <div className="mt-3 text-sm text-emerald-700">
            Добавлено в корзину ·{" "}
            <Link href="/cart" className="font-semibold underline">
              перейти в корзину
            </Link>
          </div>
        )}
      </div>

      {variant.next_tier_price !== null && (
        <div className="mt-4 rounded-2xl border border-gold/40 bg-amber-50/60 p-5">
          <div className="text-xs font-semibold tracking-widest text-gold uppercase">
            Ваша следующая цена
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-bold">{money(variant.next_tier_price)}</span>
            <span className="text-sm text-muted">
              на крупном опте · −{Math.round((1 - variant.next_tier_price / variant.price) * 100)}% к
              вашей цене
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {rules?.next_tier_terms || "Условия перехода на крупный опт уточнит менеджер."}
          </p>
          <div className="mt-3">
            <UpgradeRequest compact />
          </div>
        </div>
      )}

      {(!user || user.role === "retail") && (
        <div className="mt-4 rounded-2xl bg-ink p-5 text-white">
          <div className="font-serif text-xl font-semibold">Для магазинов и салонов</div>
          <p className="mt-1 text-sm text-stone-300">
            Оптовые цены для бизнеса. Оставьте заявку — менеджер подтвердит статус, и цены в
            каталоге обновятся.
          </p>
          <div className="mt-3">
            {user ? (
              <Link href="/account" className="btn btn-gold btn-sm">
                Оставить заявку
              </Link>
            ) : (
              <Link href="/register?next=/account" className="btn btn-gold btn-sm">
                Зарегистрироваться и оставить заявку
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Guests and retail buyers get the count only when few units are left; wholesale sees it always. */
function StockNote({ variant }: { variant: VariantPublic }) {
  if (variant.availability === "out") return <span className="text-red-600">Нет в наличии</span>;
  if (variant.availability === "low") {
    return <span className="text-amber-700">Осталось мало: {variant.stock} шт.</span>;
  }
  return (
    <span className="text-emerald-700">
      В наличии{variant.stock !== null ? `: ${variant.stock} шт.` : ""}
    </span>
  );
}

function PriceCell({ label, value, hint }: { label: string; value: number; hint?: string | null }) {
  return (
    <div className="rounded-lg bg-cream p-2">
      <div className="text-muted">{label}</div>
      <div className="font-semibold">{money(value)}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted">{hint}</div>}
    </div>
  );
}

function thresholdHint(rules: PricingRules | undefined, tier: "wholesale" | "bulk"): string | null {
  if (!rules) return null;
  if (rules.mode === "order_total") {
    const amount =
      tier === "wholesale" ? rules.wholesale_min_order_amount : rules.bulk_min_order_amount;
    return amount ? `от ${money(amount)} в заказе` : null;
  }
  const qty = tier === "wholesale" ? rules.wholesale_min_item_qty : rules.bulk_min_item_qty;
  return qty && qty > 1 ? `от ${qty} шт.` : null;
}

function hasThresholds(rules: PricingRules): boolean {
  return rules.mode === "order_total"
    ? !!(rules.wholesale_min_order_amount || rules.bulk_min_order_amount)
    : (rules.wholesale_min_item_qty ?? 1) > 1 || (rules.bulk_min_item_qty ?? 1) > 1;
}

function ThresholdNote({ rules }: { rules: PricingRules }) {
  const text =
    rules.mode === "order_total"
      ? "Сниженная цена применяется, когда сумма заказа достигает порога. Иначе заказ считается по рознице."
      : "Сниженная цена применяется к позиции, когда её количество достигает порога.";
  return <p className="mt-3 text-xs text-muted">{text}</p>;
}

function NotesPyramid({ product }: { product: ProductDetail }) {
  const levels = [
    { title: "Верхние ноты", notes: splitNotes(product.top_notes) },
    { title: "Ноты сердца", notes: splitNotes(product.mid_notes) },
    { title: "Базовые ноты", notes: splitNotes(product.base_notes) },
  ].filter((l) => l.notes.length > 0);
  if (levels.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="label">Пирамида аромата</h2>
      <div className="space-y-3">
        {levels.map((l) => (
          <div key={l.title} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
            <div className="w-32 shrink-0 pt-1 text-sm font-semibold">{l.title}</div>
            <div className="flex flex-wrap gap-1.5">
              {l.notes.map((n) => (
                <span key={n} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-line">
                  {n}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
