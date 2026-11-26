"use client";

import Link from "next/link";
import { useCurrency } from "@/lib/currency";
import { GENDER_LABELS, percentOff } from "@/lib/format";
import type { ProductListItem } from "@/lib/types";
import { ProductImage } from "./ui";

/** The studio's backdrops: soft jewel tones a bottle stands on (by product, so a card keeps its
 *  colour); the photo's white is multiplied away. The app has the same (theme.studioTints). */
const STUDIO = ["#efe1d8", "#ebe3d3", "#e2e6dc", "#e0e5eb", "#e9e0e8", "#f1dfd9"];

/** `compact`: the smaller card of the home page rails (smaller type, no gender line, volumes
 *  under the price). `note`: one more badge («Купили 41 раз»). `tester`: the card of the home
 *  page's «Тестеры»: the tester's price next to the bottle's, struck through. `dark`: the words
 *  on a velvet band. No frame: the bottle in a studio window, the words under it. */
export function ProductCard({
  product,
  compact = false,
  note,
  tester = false,
  dark = false,
}: {
  product: ProductListItem;
  compact?: boolean;
  note?: string;
  tester?: boolean;
  dark?: boolean;
}) {
  const { money } = useCurrency();
  const offer = tester ? product.tester : null;
  const badge = `rounded-sm uppercase tracking-wider ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"}`;
  const text = dark ? "text-pearl" : "";
  const soft = dark ? "text-nacre-muted" : "text-muted";
  return (
    <Link href={`/products/${product.id}`} className={`group flex flex-col ${text}`}>
      {/* The photo is positioned absolutely: a tall portrait photo must not stretch the window. */}
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-lg transition group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-stone-300/40"
        style={{ background: `linear-gradient(#fff 5%, ${STUDIO[product.id % STUDIO.length]})` }}
      >
        <div className={`absolute mix-blend-multiply ${compact ? "inset-3" : "inset-5"}`}>
          <ProductImage src={product.image_url} alt={product.name} seed={product.id} />
        </div>
        {product.type && !(compact && (product.deal || product.is_new || note || offer)) && (
          <span className={`absolute chip ${compact ? "top-1.5 right-1.5 px-1.5 py-0 text-[10px]" : "top-3 right-3"}`}>
            {product.type}
          </span>
        )}
        {(product.deal || product.is_new || note || offer) && (
          <div className={`absolute flex flex-col items-start gap-1 ${compact ? "top-1.5 left-1.5" : "top-3 left-3"}`}>
            {note && <span className={`bg-white font-semibold text-ink ${badge}`}>{note}</span>}
            {offer && (
              <span className={`bg-cherry font-bold text-pearl ${badge}`}>
                −{Math.round((1 - offer.price / offer.bottle_price) * 100)}%
              </span>
            )}
            {product.deal && !offer && (
              <span className={`bg-cherry font-bold text-pearl ${badge}`}>
                {percentOff(product.deal.discount_percent)}
              </span>
            )}
            {product.is_new && !note && !offer && (
              <span className={`bg-white font-semibold text-ink ${badge}`}>
                Выбор Kyko
              </span>
            )}
          </div>
        )}
      </div>
      {compact ? (
        <div className="flex flex-1 flex-col gap-0.5 px-0.5 pt-2.5">
          <div className={`truncate text-[10px] font-semibold tracking-wider uppercase ${soft}`}>
            {product.brand.name}
          </div>
          <div className="line-clamp-2 font-serif text-base leading-tight font-semibold sm:text-lg">
            {product.name}
          </div>
          <div className="mt-auto pt-1.5 text-xs">
            {offer ? (
              <>
                <s className={soft}>{money(offer.bottle_price)}</s>{" "}
                <span className="font-semibold">{money(offer.price)}</span>
              </>
            ) : product.min_price !== null ? (
              <>
                <span className={soft}>от </span>
                <span className="font-semibold">{money(product.min_price)}</span>
              </>
            ) : (
              <span className={soft}>Цена по запросу</span>
            )}
          </div>
          {offer ? (
            <div className={`truncate text-[11px] ${soft}`}>тестер {offer.volume_ml} мл</div>
          ) : (
            product.volumes.length > 0 && (
              <div className={`truncate text-[11px] ${soft}`}>{product.volumes.join(" / ")} мл</div>
            )
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-1 px-0.5 pt-3">
          <div className={`text-[11px] font-semibold tracking-widest uppercase ${soft}`}>
            {product.brand.name}
          </div>
          <div className="font-serif text-xl leading-tight font-semibold group-hover:text-cherry">
            {product.name}
          </div>
          <div className="text-xs text-muted">
            {[product.gender && GENDER_LABELS[product.gender], product.category]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="mt-auto flex items-end justify-between pt-2">
            <div className="text-sm">
              {product.min_price !== null ? (
                <>
                  <span className="text-muted">от </span>
                  <span className="font-semibold">{money(product.min_price)}</span>
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
