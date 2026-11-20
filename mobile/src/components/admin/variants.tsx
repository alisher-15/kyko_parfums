import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ImageUpload } from "@/components/admin/image-upload";
import { Block, Toggle, confirm, moneyText, parseMoney } from "@/components/admin/kit";
import { ScanField, type ScanResult } from "@/components/admin/scan";
import { Button, Field, Muted, Notice, Txt } from "@/components/ui";
import type { AdminVariant, Supplier, VariantSupplierPrice } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { dayMonth, tenge, volumeLabel } from "@/lib/format";
import { useApi } from "@/lib/queries";
import { colors, fonts, radius } from "@/theme";

type Row = {
  volume_ml: string;
  is_tester: boolean;
  sku: string;
  stock: string;
  retail_price: string;
  wholesale_price: string;
  bulk_price: string;
  cost_price: string;
  photo_url: string | null;
  is_active: boolean;
};

const EMPTY: Row = {
  volume_ml: "",
  is_tester: false,
  sku: "",
  stock: "0",
  retail_price: "",
  wholesale_price: "",
  bulk_price: "",
  cost_price: "",
  photo_url: null,
  is_active: true,
};

function toRow(v: AdminVariant): Row {
  return {
    volume_ml: String(v.volume_ml),
    is_tester: v.is_tester,
    sku: v.sku ?? "",
    stock: String(v.stock),
    retail_price: moneyText(v.retail_price),
    wholesale_price: moneyText(v.wholesale_price),
    bulk_price: moneyText(v.bulk_price),
    cost_price: moneyText(v.cost_price),
    photo_url: v.photo_url,
    is_active: v.is_active,
  };
}

function toBody(r: Row) {
  return {
    volume_ml: Number(r.volume_ml),
    is_tester: r.is_tester,
    sku: r.sku.trim() || null,
    stock: Number(r.stock || 0),
    retail_price: parseMoney(r.retail_price),
    wholesale_price: parseMoney(r.wholesale_price),
    bulk_price: parseMoney(r.bulk_price),
    cost_price: parseMoney(r.cost_price),
    photo_url: r.photo_url,
    is_active: r.is_active,
  };
}

const percent = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

/** «Наценка: розница 60% · опт 30% · кр. опт 20%»: what the volume remembers on saving. */
function markupText(r: Row): string | null {
  const cost = parseMoney(r.cost_price);
  if (!cost || cost <= 0) return null;
  const parts = (
    [
      ["розница", r.retail_price],
      ["опт", r.wholesale_price],
      ["кр. опт", r.bulk_price],
    ] as const
  ).flatMap(([label, value]) => {
    const price = parseMoney(value);
    return price && price > 0 ? [`${label} ${percent.format((price / cost - 1) * 100)}%`] : [];
  });
  return parts.length ? `Наценка: ${parts.join(" · ")}` : null;
}

/** Every supplier's price of the volume, «—» where a supplier has none; the lowest is green. */
function SupplierCosts({
  suppliers,
  prices,
}: {
  suppliers: Supplier[];
  prices: VariantSupplierPrice[];
}) {
  if (!suppliers.length) return null;
  const lowest = Math.min(...prices.map((p) => p.price));
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.label}>Цены поставщиков</Text>
      {suppliers.map((s) => {
        const p = prices.find((x) => x.supplier_id === s.id);
        return (
          <Txt key={s.id} style={{ fontSize: 13 }}>
            <Text style={{ color: colors.muted }}>{s.name}: </Text>
            {p ? (
              <>
                <Text
                  style={[
                    { fontFamily: fonts.sansBold },
                    prices.length > 1 && p.price === lowest && { color: colors.ok },
                  ]}
                >
                  {tenge(p.price)}
                </Text>
                <Text style={{ color: colors.muted }}>
                  {" "}
                  · прайс от {dayMonth(p.updated_at.slice(0, 10))}
                  {!p.latest ? " (нет в последнем прайсе)" : ""}
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.muted }}>—</Text>
            )}
          </Txt>
        );
      })}
    </View>
  );
}

