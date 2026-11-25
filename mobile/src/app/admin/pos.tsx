import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { AdminScreen, Block, KV, Pill, SearchBox, VariantRow } from "@/components/admin/kit";
import { ScanField, type ScanResult } from "@/components/admin/scan";
import { ProductImage, QuantityStepper } from "@/components/product";
import { Button, Chip, Field, Muted, Notice, Txt } from "@/components/ui";
import type { AdminOrder, AdminUser, StoreQuote, VariantSearchItem } from "@/lib/admin-types";
import { ApiError, api, errorText, newNonce, requestKey } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  formatPhone,
  PAYMENT_LABELS,
  ROLE_LABELS,
  tenge,
  TIER_LABELS,
  volumeLabel,
} from "@/lib/format";
import { useApi } from "@/lib/queries";
import { prefs } from "@/lib/storage";
import type { Page, PaymentMethod, PriceTier } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

interface Line {
  item: VariantSearchItem;
  quantity: number;
  discount: string; // percent, as typed
}

const TIERS: PriceTier[] = ["retail", "wholesale", "bulk"];
const PAYMENTS: PaymentMethod[] = ["cash", "card", "transfer", "other"];
// «Показать себестоимость» is remembered on this phone; off by default, customers may see it.
const SHOW_COST_KEY = "kyko.pos.showCost";

function marginText(total: number, cost: number): string {
  const margin = total - cost;
  return `маржа ${tenge(margin)}${total > 0 ? ` (${Math.round((margin / total) * 100)}%)` : ""}`;
}

export default function PosScreen() {
  return (
    <AdminScreen title="Продажа в магазине" area="till">
      <Pos />
    </AdminScreen>
  );
}

