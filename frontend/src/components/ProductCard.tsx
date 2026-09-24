import Link from "next/link";
import { GENDER_LABELS, money } from "@/lib/format";
import type { ProductListItem } from "@/lib/types";
import { ProductImage } from "./ui";

export function ProductCard({ product }: { product: ProductListItem }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="group card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-stone-200/70"
    >
      {/* The photo is positioned absolutely: a tall portrait photo must not stretch the square. */}
      <div className="relative aspect-square overflow-hidden bg-white">
        <div className="absolute inset-4">
          <ProductImage src={product.image_url} alt={product.name} seed={product.id} />
        </div>
        {!product.in_stock && product.min_price !== null && (
          <span className="absolute top-3 left-3 chip bg-stone-100">Нет в наличии</span>
        )}
        {product.type && <span className="absolute top-3 right-3 chip">{product.type}</span>}
      </div>
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
    </Link>
  );
}
