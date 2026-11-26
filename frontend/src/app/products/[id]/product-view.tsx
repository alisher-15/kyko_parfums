"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { UpgradeRequest } from "@/components/UpgradeRequest";
import { Breadcrumbs, ErrorBox, ProductImage, QuantityInput, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useCurrency } from "@/lib/currency";
import {
  GENDER_LABELS,
  TIER_LABELS,
  dayMonth,
  money as tenge,
  percentOff,
  splitNotes,
  volumeLabel,
} from "@/lib/format";
import { rememberViewed } from "@/lib/recent";
import type { PricingRules, ProductDetail, VariantPublic } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function ProductView({ id }: { id: number }) {
  const valid = Number.isInteger(id) && id > 0;
  const { data: product, error } = useApi<ProductDetail>(valid ? `/products/${id}` : null);
  // For «Вы смотрели» on the home page: only a product the shop could show.
  useEffect(() => {
    if (product) rememberViewed(product.id);
  }, [product]);
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

  // Bottles come first, testers after them (the API orders them so).
  const variant = product.variants.find((v) => v.id === selectedId) ?? product.variants[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { href: "/catalog", label: "Каталог" },
          ...product.category_path.map((c) => ({
            href: `/catalog?category_id=${c.id}`,
            label: c.name,
          })),
          { href: `/catalog?brand_id=${product.brand.id}`, label: product.brand.name },
          { label: product.name },
        ]}
      />
      <div className="grid gap-10 md:grid-cols-2">
        {/* The studio: the bottle on soft mother-of-pearl, the photo's white multiplied away. */}
        <div
          className="aspect-square overflow-hidden rounded-xl p-10"
          style={{ background: "linear-gradient(#fff 5%, #f1dfd9)" }}
        >
          <div className="h-full w-full mix-blend-multiply">
            <ProductImage
              src={variant?.photo_url ?? product.image_url}
              alt={`${product.brand.name} ${product.name}`}
              seed={product.id}
            />
          </div>
        </div>

        <div>
          <Link
            href={`/catalog?brand_id=${product.brand.id}`}
            className="text-sm font-semibold tracking-[0.2em] text-gold uppercase"
          >
            {product.brand.name}
          </Link>
          <h1 className="mt-2 font-serif text-5xl leading-tight font-semibold">{product.name}</h1>
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
  const { money } = useCurrency();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  // Phones: once the buy box is scrolled away (the notes, the description), a bar at the bottom
  // keeps the price and «В корзину» at hand.
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxGone, setBoxGone] = useState(false);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setBoxGone(!entry.isIntersecting && entry.boundingClientRect.top < 0),
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  // The WhatsApp button moves up above the bar while it is shown.
  useEffect(() => {
    document.documentElement.classList.toggle("has-bottom-bar", boxGone);
    return () => document.documentElement.classList.remove("has-bottom-bar");
  }, [boxGone]);

  const discounted = variant.price < variant.retail_price;
  const bottles = product.variants.filter((v) => !v.is_tester);
  const testers = product.variants.filter((v) => v.is_tester);
  const volumes = variant.is_tester ? testers : bottles;

  const choose = (v: VariantPublic) => {
    onSelect(v.id);
    setQty(1);
    setAdded(false);
  };
  // Switching between the bottle and the tester keeps the volume when there is one.
  const target = (kind: VariantPublic[]) =>
    kind.find((v) => v.id === variant.id) ??
    kind.find((v) => v.volume_ml === variant.volume_ml) ??
    kind[0];

  const addToCart = () => {
    add(
      {
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        brandName: product.brand.name,
        volumeMl: variant.volume_ml,
        isTester: variant.is_tester,
        imageUrl: variant.photo_url ?? product.image_url,
      },
      qty,
    );
    setAdded(true);
  };

  return (
    <div className="mt-8">
      {testers.length > 0 && (
        <div className="mb-6">
          <div className="inline-flex rounded-md border border-line bg-white p-1">
            {bottles.length > 0 && (
              <KindButton
                title="Товар"
                active={!variant.is_tester}
                onClick={() => choose(target(bottles))}
              />
            )}
            <KindButton
              title="Тестер"
              active={variant.is_tester}
              onClick={() => choose(target(testers))}
            />
          </div>
          {variant.is_tester && (
            <p className="mt-2 text-sm text-muted">
              Тестер — тот же аромат, что и в обычном флаконе, но в простой упаковке.
            </p>
          )}
        </div>
      )}

      <div className="label">Объём</div>
      <div className="flex flex-wrap gap-2">
        {volumes.map((v) => (
          <button
            key={v.id}
            onClick={() => choose(v)}
            aria-pressed={v.id === variant.id}
            className={`min-w-24 rounded-md border bg-white px-4 py-2 text-left text-sm transition ${
              v.id === variant.id ? "border-ink ring-1 ring-ink" : "border-line hover:border-ink"
            }`}
          >
            <div className="font-semibold">{v.volume_ml} мл</div>
            <div className="text-xs text-muted">
              {money(v.price)}
            </div>
          </button>
        ))}
      </div>

      <div ref={boxRef} className="card mt-6 p-5">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-3xl font-bold">{money(variant.price)}</span>
          {discounted && (
            <span className="text-lg text-muted line-through">{money(variant.retail_price)}</span>
          )}
          {variant.deal ? (
            <span className="rounded-sm bg-cherry px-2 py-0.5 text-xs font-bold tracking-wider text-pearl uppercase">
              Акция {percentOff(variant.deal.discount_percent)}
            </span>
          ) : (
            <span className="chip">{TIER_LABELS[variant.price_tier]}</span>
          )}
          {variant.is_tester && <span className="chip">Тестер</span>}
        </div>
        {variant.deal && (
          <p className="mt-1 text-sm text-muted">
            «{variant.deal.title}»{variant.deal.ends_on && ` — до ${dayMonth(variant.deal.ends_on)}`}
          </p>
        )}

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

        {discounted && !variant.deal && rules && hasThresholds(rules) && <ThresholdNote rules={rules} />}

        <div className="mt-4 text-sm">
          <StockNote variant={variant} />
          {variant.sku && <span className="ml-3 text-xs text-muted">Артикул: {variant.sku}</span>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Anything can be ordered: what the shop doesn't have, it gets from a supplier. */}
          <QuantityInput value={qty} onChange={setQty} />
          <button className="btn btn-primary flex-1" onClick={addToCart}>
            В корзину
          </button>
        </div>
        {added && (
          <div className="mt-3 text-sm text-emerald-700" role="status">
            Добавлено в корзину ·{" "}
            <Link href="/cart" className="font-semibold underline">
              перейти в корзину
            </Link>
          </div>
        )}
      </div>

      {boxGone && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted">
                {product.brand.name} {product.name} · {volumeLabel(variant.volume_ml, variant.is_tester)}
              </div>
              <div className="text-lg font-bold">{money(variant.price)}</div>
            </div>
            {added ? (
              <Link href="/cart" className="btn btn-outline">
                В корзине →
              </Link>
            ) : (
              <button className="btn btn-primary" onClick={addToCart}>
                В корзину
              </button>
            )}
          </div>
        </div>
      )}

      {variant.next_tier_price !== null && (
        <div className="mt-4 rounded-lg bg-gold-soft p-5">
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
        <div className="velvet mt-4 rounded-lg p-5 text-white">
          <div className="font-serif text-2xl font-semibold text-pearl">Для магазинов и салонов</div>
          <p className="mt-1 text-sm text-nacre-muted">
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

/** "Товар" or "Тестер". Volumes and their prices are chosen below. */
function KindButton({
  title,
  active,
  onClick,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-5 py-2 text-xs font-semibold tracking-[0.12em] uppercase transition ${
        active ? "bg-ink text-white" : "text-stone-700 hover:bg-cream"
      }`}
    >
      {title}
    </button>
  );
}

/** The storefront speaks about stock only when few units are left; the rest is admin data. */
function StockNote({ variant }: { variant: VariantPublic }) {
  if (variant.stock === null) return null;
  return <span className="text-amber-700">Осталось мало: {variant.stock} шт.</span>;
}

function PriceCell({ label, value, hint }: { label: string; value: number; hint?: string | null }) {
  const { money } = useCurrency();
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
    return amount ? `от ${tenge(amount)} в заказе` : null;
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

/** The notes as pearls on a thread: the top notes the smallest pearl, gone first; the base the
 *  largest, staying longest (the app draws the same). */
const PEARLS = ["h-3 w-3", "h-[18px] w-[18px]", "h-6 w-6"];

function NotesPyramid({ product }: { product: ProductDetail }) {
  const levels = [
    { title: "Верхние ноты", when: "первые 15 минут", notes: splitNotes(product.top_notes) },
    { title: "Ноты сердца", when: "следующие 2–4 часа", notes: splitNotes(product.mid_notes) },
    { title: "Базовые ноты", when: "до конца дня", notes: splitNotes(product.base_notes) },
  ]
    .map((l, depth) => ({ ...l, depth }))
    .filter((l) => l.notes.length > 0);
  if (levels.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="label">Пирамида аромата</h2>
      <div className="relative">
        <span aria-hidden className="absolute top-3 bottom-3 left-[13px] w-0.5 rounded bg-[#dcbdb1]" />
        {levels.map((l) => (
          <div key={l.title} className="relative flex gap-3 py-2">
            <span className="flex w-7 shrink-0 justify-center pt-0.5">
              <span aria-hidden className={`pearl ${PEARLS[l.depth]}`} />
            </span>
            <div>
              <div className="text-sm font-semibold">{l.title}</div>
              <div className="text-xs text-muted">{l.when}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {l.notes.map((n) => (
                  <span key={n} className="rounded-md bg-gold-soft px-3 py-1 text-sm">
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
