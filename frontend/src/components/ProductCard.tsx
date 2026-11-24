"use client";

import Link from "next/link";
import { useCurrency } from "@/lib/currency";
import { GENDER_LABELS, percentOff } from "@/lib/format";
import type { ProductListItem } from "@/lib/types";
import { ProductImage } from "./ui";

/** `compact`: the smaller card of the home page rails (smaller type, no gender line, volumes
 *  under the price). `note`: one more badge («Купили 41 раз»). `tester`: the card of the home
 *  page's «Тестеры»: the tester's price next to the bottle's, struck through. */
export function ProductCard({
  product,
  compact = false,
  note,
  tester = false,
}: {
  product: ProductListItem;
  compact?: boolean;
  note?: string;
  tester?: boolean;
}) {
  const { money } = useCurrency();
  const offer = tester ? product.tester : null;
  const badge = compact ? "px-1.5 py-0 text-[10px]" : "px-2.5 py-0.5 text-xs";
  return (
    <Link
      href={`/products/${product.id}`}
      className="group card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-stone-200/70"
    >
      {/* The photo is positioned absolutely: a tall portrait photo must not stretch the square. */}
      <div className="relative aspect-square overflow-hidden bg-white">
        <div className={`absolute ${compact ? "inset-2" : "inset-4"}`}>
          <ProductImage src={product.image_url} alt={product.name} seed={product.id} />
        </div>
        {product.type && !(compact && (product.deal || product.is_new || note || offer)) && (
          <span className={`absolute chip ${compact ? "top-1.5 right-1.5 px-1.5 py-0 text-[10px]" : "top-3 right-3"}`}>
            {product.type}
          </span>
        )}
        {(product.deal || product.is_new || note || offer) && (
          <div className={`absolute flex flex-col items-start gap-1 ${compact ? "top-1.5 left-1.5" : "top-3 left-3"}`}>
            {note && <span className={`rounded-full bg-ink font-semibold text-white ${badge}`}>{note}</span>}
            {offer && (
              <span className={`rounded-full bg-gold font-bold text-white ${badge}`}>
                −{Math.round((1 - offer.price / offer.bottle_price) * 100)}%
              </span>
            )}
            {product.deal && !offer && (
              <span className={`rounded-full bg-gold font-bold text-white ${badge}`}>
                {percentOff(product.deal.discount_percent)}
              </span>
            )}
            {product.is_new && !note && !offer && (
              <span className={`rounded-full bg-ink font-semibold text-white ${badge}`}>
                Выбор Kyko
              </span>
            )}
          </div>
        )}
      </div>
      {compact ? (
        <div className="flex flex-1 flex-col gap-0.5 border-t border-line p-2.5">
          <div className="truncate text-[10px] font-semibold tracking-wider text-gold uppercase">
            {product.brand.name}
          </div>
          <div className="line-clamp-2 font-serif text-sm leading-tight font-semibold group-hover:text-gold-dark sm:text-base">
            {product.name}
          </div>
          <div className="mt-auto pt-1.5 text-xs">
            {offer ? (
              <>
                <s className="text-muted">{money(offer.bottle_price)}</s>{" "}
                <span className="font-bold">{money(offer.price)}</span>
              </>
            ) : product.min_price !== null ? (
              <>
                <span className="text-muted">от </span>
                <span className="font-bold">{money(product.min_price)}</span>
              </>
            ) : (
              <span className="text-muted">Цена по запросу</span>
            )}
          </div>
          {offer ? (
            <div className="truncate text-[11px] text-muted">тестер {offer.volume_ml} мл</div>
          ) : (
            product.volumes.length > 0 && (
              <div className="truncate text-[11px] text-muted">{product.volumes.join(" / ")} мл</div>
            )
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-1 border-t border-line p-4">
          <div className="text-xs font-semibold tracking-widest text-gold uppercase">
            {product.brand.name}
          </div>
          <div className="font-serif text-xl leading-tight font-semibold group-hover:text-gold-dark">
            {product.name}
          </div>
          <div className="text-xs text-muted">
            {[product.gender && GENDER_LABELS[product.gender], product.category]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="mt-auto flex items-end justify-between pt-3">
            <div className="text-sm">
              {product.min_price !== null ? (
                <>
                  <span className="text-muted">от </span>
                  <span className="font-bold">{money(product.min_price)}</span>
                </>
              ) : (
                <span className="text-muted">Цена по запросу</span>
              )}
            </div>
            {product.volumes.length > 0 && (
              <div className="text-xs text-muted">{product.volumes.join(" / ")} мл</div>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}
