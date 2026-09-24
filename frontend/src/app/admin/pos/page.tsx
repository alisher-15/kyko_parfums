"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { CameraScanner } from "@/components/admin/CameraScanner";
import { ScanResultCard, type ScanResult } from "@/components/admin/ScanResultCard";
import { TrashIcon } from "@/components/icons";
import { ErrorBox, ProductImage, QuantityInput, SuccessBox } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { PAYMENT_LABELS, ROLE_LABELS, TIER_LABELS, money } from "@/lib/format";
import { scanFeedback, unlockAudio } from "@/lib/scan-feedback";
import { useMedia } from "@/lib/use-media";
import type {
  AdminOrder,
  AdminUser,
  Page,
  PaymentMethod,
  PriceTier,
  StoreQuote,
  VariantSearchItem,
} from "@/lib/types";

interface Line {
  item: VariantSearchItem;
  quantity: number;
  discount: string; // percent, kept as typed
}

const TIERS: PriceTier[] = ["retail", "wholesale", "bulk"];
const PAYMENTS: PaymentMethod[] = ["cash", "card", "transfer", "other"];

export default function PosPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [tier, setTier] = useState<PriceTier | "">("");
  const [customer, setCustomer] = useState<AdminUser | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [comment, setComment] = useState("");
  const [quote, setQuote] = useState<StoreQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<AdminOrder | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // The latest receipt right away: scans can come faster than re-renders.
  const linesRef = useRef<Line[]>([]);

  const payload = {
    items: lines.map((l) => ({
      variant_id: l.item.variant_id,
      quantity: l.quantity,
      discount_percent: Number(l.discount.replace(",", ".")) || 0,
    })),
    price_tier: tier || null,
    customer_id: customer?.id ?? null,
    customer_name: customer ? null : customerName,
    customer_phone: customer ? null : customerPhone,
    payment_method: payment,
    comment,
  };
  const quoteKey = JSON.stringify([payload.items, payload.price_tier, payload.customer_id]);

  // Server-side pricing of the draft receipt (debounced).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const [items, price_tier, customer_id] = JSON.parse(quoteKey);
      api<StoreQuote>("/admin/store/quote", { body: { items, price_tier, customer_id } })
        .then((q) => !cancelled && setQuote(q))
        .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [quoteKey]);

  const commit = (next: Line[]) => {
    linesRef.current = next;
    setLines(next);
  };

  const focusSearch = () => {
    // On phones focusing the field would pop up the keyboard over the receipt.
    if (!window.matchMedia("(pointer: coarse)").matches) searchRef.current?.focus();
  };

  const add = (item: VariantSearchItem) => {
    setDone(null);
    const prev = linesRef.current;
    const existing = prev.find((l) => l.item.variant_id === item.variant_id);
    commit(
      existing
        ? prev.map((l) =>
            l === existing ? { ...l, quantity: Math.min(l.quantity + 1, Math.max(item.stock, 1)) } : l,
          )
        : [...prev, { item, quantity: 1, discount: "" }],
    );
    focusSearch();
  };

  const update = (variantId: number, patch: Partial<Line>) =>
    commit(linesRef.current.map((l) => (l.item.variant_id === variantId ? { ...l, ...patch } : l)));

  const remove = (variantId: number) =>
    commit(linesRef.current.filter((l) => l.item.variant_id !== variantId));

  /** A scanned product goes to the receipt; the result offers −/+ and undo. */
  const scanned = (item: VariantSearchItem): ScanResult => {
    const name = `${item.brand_name} ${item.product_name}, ${item.volume_ml} мл`;
    const before = linesRef.current.find((l) => l.item.variant_id === item.variant_id)?.quantity ?? 0;
    if (before >= item.stock) {
      return item.stock > 0
        ? { ok: false, title: `Больше нет на складе: ${name}`, detail: `На складе ${item.stock} шт., все уже в чеке` }
        : { ok: false, title: `Нет на складе: ${name}` };
    }
    add(item);
    return {
      ok: true,
      title: name,
      detail: "Добавлено в чек",
      quantity: {
        label: "В чеке, шт.",
        value: before + 1,
        min: 1,
        max: item.stock,
        set: async (n) => {
          update(item.variant_id, { quantity: n });
          return n;
        },
      },
      undo: async () => {
        if (before > 0) update(item.variant_id, { quantity: before });
        else remove(item.variant_id);
      },
    };
  };

  const reset = () => {
    commit([]);
    setTier("");
    setCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setPayment("cash");
    setComment("");
    setError(null);
    focusSearch();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const order = await api<AdminOrder>("/admin/store/sales", { body: payload });
      setDone(order);
      reset();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const quoteLine = new Map(quote?.lines.map((l) => [l.variant_id, l]));
  const maxDiscount = quote?.max_discount_percent ?? 0;

  return (
    <>
      <AdminHeader title="Продажа в магазине" />
      {done && (
        <div className="mb-4">
          <SuccessBox>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Продажа № {done.id} проведена на {money(done.total_amount)}
                {done.payment_method ? ` · ${PAYMENT_LABELS[done.payment_method]}` : ""}. Остатки
                списаны.
              </span>
              <Link href={`/admin/orders/${done.id}`} className="font-semibold underline">
                Открыть продажу
              </Link>
            </div>
          </SuccessBox>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <ProductSearch inputRef={searchRef} onPick={add} onScanned={scanned} />

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-2xl font-semibold">Чек</h2>
              {lines.length > 0 && (
                <button className="text-xs text-muted hover:text-red-600" onClick={reset}>
                  Очистить
                </button>
              )}
            </div>
            {lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Найдите товар по названию или отсканируйте штрихкод — он появится здесь.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {lines.map((l) => {
                  const q = quoteLine.get(l.item.variant_id);
                  const discount = Number(l.discount.replace(",", ".")) || 0;
                  return (
                    <li key={l.item.variant_id} className="flex flex-wrap gap-3 py-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white">
                        <ProductImage
                          src={l.item.image_url}
                          alt={l.item.product_name}
                          seed={l.item.product_id}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted">{l.item.brand_name}</div>
                        <div className="font-semibold">
                          {l.item.product_name}, {l.item.volume_ml} мл
                        </div>
                        <div className={`text-xs ${q && !q.available ? "text-red-600" : "text-muted"}`}>
                          На складе: {q?.stock ?? l.item.stock} шт.
                          {l.item.sku ? ` · ${l.item.sku}` : ""}
                        </div>
                      </div>
                      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                        <QuantityInput
                          value={l.quantity}
                          max={Math.max(q?.stock ?? l.item.stock, 1)}
                          onChange={(quantity) => update(l.item.variant_id, { quantity })}
                        />
                        <label className="flex items-center gap-1 text-xs text-muted">
                          Скидка
                          <input
                            className={`input w-16 px-2 py-1 text-right ${
                              discount > maxDiscount ? "border-red-400" : ""
                            }`}
                            inputMode="decimal"
                            placeholder="0"
                            value={l.discount}
                            onChange={(e) =>
                              update(l.item.variant_id, {
                                discount: e.target.value.replace(/[^\d.,]/g, ""),
                              })
                            }
                          />
                          %
                        </label>
                        <div className="ml-auto min-w-24 text-right">
                          <div className="font-bold">{money(q?.line_total)}</div>
                          {q && q.discount_percent > 0 && (
                            <div className="text-xs text-muted line-through">
                              {money(q.list_price * q.quantity)}
                            </div>
                          )}
                          <div className="text-[11px] text-muted">
                            {money(q?.unit_price)} × {l.quantity}
                          </div>
                        </div>
                        <button
                          className="text-muted hover:text-red-600"
                          onClick={() => remove(l.item.variant_id)}
                          aria-label="Убрать из чека"
                        >
                          <TrashIcon width={16} height={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <CustomerPicker customer={customer} onChange={setCustomer} />
          {!customer && (
            <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-1">
              <label className="block">
                <span className="label">Имя покупателя (необязательно)</span>
                <input
                  className="input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">Телефон (необязательно)</span>
                <input
                  className="input"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </label>
            </div>
          )}

          <div className="card space-y-4 p-4">
            <div>
              <span className="label">Цена</span>
              <div className="flex flex-wrap gap-1.5">
                <Choice active={tier === ""} onClick={() => setTier("")}>
                  Авто{quote && tier === "" ? ` (${TIER_LABELS[quote.price_tier].toLowerCase()})` : ""}
                </Choice>
                {TIERS.map((t) => (
                  <Choice key={t} active={tier === t} onClick={() => setTier(t)}>
                    {t === "retail" ? "Розница" : t === "wholesale" ? "Опт" : "Кр. опт"}
                  </Choice>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Оплата</span>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENTS.map((p) => (
                  <Choice key={p} active={payment === p} onClick={() => setPayment(p)}>
                    {PAYMENT_LABELS[p]}
                  </Choice>
                ))}
              </div>
            </div>
            <DiscountAll
              max={maxDiscount}
              disabled={lines.length === 0}
              onApply={(d) => commit(linesRef.current.map((l) => ({ ...l, discount: d })))}
            />
            <label className="block">
              <span className="label">Комментарий</span>
              <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
          </div>

          <div className="card p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted">По прайсу</span>
              <span>{money(quote?.subtotal ?? 0)}</span>
            </div>
            {!!quote?.discount_total && (
              <div className="mt-1 flex justify-between text-sm text-emerald-700">
                <span>Скидка</span>
                <span>−{money(quote.discount_total)}</span>
              </div>
            )}
            <div className="mt-3 flex justify-between border-t border-line pt-3 text-xl font-bold">
              <span>К оплате</span>
              <span>{money(quote?.total ?? 0)}</span>
            </div>
            {quote && quote.errors.length > 0 && lines.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-red-600">
                {quote.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {error && (
              <div className="mt-3">
                <ErrorBox>{error}</ErrorBox>
              </div>
            )}
            <button
              className="btn btn-primary mt-4 w-full py-3 text-base"
              disabled={busy || !quote?.can_submit || lines.length === 0}
              onClick={submit}
            >
              {busy ? "Проводим…" : `Провести продажу${quote?.total ? ` · ${money(quote.total)}` : ""}`}
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              Остатки спишутся сразу. Фискальный чек пробейте на кассе.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm ${
        active ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** Search by name/brand, or scan a barcode: the scanner types the code and presses Enter, or use
 * the phone camera (on phones it comes first). A scanned product goes straight to the receipt. */
function ProductSearch({
  inputRef,
  onPick,
  onScanned,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (item: VariantSearchItem) => void;
  onScanned: (item: VariantSearchItem) => ScanResult;
}) {
  const phone = useMedia("(pointer: coarse)");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<VariantSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [scanResult, setScanResult] = useState<{ seq: number; value: ScanResult } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!term) {
        setResults([]);
        return;
      }
      api<VariantSearchItem[]>("/admin/store/variants", { query: { q: term } })
        .then((r) => {
          if (!cancelled) {
            setResults(r);
            setError(null);
          }
        })
        .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const pick = (item: VariantSearchItem) => {
    onPick(item);
    setQ("");
    setResults([]);
  };

  /** A barcode first; if it is not one, a name search that takes a single hit. */
  const findAndAdd = async (term: string): Promise<ScanResult> => {
    const code = term.replace(/\s+/g, "");
    try {
      const item = await api<VariantSearchItem>(`/admin/barcodes/${encodeURIComponent(code)}`);
      setQ("");
      setResults([]);
      return onScanned(item);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
    const found = await api<VariantSearchItem[]>("/admin/store/variants", { query: { q: term } });
    if (found.length === 1) {
      setQ("");
      setResults([]);
      return onScanned(found[0]);
    }
    setResults(found);
    return found.length
      ? { ok: false, title: "Найдено несколько товаров", detail: "Выберите нужный в списке" }
      : { ok: false, title: `Не найдено: ${term}` };
  };

  /** Run a scan and keep its result under the field (also after the camera is closed). */
  const scan = async (term: string): Promise<ScanResult> => {
    let res: ScanResult;
    try {
      res = await findAndAdd(term);
    } catch (e) {
      res = { ok: false, title: e instanceof Error ? e.message : String(e) };
    }
    seq.current += 1;
    setScanResult({ seq: seq.current, value: res });
    return res;
  };

  const onKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    scanFeedback((await scan(term)).ok);
  };

  const openCamera = () => {
    unlockAudio();
    setCamera(true);
  };

  return (
    <div className="card space-y-2 p-4">
      <span className="label">Товар</span>
      {phone && (
        <button type="button" className="btn btn-primary w-full py-4 text-base" onClick={openCamera}>
          Сканировать камерой
        </button>
      )}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          autoFocus={!phone}
          className="input py-3 text-base"
          placeholder={phone ? "или название, бренд, штрихкод" : "Название, бренд или штрихкод"}
          aria-label="Название, бренд или штрихкод"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          enterKeyHint="search"
        />
        {!phone && (
          <button type="button" className="btn btn-outline shrink-0" onClick={openCamera}>
            Камера
          </button>
        )}
      </div>
      {scanResult && <ScanResultCard key={scanResult.seq} result={scanResult.value} />}
      {camera && (
        <CameraScanner
          title="Продажа в магазине"
          onScan={scan}
          onClose={() => {
            setCamera(false);
            if (!phone) inputRef.current?.focus();
          }}
        />
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {q.trim() && results.length === 0 && !error && (
        <p className="mt-3 text-sm text-muted">Ничего не найдено</p>
      )}
      {results.length > 0 && (
        <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {results.map((r) => (
            <li key={r.variant_id}>
              <button
                type="button"
                onClick={() => pick(r)}
                disabled={r.stock <= 0}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-cream disabled:opacity-50"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-white">
                  <ProductImage src={r.image_url} alt={r.product_name} seed={r.product_id} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {r.brand_name} {r.product_name}, {r.volume_ml} мл
                  </div>
                  <div className="text-xs text-muted">
                    {r.stock > 0 ? `${r.stock} шт.` : "нет на складе"}
                    {r.sku ? ` · ${r.sku}` : ""}
                    {!r.product_active ? " · скрыт на сайте" : ""}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold">{money(r.retail_price)}</div>
                  {r.wholesale_price !== null && (
                    <div className="text-muted">опт {money(r.wholesale_price)}</div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomerPicker({
  customer,
  onChange,
}: {
  customer: AdminUser | null;
  onChange: (u: AdminUser | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminUser[]>([]);

  useEffect(() => {
    const term = q.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      if (term.length < 2) {
        setResults([]);
        return;
      }
      api<Page<AdminUser>>("/admin/users", { query: { q: term, page_size: 6 } })
        .then((r) => !cancelled && setResults(r.items))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  if (customer) {
    return (
      <div className="card flex items-start justify-between gap-3 p-4">
        <div>
          <span className="label">Покупатель</span>
          <div className="font-semibold">{customer.full_name ?? customer.email}</div>
          <div className="text-xs text-muted">
            {customer.email}
            {customer.phone ? ` · ${customer.phone}` : ""}
          </div>
          <span className="chip mt-1">{ROLE_LABELS[customer.role]}</span>
        </div>
        <button className="text-xs text-muted hover:text-ink" onClick={() => onChange(null)}>
          Убрать
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <label className="block">
        <span className="label">Покупатель — найти клиента</span>
        <input
          className="input"
          placeholder="Телефон, email, имя или компания"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="mt-1 text-xs text-muted">
        Необязательно. Для оптового клиента подставится его цена, продажа попадёт в его историю.
      </p>
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-cream"
                onClick={() => {
                  onChange(u);
                  setQ("");
                  setResults([]);
                }}
              >
                <div className="font-semibold">{u.full_name ?? u.email}</div>
                <div className="text-xs text-muted">
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ""} · {ROLE_LABELS[u.role]}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DiscountAll({
  max,
  disabled,
  onApply,
}: {
  max: number;
  disabled: boolean;
  onApply: (d: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div>
      <span className="label">Скидка на весь чек (до {max}%)</span>
      <div className="flex gap-2">
        <input
          className="input"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
        />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={disabled}
          onClick={() => onApply(value)}
        >
          Применить
        </button>
      </div>
    </div>
  );
}
