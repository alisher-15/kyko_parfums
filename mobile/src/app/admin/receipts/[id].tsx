import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  AdminScreen,
  Block,
  Pill,
  VariantSearch,
  confirm,
  moneyText,
  parseMoney,
} from "@/components/admin/kit";
import { ScanField, type ScanResult } from "@/components/admin/scan";
import { UnknownBarcode } from "@/components/admin/unknown";
import { Button, Chip, ErrorState, Field, Loader, Muted, Notice, Txt } from "@/components/ui";
import type { Receipt, ReceiptLine } from "@/lib/admin-types";
import { ApiError, api, errorText } from "@/lib/api";
import { dateTime, tenge, volumeLabel } from "@/lib/format";
import { useApi } from "@/lib/queries";
import { colors, fonts, radius } from "@/theme";

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AdminScreen title={`Приёмка № ${id}`} area="stock">
      <ReceiptView id={Number(id)} />
    </AdminScreen>
  );
}

/** «Канат: 9 000 ₸ · Эрик: —»: what each supplier's price list asks for the volume. */
function supplierPrices(line: ReceiptLine): string {
  return line.supplier_prices
    .map((p) => `${p.supplier}: ${p.price === null ? "—" : tenge(p.price)}`)
    .join(" · ");
}

function ReceiptView({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const base = `/admin/receipts/${id}`;
  const loaded = useApi<Receipt>(base);
  const [doc, setDoc] = useState<Receipt | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const receipt = doc ?? loaded.data;

  if (loaded.error && !receipt)
    return <ErrorState message={loaded.error.message} onRetry={() => void loaded.refetch()} />;
  if (!receipt) return <Loader />;
  const draft = receipt.status === "draft";

  const keep = (r: Receipt) => {
    setDoc(r);
    queryClient.setQueryData([base, null], r);
    void queryClient.invalidateQueries({ queryKey: ["/admin/receipts"] });
  };
  const run = async (fn: () => Promise<Receipt | void>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r) keep(r);
      if (okText) setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const scan = async (code: string): Promise<ScanResult> => {
    let r: Receipt;
    try {
      r = await api<Receipt>(`${base}/scan`, { body: { code } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setUnknown(code);
        return {
          ok: false,
          title: `Штрихкод ${code} не найден`,
          detail: "Его нет в каталоге. Привяжите код к товару — в следующий раз он найдётся сам.",
          action: { label: "Привязать к товару", run: () => setUnknown(code) },
        };
      }
      throw e;
    }
    keep(r);
    setUnknown(null);
    const line = r.items.find((i) => i.id === r.touched_line_id);
    if (!line) return { ok: true, title: "Добавлено в приёмку" };
    const lineUrl = `${base}/lines/${line.id}`;
    const before = line.quantity - 1; // a scan adds one unit
    return {
      ok: true,
      title: line.label,
      detail: [
        line.cost_price !== null
          ? `Закупочная цена ${tenge(line.cost_price)}`
          : "Закупочная цена не указана",
        supplierPrices(line),
      ]
        .filter(Boolean)
        .join(" · "),
      quantity: {
        label: "В приёмке, шт.",
        value: line.quantity,
        min: 1,
        set: async (n) => {
          const updated = await api<Receipt>(lineUrl, { method: "PATCH", body: { quantity: n } });
          keep(updated);
          return updated.items.find((i) => i.id === line.id)?.quantity ?? n;
        },
      },
      undo: async () => {
        keep(
          await api<Receipt>(
            lineUrl,
            before > 0 ? { method: "PATCH", body: { quantity: before } } : { method: "DELETE" },
          ),
        );
      },
    };
  };

  const post = async () => {
    if (
      !(await confirm(
        "Провести приёмку?",
        `На склад добавится ${receipt.total_quantity} шт. После проведения документ не меняется.`,
        "Провести",
      ))
    ) {
      return;
    }
    await run(
      () => api<Receipt>(`${base}/post`, { method: "POST" }),
      "Приёмка проведена, товар на складе",
    );
    void queryClient.invalidateQueries({ queryKey: ["/admin/stats"] });
  };
  const removeDraft = async () => {
    if (!(await confirm("Удалить черновик приёмки?", "Строки черновика пропадут.", "Удалить")))
      return;
    await run(async () => {
      await api(base, { method: "DELETE" });
      void queryClient.invalidateQueries({ queryKey: ["/admin/receipts"] });
      router.back();
    });
  };

  const withoutCost = receipt.items.filter((i) => i.cost_price === null).length;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pill tone={draft ? "gold" : "muted"} label={draft ? "Черновик" : "Проведена"} />
        <ReceiptHeader key={`${receipt.id}-${draft}`} receipt={receipt} onSaved={keep} />

        {draft && (
          <Block title="Сканер">
            <ScanField onScan={scan} cameraTitle={`Приёмка № ${receipt.id}`} />
            <Muted style={{ fontSize: 12 }}>
              Один скан — одна штука. Несколько одинаковых коробок — впишите количество в строке.
            </Muted>
          </Block>
        )}
        {unknown && draft && (
          <UnknownBarcode
            code={unknown}
            onCancel={() => setUnknown(null)}
            onAttached={(item) =>
              void run(
                async () => {
                  const r = await api<Receipt>(`${base}/scan`, { body: { code: unknown } });
                  setUnknown(null);
                  return r;
                },
                `Штрихкод привязан к «${item.brand_name} ${item.product_name}, ${volumeLabel(item.volume_ml, item.is_tester)}», +1 шт.`,
              )
            }
          />
        )}
        {draft && (
          <Block title="Товар без штрихкода">
            <VariantSearch
              onPick={(item) =>
                void run(
                  () => api<Receipt>(`${base}/lines`, { body: { variant_id: item.variant_id } }),
                  `Добавлено: ${item.brand_name} ${item.product_name}, ${volumeLabel(item.volume_ml, item.is_tester)}`,
                )
              }
            />
          </Block>
        )}
        {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}

        <Block title="Товары">
          <Muted style={{ fontSize: 13 }}>
            {receipt.items.length} поз. · {receipt.total_quantity} шт. · на сумму{" "}
            <Txt style={{ fontFamily: fonts.sansBold, fontSize: 13 }}>
              {tenge(receipt.total_cost)}
            </Txt>
          </Muted>
          {receipt.items.length === 0 ? (
            <Muted style={{ textAlign: "center", paddingVertical: 8 }}>
              Отсканируйте первую коробку или найдите товар по названию.
            </Muted>
          ) : (
            receipt.items.map((line) => (
              <LineRow
                key={`${line.id}-${line.quantity}-${line.cost_price}`}
                line={line}
                draft={draft}
                highlight={line.id === receipt.touched_line_id}
                disabled={busy}
                onChange={(body) =>
                  void run(() =>
                    api<Receipt>(`${base}/lines/${line.id}`, { method: "PATCH", body }),
                  )
                }
                onDelete={() =>
                  void run(() => api<Receipt>(`${base}/lines/${line.id}`, { method: "DELETE" }))
                }
              />
            ))
          )}
        </Block>

        {draft ? (
          <View style={{ gap: 10 }}>
            {withoutCost > 0 && receipt.items.length > 0 && (
              <Notice tone="warn">
                {`У ${withoutCost} поз. не указана закупочная цена: их себестоимость не изменится, а маржа по ним не посчитается.`}
              </Notice>
            )}
            <Button
              testID="receipt-post"
              title={`Провести приёмку · ${receipt.total_quantity} шт.`}
              disabled={busy || receipt.items.length === 0}
              onPress={() => void post()}
            />
            <Button
              kind="danger"
              title="Удалить черновик"
              disabled={busy}
              onPress={() => void removeDraft()}
            />
          </View>
        ) : (
          <Muted style={{ fontSize: 13 }}>
            Проведена {receipt.posted_at ? dateTime(receipt.posted_at) : ""}
            {receipt.posted_by_email ? ` · ${receipt.posted_by_email}` : ""}. Остатки и
            себестоимость обновлены; движения видны в карточках товаров.
          </Muted>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ReceiptHeader({ receipt, onSaved }: { receipt: Receipt; onSaved: (r: Receipt) => void }) {
  const initial = {
    supplier: receipt.supplier ?? "",
    number: receipt.number ?? "",
    note: receipt.note ?? "",
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: suppliers } = useApi<string[]>(
    receipt.status === "draft" ? "/admin/receipts/suppliers" : null,
  );
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  if (receipt.status !== "draft") {
    return (
      <Block>
        <Muted style={{ fontSize: 12 }}>Поставщик</Muted>
        <Txt>{receipt.supplier ?? "—"}</Txt>
        <Muted style={{ fontSize: 12 }}>Накладная</Muted>
        <Txt>{receipt.number ?? "—"}</Txt>
        {receipt.note && (
          <>
            <Muted style={{ fontSize: 12 }}>Комментарий</Muted>
            <Txt>{receipt.note}</Txt>
          </>
        )}
      </Block>
    );
  }
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api<Receipt>(`/admin/receipts/${receipt.id}`, { method: "PATCH", body: form }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Block>
      <Field
        label="Поставщик"
        value={form.supplier}
        onChangeText={(t) => setForm({ ...form, supplier: t })}
        hint="Закупочная цена новых строк — из прайса этого поставщика; поле пустое — из прайса основного."
      />
      {!!suppliers?.length && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {suppliers.map((s) => (
            <Chip
              key={s}
              label={s}
              active={form.supplier === s}
              onPress={() => setForm({ ...form, supplier: s })}
            />
          ))}
        </View>
      )}
      <Field
        label="№ накладной"
        value={form.number}
        onChangeText={(t) => setForm({ ...form, number: t })}
      />
      <Field
        label="Комментарий"
        value={form.note}
        onChangeText={(t) => setForm({ ...form, note: t })}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {dirty && (
        <Button
          small
          kind="outline"
          title="Сохранить"
          loading={busy}
          onPress={() => void save()}
          style={{ alignSelf: "flex-start" }}
        />
      )}
    </Block>
  );
}

function LineRow({
  line,
  draft,
  highlight,
  disabled,
  onChange,
  onDelete,
}: {
  line: ReceiptLine;
  draft: boolean;
  highlight: boolean;
  disabled: boolean;
  onChange: (body: { quantity?: number; cost_price?: number | null }) => void;
  onDelete: () => void;
}) {
  const [qty, setQty] = useState(String(line.quantity));
  const [cost, setCost] = useState(moneyText(line.cost_price));
  const commitQty = () => {
    const n = Number(qty);
    if (Number.isInteger(n) && n >= 1 && n !== line.quantity) onChange({ quantity: n });
    else setQty(String(line.quantity));
  };
  const commitCost = () => {
    const n = parseMoney(cost);
    if (n !== null && n < 0) {
      setCost(moneyText(line.cost_price));
      return;
    }
    if (n !== line.cost_price) onChange({ cost_price: n });
  };
  const sum = line.cost_price !== null ? line.cost_price * line.quantity : null;
  const delta =
    line.cost_price !== null && line.current_cost !== null
      ? line.cost_price - line.current_cost
      : 0;

  return (
    <View style={[styles.line, highlight && { backgroundColor: colors.okSoft }]}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>{line.label}</Txt>
          <Muted style={{ fontSize: 12 }}>
            {line.sku ? `${line.sku} · ` : ""}
            {line.stock !== null ? `на складе ${line.stock} шт.` : ""}
            {line.current_cost !== null ? ` · себест. ${tenge(line.current_cost)}` : ""}
            {delta !== 0 && (
              <Txt style={{ fontSize: 12, color: delta > 0 ? colors.danger : colors.ok }}>
                {` (${delta > 0 ? "дороже" : "дешевле"} прежней)`}
              </Txt>
            )}
          </Muted>
          {line.supplier_prices.length > 0 && (
            <Muted style={{ fontSize: 12 }}>{supplierPrices(line)}</Muted>
          )}
        </View>
        {draft && (
          <Pressable
            accessibilityLabel="Убрать строку"
            disabled={disabled}
            onPress={onDelete}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
      <View style={styles.controls}>
        {draft ? (
          <>
            <View style={styles.inline}>
              <Muted style={{ fontSize: 12 }}>Кол-во</Muted>
              <TextInput
                value={qty}
                editable={!disabled}
                keyboardType="number-pad"
                onChangeText={(t) => setQty(t.replace(/\D/g, ""))}
                onBlur={commitQty}
                onSubmitEditing={commitQty}
                style={[styles.input, { width: 64 }]}
                accessibilityLabel="Количество"
              />
            </View>
            <View style={styles.inline}>
              <Muted style={{ fontSize: 12 }}>Цена, ₸</Muted>
              <TextInput
                value={cost}
                editable={!disabled}
                keyboardType="decimal-pad"
                placeholder="не указана"
                placeholderTextColor={colors.faint}
                onChangeText={(t) => setCost(t.replace(/[^\d.,\s]/g, ""))}
                onBlur={commitCost}
                onSubmitEditing={commitCost}
                style={[styles.input, { width: 100 }]}
                accessibilityLabel="Закупочная цена"
              />
            </View>
          </>
        ) : (
          <Txt style={{ fontSize: 14 }}>
            {line.quantity} шт. × {tenge(line.cost_price)}
          </Txt>
        )}
        <Txt style={{ marginLeft: "auto", fontFamily: fonts.sansBold }}>{tenge(sum)}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderRadius: radius.sm,
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: {
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
});