/** Barcodes of one volume: remove with ×, add by scanning or typing. */
function Barcodes({
  variantId,
  codes,
  onChanged,
}: {
  variantId: number;
  codes: string[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const path = (code: string) =>
    `/admin/variants/${variantId}/barcodes/${encodeURIComponent(code)}`;

  const add = async (code: string): Promise<ScanResult> => {
    await api(`/admin/variants/${variantId}/barcodes`, { body: { code } });
    onChanged();
    return {
      ok: true,
      title: `Штрихкод ${code} добавлен`,
      undo: async () => {
        await api(path(code), { method: "DELETE" });
        onChanged();
      },
    };
  };

  const remove = async (code: string) => {
    setError(null);
    try {
      await api(path(code), { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>Штрихкоды</Text>
      {codes.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {codes.map((code) => (
            <View key={code} style={styles.code}>
              <Text style={styles.codeText}>{code}</Text>
              <Pressable
                accessibilityLabel={`Удалить штрихкод ${code}`}
                hitSlop={8}
                onPress={() => void remove(code)}
              >
                <Ionicons name="close" size={14} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <ScanField single onScan={add} placeholder="Отсканируйте или введите штрихкод" />
      {error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}

/**
 * Volumes of a product: each has its own stock and three price levels. A tester is a volume of
 * its own («Тестер»): its prices, stock and barcodes are separate from the bottle's.
 */
export function VariantsEditor({
  productId,
  variants,
  onChanged,
}: {
  productId: number;
  variants: AdminVariant[];
  onChanged: () => void;
}) {
  const { data: suppliers } = useApi<Supplier[]>("/admin/suppliers");
  const { data: supplierPrices } = useApi<VariantSupplierPrice[]>(
    `/admin/products/${productId}/supplier-prices`,
  );
  return (
    <Block title="Объёмы, цены и остатки">
      <Muted style={{ fontSize: 12 }}>
        Пустая оптовая / крупнооптовая цена = берётся цена уровнем выше.
      </Muted>
      {variants.map((v) => (
        <VariantCard
          // A saved volume starts over from what the server keeps.
          key={`${v.id}-${JSON.stringify(toRow(v))}`}
          initial={toRow(v)}
          seed={v.id}
          title={volumeLabel(v.volume_ml, v.is_tester)}
          extra={
            <>
              <SupplierCosts
                suppliers={suppliers ?? []}
                prices={(supplierPrices ?? []).filter((p) => p.variant_id === v.id)}
              />
              <Barcodes variantId={v.id} codes={v.barcodes} onChanged={onChanged} />
            </>
          }
          onSave={async (row, stockNote) => {
            await api(`/admin/variants/${v.id}`, {
              method: "PATCH",
              body: { ...toBody(row), stock_note: stockNote || null },
            });
            onChanged();
          }}
          onDelete={async () => {
            const label = volumeLabel(v.volume_ml, v.is_tester);
            if (!(await confirm("Удалить объём?", label, "Удалить"))) return;
            await api(`/admin/variants/${v.id}`, { method: "DELETE" });
            onChanged();
          }}
        />
      ))}
      <VariantCard
        key={`new-${variants.length}`}
        initial={EMPTY}
        seed={0}
        title="Добавить объём"
        isNew
        onSave={async (row) => {
          await api(`/admin/products/${productId}/variants`, { body: toBody(row) });
          onChanged();
        }}
      />
    </Block>
  );
}

function VariantCard({
  initial,
  seed,
  title,
  isNew = false,
  extra,
  onSave,
  onDelete,
}: {
  initial: Row;
  seed: number;
  title: string;
  isNew?: boolean;
  extra?: ReactNode;
  onSave: (row: Row, stockNote: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [row, setRow] = useState<Row>(initial);
  const [stockNote, setStockNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stockChanged = !isNew && row.stock !== initial.stock;
  const markup = markupText(row);
  const dirty = JSON.stringify(row) !== JSON.stringify(initial);
  const set = (key: keyof Row) => (text: string) => setRow({ ...row, [key]: text });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const num = (
    label: string,
    key: keyof Row,
    opts: { decimal?: boolean; placeholder?: string } = {},
  ) => (
    <Field
      label={label}
      value={row[key] as string}
      onChangeText={set(key)}
      keyboardType={opts.decimal === false ? "default" : "numeric"}
      placeholder={opts.placeholder}
      autoCapitalize="none"
      style={styles.half}
    />
  );

  return (
    <View
      style={[styles.card, isNew && { backgroundColor: colors.cream }]}
      testID={isNew ? "variant-new" : undefined}
    >
      <Txt style={{ fontFamily: fonts.sansBold, fontSize: 15 }}>{title}</Txt>
      <ImageUpload
        seed={seed}
        value={row.photo_url}
        onChange={(url) => setRow({ ...row, photo_url: url })}
        previewStyle={{ width: 96, height: 96 }}
        hint="Своё фото объёма; без него — фото товара."
      />
      <View style={styles.grid}>
        {num("Объём, мл", "volume_ml")}
        {num("Артикул", "sku", { decimal: false })}
        {num("Остаток, шт.", "stock")}
        {num("Себестоимость, ₸", "cost_price", { placeholder: "не указана" })}
        {num("Розница, ₸", "retail_price")}
        {num("Опт, ₸", "wholesale_price")}
        {num("Кр. опт, ₸", "bulk_price")}
      </View>
      {markup && <Muted style={{ fontSize: 12 }}>{markup}</Muted>}
      {stockChanged && (
        <Field
          label={`Остаток ${initial.stock} → ${row.stock || 0}: причина`}
          hint="Попадёт в журнал склада. Приход от поставщика удобнее оформлять «Приёмкой»."
          placeholder="Списание брака, пересчёт…"
          value={stockNote}
          onChangeText={setStockNote}
        />
      )}
      <Toggle
        label="Тестер"
        value={row.is_tester}
        onChange={(v) => setRow({ ...row, is_tester: v })}
      />
      <Toggle
        label="Показывать на сайте"
        value={row.is_active}
        onChange={(v) => setRow({ ...row, is_active: v })}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {isNew ? (
          <Button
            kind="gold"
            title="Добавить"
            testID="variant-add"
            style={{ flex: 1 }}
            loading={busy}
            disabled={!row.volume_ml || !row.retail_price}
            onPress={() => void run(() => onSave(row, ""))}
          />
        ) : (
          <>
            <Button
              title="Сохранить"
              style={{ flex: 1 }}
              loading={busy}
              disabled={!dirty}
              onPress={() =>
                void run(async () => {
                  await onSave(row, stockNote);
                  setStockNote("");
                })
              }
            />
            <Button
              kind="danger"
              title="Удалить"
              disabled={busy}
              onPress={() => onDelete && void run(onDelete)}
            />
          </>
        )}
      </View>
      {extra}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: colors.white,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  half: { flexBasis: "46%", flexGrow: 1 },
  label: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 0.4, color: colors.muted },
  code: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  codeText: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 12,
    color: colors.ink,
  },
});
