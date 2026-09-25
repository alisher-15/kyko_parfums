import { money, plural, volumeLabel } from "@/lib/format";
import type { Quote } from "@/lib/types";

const TIER_NAMES = { retail: "розничной", wholesale: "оптовой", bulk: "крупнооптовой" } as const;

/** Tells a wholesale customer what is missing to unlock a better price tier. */
export function QuoteHints({ quote }: { quote: Quote }) {
  if (quote.hints.length === 0) return null;
  const names = new Map(
    quote.lines.map((l) => [l.variant_id, `${l.product_name}, ${volumeLabel(l.volume_ml, l.is_tester)}`]),
  );
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <ul className="space-y-1">
        {quote.hints.map((h, i) =>
          h.missing_amount !== null ? (
            <li key={i}>
              Добавьте товаров ещё на <b>{money(h.missing_amount)}</b>, чтобы весь заказ был
              пересчитан по {TIER_NAMES[h.tier]} цене.
            </li>
          ) : (
            <li key={i}>
              {names.get(h.variant_id ?? 0)}: ещё <b>{h.missing_qty}</b>{" "}
              {plural(h.missing_qty ?? 0, "штука", "штуки", "штук")} — и позиция пойдёт по{" "}
              {TIER_NAMES[h.tier]} цене.
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
