import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { QuantityStepper } from "@/components/product";
import { Button, Chip, Field, Muted, Notice, Txt } from "@/components/ui";
import type { AdminOrder, VariantSearchItem } from "@/lib/admin-types";
import { ApiError, api, errorText } from "@/lib/api";
import { PAYMENT_LABELS, tenge, volumeLabel } from "@/lib/format";
import { prefs } from "@/lib/storage";
import type { OrderItem, PaymentMethod } from "@/lib/types";
import { colors, fonts } from "@/theme";
import { Block } from "./kit";
import { ScanField, type ScanResult } from "./scan";

const PAYMENTS: PaymentMethod[] = ["cash", "card", "transfer", "other"];

function label(i: OrderItem) {
  return `${i.brand_name} ${i.product_name}, ${volumeLabel(i.volume_ml, i.is_tester)}`;
}

function useSubmit(onDone: (o: AdminOrder) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (path: string, init: { method?: string; body: unknown }) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api<AdminOrder>(path, init));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** Before the order is shipped: reduce quantities or remove lines (as on the website). */
export function EditItemsPanel({
  order,
  onDone,
  onClose,
}: {
  order: AdminOrder;
  onDone: (o: AdminOrder) => void;
  onClose: () => void;
}) {
  const active = order.items.filter((i) => i.quantity > 0);
  const [qty, setQty] = useState<Record<number, number>>(
    Object.fromEntries(active.map((i) => [i.id, i.quantity])),
  );
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  const newTotal = active.reduce((s, i) => s + i.price_applied * (qty[i.id] ?? i.quantity), 0);
  const changed = active.filter((i) => qty[i.id] !== i.quantity);
  const allRemoved = active.every((i) => qty[i.id] === 0);

  return (
    <Block title="Изменить состав" style={{ borderColor: colors.warnLine }}>
      <Muted style={{ fontSize: 13 }}>
        Количество можно только уменьшить. Снятый товар вернётся на склад, цены остальных позиций не
        меняются. Покупатель увидит изменения в своём заказе.
      </Muted>
      {active.map((i) => (
        <View key={i.id} style={styles.line}>
          <View style={{ flex: 1 }}>
            <Txt
              style={[
                { fontFamily: fonts.sansSemi, fontSize: 14 },
                qty[i.id] === 0 && { textDecorationLine: "line-through", color: colors.muted },
              ]}
            >
              {label(i)}
            </Txt>
            <Muted style={{ fontSize: 12 }}>
              {tenge(i.price_applied)} × {i.quantity}
            </Muted>
          </View>
          {qty[i.id] > 0 && (
            <QuantityStepper
              value={qty[i.id]}
              onChange={(v) => setQty({ ...qty, [i.id]: Math.min(v, i.quantity) })}
            />
          )}
          <Button
            small
            kind={qty[i.id] === 0 ? "outline" : "danger"}
            title={qty[i.id] === 0 ? "Вернуть" : "Убрать"}
            onPress={() => setQty({ ...qty, [i.id]: qty[i.id] === 0 ? i.quantity : 0 })}
          />
        </View>
      ))}
      <Field
        label="Причина (увидит покупатель)"
        placeholder="Нет в наличии, клиент передумал…"
        value={reason}
        onChangeText={setReason}
      />
      <Txt style={{ fontSize: 14 }}>
        Новая сумма: <Txt style={{ fontFamily: fonts.sansBold }}>{tenge(newTotal)}</Txt>
        <Muted> (было {tenge(order.total_amount)})</Muted>
      </Txt>
      {allRemoved && <Notice tone="error">Чтобы убрать всё, отмените заказ целиком.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <View style={styles.buttons}>
        <Button kind="outline" title="Закрыть" onPress={onClose} style={{ flex: 1 }} />
        <Button
          title="Сохранить"
          loading={busy}
          disabled={changed.length === 0 || allRemoved}
          style={{ flex: 1 }}
          onPress={() =>
            void run(`/admin/orders/${order.id}/items`, {
              method: "PATCH",
              body: {
                items: changed.map((i) => ({ order_item_id: i.id, quantity: qty[i.id] })),
                reason: reason.trim() || null,
              },
            })
          }
        />
      </View>
    </Block>
  );
}

/** After the goods were handed over: a partial or full return. */
export function ReturnPanel({
  order,
  onDone,
  onClose,
}: {
  order: AdminOrder;
  onDone: (o: AdminOrder) => void;
  onClose: () => void;
}) {
  const returnable = order.items.filter((i) => i.quantity - i.returned_quantity > 0);
  const [qty, setQty] = useState<Record<number, number>>(
    Object.fromEntries(returnable.map((i) => [i.id, 0])),
  );
  const [restock, setRestock] = useState<Record<number, boolean>>(
    Object.fromEntries(returnable.map((i) => [i.id, true])),
  );
  const [method, setMethod] = useState<PaymentMethod>(order.payment_method ?? "cash");
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  const chosen = returnable.filter((i) => qty[i.id] > 0);
  const refund = chosen.reduce((s, i) => s + i.price_applied * qty[i.id], 0);

  return (
    <Block
      title="Возврат"
      style={{ borderColor: colors.dangerLine }}
      right={
        <Button
          small
          kind="outline"
          title="Вернуть всё"
          onPress={() =>
            setQty(
              Object.fromEntries(returnable.map((i) => [i.id, i.quantity - i.returned_quantity])),
            )
          }
        />
      }
    >
      <Muted style={{ fontSize: 13 }}>
        Деньги возвращаются по цене, за которую товар был куплен (с учётом скидки).
      </Muted>
      {returnable.map((i) => {
        const left = i.quantity - i.returned_quantity;
        return (
          <View key={i.id} style={{ gap: 6 }}>
            <View style={styles.line}>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>{label(i)}</Txt>
                <Muted style={{ fontSize: 12 }}>
                  {tenge(i.price_applied)} за шт. · можно вернуть {left} шт.
                </Muted>
              </View>
              <QuantityStepper
                value={qty[i.id]}
                min={0}
                onChange={(v) => setQty({ ...qty, [i.id]: Math.max(0, Math.min(v, left)) })}
              />
            </View>
            {qty[i.id] > 0 && (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Chip
                  label="На склад"
                  active={restock[i.id]}
                  onPress={() => setRestock({ ...restock, [i.id]: true })}
                />
                <Chip
                  label="Брак — списать"
                  active={!restock[i.id]}
                  onPress={() => setRestock({ ...restock, [i.id]: false })}
                />
              </View>
            )}
          </View>
        );
      })}
      <Txt style={styles.label}>Как вернули деньги</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {PAYMENTS.map((p) => (
          <Chip
            key={p}
            label={PAYMENT_LABELS[p]}
            active={method === p}
            onPress={() => setMethod(p)}
          />
        ))}
      </View>
      <Field
        label="Причина"
        placeholder="Не подошёл аромат, брак, повреждена упаковка…"
        value={reason}
        onChangeText={setReason}
      />
      <Txt style={{ fontSize: 14 }}>
        К возврату: <Txt style={{ fontFamily: fonts.sansBold }}>{tenge(refund)}</Txt>
      </Txt>
      {error && <Notice tone="error">{error}</Notice>}
      <View style={styles.buttons}>
        <Button kind="outline" title="Закрыть" onPress={onClose} style={{ flex: 1 }} />
        <Button
          kind="danger"
          title="Оформить возврат"
          loading={busy}
          disabled={chosen.length === 0}
          style={{ flex: 1 }}
          onPress={() =>
            void run(`/admin/orders/${order.id}/returns`, {
              body: {
                items: chosen.map((i) => ({
                  order_item_id: i.id,
                  quantity: qty[i.id],
                  restock: restock[i.id],
                })),
                refund_method: method,
                reason: reason.trim() || null,
              },
            })
          }
        />
      </View>
    </Block>
  );
}

type Picked = Record<number, number>; // order item id -> units scanned

/**
 * Picking an online order with the scanner: every unit is checked against the order, so the
 * wrong volume or an extra unit is caught before the parcel leaves. Stock was already taken at
 * checkout, so picking changes nothing on the server. Progress is kept on the phone.
 */
export function PickingPanel({
  order,
  canShip,
  onShip,
  onClose,
}: {
  order: AdminOrder;
  canShip: boolean;
  onShip: () => void;
  onClose: () => void;
}) {
  const key = `kyko.picking.${order.id}`;
  const [picked, setPicked] = useState<Picked>({});
  const pickedRef = useRef<Picked>({});
  // The progress saved on this phone; a scan before it's read starts from it too.
  useEffect(() => {
    let live = true;
    void prefs.get<Picked>(key, {}).then((p) => {
      if (!live) return;
      pickedRef.current = { ...p, ...pickedRef.current };
      setPicked(pickedRef.current);
    });
    return () => {
      live = false;
    };
  }, [key]);
  const lines = order.items.filter((i) => i.quantity > 0);
  const totalNeeded = lines.reduce((s, i) => s + i.quantity, 0);
  const totalPicked = lines.reduce((s, i) => s + Math.min(picked[i.id] ?? 0, i.quantity), 0);
  const done = totalPicked >= totalNeeded;

  const update = (next: Picked) => {
    pickedRef.current = next;
    void prefs.set(key, next);
    setPicked(next);
  };
  const change = (itemId: number, delta: number) => {
    const prev = pickedRef.current;
    update({ ...prev, [itemId]: Math.max(0, (prev[itemId] ?? 0) + delta) });
  };
  const pickedNow = () =>
    lines.reduce((s, i) => s + Math.min(pickedRef.current[i.id] ?? 0, i.quantity), 0);

  const scan = async (code: string): Promise<ScanResult> => {
    let found: VariantSearchItem;
    try {
      found = await api<VariantSearchItem>(`/admin/barcodes/${encodeURIComponent(code)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return { ok: false, title: `Штрихкод ${code} не найден в каталоге` };
      }
      throw e;
    }
    const volume = volumeLabel(found.volume_ml, found.is_tester);
    const name = `${found.brand_name} ${found.product_name}, ${volume}`;
    const line = lines.find((i) => i.variant_id === found.variant_id);
    if (!line) {
      const same =
        lines.find((i) => i.product_id === found.product_id && i.volume_ml === found.volume_ml) ??
        lines.find((i) => i.product_id === found.product_id);
      if (!same) return { ok: false, title: "Этого товара нет в заказе", detail: name };
      const what = same.volume_ml === found.volume_ml ? "вариант" : "объём";
      return { ok: false, title: `Не тот ${what}: ${volume}`, detail: `В заказе ${label(same)}` };
    }
    const have = pickedRef.current[line.id] ?? 0;
    if (have >= line.quantity) {
      return {
        ok: false,
        title: `Лишняя штука: ${name}`,
        detail: `Нужно ${line.quantity}, уже собрано`,
      };
    }
    change(line.id, 1);
    const left = totalNeeded - pickedNow();
    return {
      ok: true,
      title: name,
      detail: `Собрано ${have + 1} из ${line.quantity}${
        left > 0 ? ` · по заказу осталось ${left} шт.` : " · заказ собран"
      }`,
      undo: async () => change(line.id, -1),
      finished: left === 0,
    };
  };

  return (
    <Block
      title={`Сборка · ${totalPicked} из ${totalNeeded} шт.`}
      right={
        <Pressable accessibilityLabel="Закрыть сборку" onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      }
    >
      <ScanField
        onScan={scan}
        placeholder="Сканируйте товары заказа"
        cameraTitle={`Сборка заказа № ${order.id}`}
      />
      {lines.map((i) => {
        const have = picked[i.id] ?? 0;
        const full = have >= i.quantity;
        return (
          <View key={i.id} style={styles.line}>
            <Ionicons
              name={full ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={full ? colors.ok : colors.faint}
            />
            <Txt style={{ flex: 1, fontFamily: fonts.sansSemi, fontSize: 14 }}>{label(i)}</Txt>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Pressable
                accessibilityLabel="Убрать одну"
                disabled={have === 0}
                onPress={() => change(i.id, -1)}
                style={[styles.round, have === 0 && { opacity: 0.35 }]}
              >
                <Ionicons name="remove" size={16} color={colors.ink} />
              </Pressable>
              <Txt style={[{ fontVariant: ["tabular-nums"] }, full && { color: colors.ok }]}>
                {have} из {i.quantity}
              </Txt>
              <Pressable
                accessibilityLabel="Добавить без сканера"
                disabled={full}
                onPress={() => change(i.id, 1)}
                style={[styles.round, full && { opacity: 0.35 }]}
              >
                <Ionicons name="add" size={16} color={colors.ink} />
              </Pressable>
            </View>
          </View>
        );
      })}
      <View style={styles.buttons}>
        <Button kind="ghost" title="Начать заново" onPress={() => update({})} style={{ flex: 1 }} />
        {done && canShip && (
          <Button
            title="Отметить «Отправлен»"
            onPress={onShip}
            style={{ flex: 2 }}
            testID="pick-ship"
          />
        )}
      </View>
      {done && <Notice tone="success">Заказ собран полностью.</Notice>}
    </Block>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  buttons: { flexDirection: "row", gap: 10 },
  label: { fontFamily: fonts.sansSemi, fontSize: 12, color: colors.muted },
  round: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
});