function Pos() {
  const queryClient = useQueryClient();
  const owner = useAuth().user?.role === "admin";
  const [lines, setLines] = useState<Line[]>([]);
  const linesRef = useRef<Line[]>([]);
  const [tier, setTier] = useState<PriceTier | "">("");
  const [customer, setCustomer] = useState<AdminUser | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [comment, setComment] = useState("");
  const [discountAll, setDiscountAll] = useState("");
  // The quote with the receipt it was made for: until the quote of the receipt as it is now
  // comes back, the totals are dimmed and the sale can't be recorded.
  const [quoted, setQuoted] = useState<{ key: string; quote: StoreQuote } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One sale's key, made on its first «Провести» and renewed once it is recorded.
  const nonce = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<AdminOrder | null>(null);
  const [results, setResults] = useState<VariantSearchItem[]>([]);
  const [costOn, setCostOn] = useState(false);
  const showCost = owner && costOn;

  useEffect(() => {
    void prefs.get<boolean>(SHOW_COST_KEY, false).then(setCostOn);
  }, []);

  const items = lines.map((l) => ({
    variant_id: l.item.variant_id,
    quantity: l.quantity,
    discount_percent: Number(l.discount.replace(",", ".")) || 0,
  }));
  const quoteKey = JSON.stringify([items, tier || null, customer?.id ?? null]);
  const quote = quoted?.quote ?? null;
  const fresh = quoted?.key === quoteKey;

  // The server prices the draft receipt (a moment after each change).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const [qItems, price_tier, customer_id] = JSON.parse(quoteKey);
      api<StoreQuote>("/admin/store/quote", { body: { items: qItems, price_tier, customer_id } })
        .then((q) => {
          if (cancelled) return;
          setQuoted({ key: quoteKey, quote: q });
          setQuoteError(null);
        })
        .catch((e: unknown) => !cancelled && setQuoteError(errorText(e)));
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
  const update = (variantId: number, patch: Partial<Line>) =>
    commit(linesRef.current.map((l) => (l.item.variant_id === variantId ? { ...l, ...patch } : l)));
  const remove = (variantId: number) =>
    commit(linesRef.current.filter((l) => l.item.variant_id !== variantId));

  /** A found product goes to the receipt; the result offers −/+ and undo. */
  const addItem = (item: VariantSearchItem): ScanResult => {
    setDone(null);
    const name = `${item.brand_name} ${item.product_name}, ${volumeLabel(item.volume_ml, item.is_tester)}`;
    const prev = linesRef.current;
    const before = prev.find((l) => l.item.variant_id === item.variant_id)?.quantity ?? 0;
    if (before >= item.stock) {
      return item.stock > 0
        ? {
            ok: false,
            title: `Больше нет на складе: ${name}`,
            detail: `На складе ${item.stock} шт., все уже в чеке`,
          }
        : { ok: false, title: `Нет на складе: ${name}` };
    }
    commit(
      before > 0
        ? prev.map((l) =>
            l.item.variant_id === item.variant_id ? { ...l, quantity: before + 1 } : l,
          )
        : [...prev, { item, quantity: 1, discount: discountAll }],
    );
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

  /** A barcode first; otherwise a name search, where a single hit goes to the receipt. */
  const findAndAdd = async (term: string): Promise<ScanResult> => {
    try {
      const item = await api<VariantSearchItem>(`/admin/barcodes/${encodeURIComponent(term)}`);
      setResults([]);
      return addItem(item);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
    const found = await api<VariantSearchItem[]>("/admin/store/variants", { query: { q: term } });
    if (found.length === 1) {
      setResults([]);
      return addItem(found[0]);
    }
    setResults(found);
    return found.length
      ? { ok: false, title: "Найдено несколько товаров", detail: "Выберите нужный в списке ниже" }
      : { ok: false, title: `Не найдено: ${term}` };
  };

  const reset = () => {
    commit([]);
    setTier("");
    setCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setPayment("cash");
    setComment("");
    setDiscountAll("");
    setError(null);
    setResults([]);
  };

  const submit = async () => {
    if (!quote || !fresh) return;
    setBusy(true);
    setError(null);
    nonce.current ??= newNonce();
    try {
      const order = await api<AdminOrder>("/admin/store/sales", {
        body: {
          items,
          price_tier: tier || null,
          customer_id: customer?.id ?? null,
          customer_name: customer ? null : customerName,
          customer_phone: customer ? null : customerPhone,
          payment_method: payment,
          comment,
          // The sum on the button: a receipt that came to another total is refused, not recorded.
          expected_total: quote.total,
          request_key: requestKey(nonce.current, quoteKey),
        },
      });
      nonce.current = null;
      setDone(order);
      reset();
      void queryClient.invalidateQueries({ queryKey: ["/admin/orders"] });
      void queryClient.invalidateQueries({ queryKey: ["/admin/stats"] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const quoteLine = new Map(quote?.lines.map((l) => [l.variant_id, l]));
  const maxDiscount = quote?.max_discount_percent ?? 0;
  const costed = quote?.lines.filter((l) => l.cost_price !== null) ?? [];
  const costedCost = costed.reduce((s, l) => s + (l.cost_price ?? 0) * l.quantity, 0);
  const costedTotal = costed.reduce((s, l) => s + l.line_total, 0);
  const uncosted = (quote?.lines.length ?? 0) - costed.length;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        {done && (
          <Notice tone="success">
            <View style={{ gap: 6 }}>
              <Txt style={{ color: colors.ok }}>
                Продажа № {done.id} проведена на {tenge(done.total_amount)}
                {done.payment_method ? ` · ${PAYMENT_LABELS[done.payment_method]}` : ""}. Остатки
                списаны.
              </Txt>
              <Button
                small
                kind="outline"
                title="Открыть продажу"
                style={{ alignSelf: "flex-start" }}
                onPress={() =>
                  router.push({ pathname: "/admin/orders/[id]", params: { id: done.id } })
                }
              />
            </View>
          </Notice>
        )}

        <Block title="Товар">
          <ScanField
            onScan={findAndAdd}
            placeholder="Штрихкод или название"
            cameraTitle="Продажа в магазине"
          />
          {results.map((r) => (
            <VariantRow
              key={r.variant_id}
              item={r}
              showCost={showCost}
              testID={`pos-pick-${r.variant_id}`}
              onPress={() => {
                setResults([]);
                addItem(r);
              }}
            />
          ))}
        </Block>

        <Block
          title="Чек"
          right={
            lines.length > 0 ? (
              <Button small kind="ghost" title="Очистить" onPress={reset} />
            ) : undefined
          }
        >
          {owner && (
            <View style={styles.switchRow}>
              <Txt style={{ fontSize: 13, color: colors.muted }}>Показать себестоимость</Txt>
              <Switch
                value={costOn}
                onValueChange={(v) => {
                  setCostOn(v);
                  void prefs.set(SHOW_COST_KEY, v);
                }}
                trackColor={{ true: colors.gold, false: colors.line }}
                thumbColor={colors.white}
                accessibilityLabel="Показать себестоимость"
              />
            </View>
          )}
          {lines.length === 0 ? (
            <Muted style={{ textAlign: "center", paddingVertical: 12 }}>
              Отсканируйте штрихкод или найдите товар по названию — он появится здесь.
            </Muted>
          ) : (
            lines.map((l) => {
              const q = quoteLine.get(l.item.variant_id);
              const discount = Number(l.discount.replace(",", ".")) || 0;
              return (
                <View
                  key={l.item.variant_id}
                  style={styles.line}
                  testID={`pos-line-${l.item.variant_id}`}
                >
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <ProductImage
                      uri={l.item.image_url}
                      seed={l.item.product_id}
                      style={styles.thumb}
                      iconSize={18}
                    />
                    <View style={{ flex: 1 }}>
                      <Muted style={{ fontSize: 11 }}>{l.item.brand_name}</Muted>
                      <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>
                        {l.item.product_name}, {volumeLabel(l.item.volume_ml, l.item.is_tester)}
                      </Txt>
                      <Txt
                        style={{
                          fontSize: 12,
                          color: q && !q.available ? colors.danger : colors.muted,
                        }}
                      >
                        На складе: {q?.stock ?? l.item.stock} шт.
                        {l.item.sku ? ` · ${l.item.sku}` : ""}
                      </Txt>
                      {showCost && q && (
                        <Txt
                          style={{
                            fontSize: 12,
                            color:
                              q.cost_price !== null && q.line_total < q.cost_price * q.quantity
                                ? colors.danger
                                : colors.muted,
                          }}
                        >
                          {q.cost_price === null
                            ? "Себестоимость не указана"
                            : `Себест. ${tenge(q.cost_price)} · ${marginText(q.line_total, q.cost_price * q.quantity)}`}
                        </Txt>
                      )}
                    </View>
                    <Pressable
                      accessibilityLabel="Убрать из чека"
                      hitSlop={8}
                      onPress={() => remove(l.item.variant_id)}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                  <View style={styles.lineControls}>
                    <QuantityStepper
                      value={l.quantity}
                      onChange={(n) =>
                        update(l.item.variant_id, {
                          quantity: Math.min(n, Math.max(q?.stock ?? l.item.stock, 1)),
                        })
                      }
                    />
                    <View style={styles.discount}>
                      <Muted style={{ fontSize: 12 }}>Скидка</Muted>
                      <TextInput
                        value={l.discount}
                        onChangeText={(t) =>
                          update(l.item.variant_id, { discount: t.replace(/[^\d.,]/g, "") })
                        }
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.faint}
                        style={[
                          styles.discountInput,
                          discount > maxDiscount && { borderColor: colors.danger },
                        ]}
                        accessibilityLabel="Скидка, %"
                      />
                      <Muted style={{ fontSize: 12 }}>%</Muted>
                    </View>
                    <View style={{ marginLeft: "auto", alignItems: "flex-end" }}>
                      <Txt style={{ fontFamily: fonts.sansBold }}>{tenge(q?.line_total)}</Txt>
                      {q && q.unit_price < q.list_price && (
                        <Muted style={{ fontSize: 11, textDecorationLine: "line-through" }}>
                          {tenge(q.list_price * q.quantity)}
                        </Muted>
                      )}
                      {q?.promotion_title && (
                        <Txt style={{ fontSize: 11, color: colors.gold }}>
                          Акция «{q.promotion_title}»
                        </Txt>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </Block>

        <CustomerPicker customer={customer} onChange={setCustomer} />
        {!customer && (
          <Block>
            <Field
              label="Имя покупателя (необязательно)"
              value={customerName}
              onChangeText={setCustomerName}
            />
            <Field
              label="Телефон (необязательно)"
              value={customerPhone}
              onChangeText={(t) => setCustomerPhone(formatPhone(t))}
              keyboardType="phone-pad"
            />
          </Block>
        )}

        <Block>
          <Txt style={styles.label}>Цена</Txt>
          <View style={styles.chips}>
            <Chip
              label={`Авто${quote && tier === "" ? ` (${TIER_LABELS[quote.price_tier].toLowerCase()})` : ""}`}
              active={tier === ""}
              onPress={() => setTier("")}
            />
            {TIERS.map((t) => (
              <Chip
                key={t}
                label={t === "retail" ? "Розница" : t === "wholesale" ? "Опт" : "Кр. опт"}
                active={tier === t}
                onPress={() => setTier(t)}
              />
            ))}
          </View>
          <Txt style={styles.label}>Оплата</Txt>
          <View style={styles.chips}>
            {PAYMENTS.map((p) => (
              <Chip
                key={p}
                label={PAYMENT_LABELS[p]}
                active={payment === p}
                onPress={() => setPayment(p)}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
            <Field
              label={`Скидка на весь чек (до ${maxDiscount}%)`}
              value={discountAll}
              onChangeText={(t) => setDiscountAll(t.replace(/[^\d.,]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="0"
              style={{ flex: 1 }}
            />
            <Button
              small
              kind="outline"
              title="Применить"
              disabled={lines.length === 0}
              style={{ minHeight: 48 }}
              onPress={() => commit(linesRef.current.map((l) => ({ ...l, discount: discountAll })))}
            />
          </View>
          <Field label="Комментарий" value={comment} onChangeText={setComment} />
        </Block>

        <Block style={fresh || lines.length === 0 ? undefined : { opacity: 0.6 }}>
          <KV label="По прайсу" value={tenge(quote?.subtotal ?? 0)} />
          {!!quote?.discount_total && (
            <KV label="Скидка" value={`−${tenge(quote.discount_total)}`} color={colors.ok} />
          )}
          <View style={styles.total}>
            <Txt style={styles.totalText}>К оплате</Txt>
            <Txt style={styles.totalText} testID="pos-total">
              {tenge(quote?.total ?? 0)}
            </Txt>
          </View>
          {showCost && costed.length > 0 && (
            <Muted style={{ fontSize: 12, textAlign: "right" }}>
              Себестоимость {tenge(costedCost)} · {marginText(costedTotal, costedCost)}
              {uncosted > 0 ? ` · у ${uncosted} поз. нет себестоимости` : ""}
            </Muted>
          )}
          {quote && quote.errors.length > 0 && lines.length > 0 && (
            <Notice tone="error">{quote.errors.join("\n")}</Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {quoteError && <Notice tone="error">Не удалось посчитать чек: {quoteError}</Notice>}
          <Button
            testID="pos-submit"
            title={
              busy
                ? "Проводим…"
                : `Провести продажу${quote?.total ? ` · ${tenge(quote.total)}` : ""}`
            }
            loading={busy}
            disabled={!fresh || !quote?.can_submit || lines.length === 0}
            onPress={() => void submit()}
          />
          <Muted style={{ fontSize: 12, textAlign: "center" }}>
            Остатки спишутся сразу. Фискальный чек пробейте на кассе.
          </Muted>
        </Block>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Link the sale to a customer: a wholesale customer gets their price, the sale goes to their history. */
function CustomerPicker({
  customer,
  onChange,
}: {
  customer: AdminUser | null;
  onChange: (u: AdminUser | null) => void;
}) {
  const [q, setQ] = useState("");
  const { data } = useApi<Page<AdminUser>>(q.length >= 2 ? "/admin/users" : null, {
    q,
    page_size: 6,
  });
  if (customer) {
    return (
      <Block
        title="Покупатель"
        right={<Button small kind="ghost" title="Убрать" onPress={() => onChange(null)} />}
      >
        <Txt style={{ fontFamily: fonts.sansSemi }}>{customer.full_name ?? customer.email}</Txt>
        <Muted style={{ fontSize: 12 }}>
          {customer.email}
          {customer.phone ? ` · ${customer.phone}` : ""}
        </Muted>
        <Pill tone="gold" label={ROLE_LABELS[customer.role]} />
      </Block>
    );
  }
  return (
    <Block title="Покупатель">
      <SearchBox value={q} onChange={setQ} placeholder="Телефон, email, имя или компания" />
      <Muted style={{ fontSize: 12 }}>
        Необязательно. Для оптового клиента подставится его цена, продажа попадёт в его историю.
      </Muted>
      {q.length >= 2 &&
        data?.items.map((u) => (
          <Pressable
            key={u.id}
            accessibilityRole="button"
            onPress={() => {
              onChange(u);
              setQ("");
            }}
            style={({ pressed }) => [
              styles.userRow,
              pressed && { backgroundColor: colors.goldSoft },
            ]}
          >
            <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>{u.full_name ?? u.email}</Txt>
            <Muted style={{ fontSize: 12 }}>
              {u.email}
              {u.phone ? ` · ${u.phone}` : ""} · {ROLE_LABELS[u.role]}
            </Muted>
          </Pressable>
        ))}
    </Block>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  line: {
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  lineControls: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, overflow: "hidden" },
  discount: { flexDirection: "row", alignItems: "center", gap: 4 },
  discountInput: {
    width: 56,
    height: 40,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    textAlign: "right",
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  label: { fontFamily: fonts.sansSemi, fontSize: 12, color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  totalText: { fontFamily: fonts.sansBold, fontSize: 20 },
  userRow: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 10,
    backgroundColor: colors.white,
  },
});
