import { PAYMENT_LABELS, dateTime, money } from "@/lib/format";
import type { Order } from "@/lib/types";

const DOT: Record<Order["events"][number]["kind"], string> = {
  created: "bg-sky-500",
  status: "bg-stone-400",
  edited: "bg-amber-500",
  returned: "bg-red-500",
};

/** Returns and the order timeline, shared by the admin and the customer order pages. */
export function OrderHistory({ order }: { order: Order }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {order.returns.length > 0 && (
        <div className="card p-5 text-sm">
          <div className="label">Возвраты</div>
          <ul className="space-y-3">
            {order.returns.map((r) => (
              <li key={r.id} className="rounded-lg bg-cream p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold">−{money(r.refund_amount)}</span>
                  <span className="text-xs text-muted">
                    {dateTime(r.created_at)}
                    {r.refund_method ? ` · ${PAYMENT_LABELS[r.refund_method]}` : ""}
                  </span>
                </div>
                <ul className="mt-1 text-xs">
                  {r.items.map((i) => (
                    <li key={i.order_item_id}>
                      {i.product_label} × {i.quantity} — {money(i.amount)}
                      {!i.restock && <span className="text-red-600"> · брак, списано</span>}
                    </li>
                  ))}
                </ul>
                {r.reason && <div className="mt-1 text-xs text-muted">Причина: {r.reason}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {order.events.length > 0 && (
        <div className="card p-5 text-sm">
          <div className="label">История</div>
          <ol className="space-y-3">
            {order.events.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[e.kind]}`} />
                <div>
                  <div>{e.message}</div>
                  <div className="text-xs text-muted">{dateTime(e.created_at)}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
