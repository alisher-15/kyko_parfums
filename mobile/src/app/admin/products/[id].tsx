import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { ImageUpload } from "@/components/admin/image-upload";
import { AdminScreen, Block, ChipPicker, Toggle, confirm } from "@/components/admin/kit";
import { VariantsEditor } from "@/components/admin/variants";
import { Button, ErrorState, Field, Loader, Muted, Notice, Txt } from "@/components/ui";
import type { AdminProduct, PriceChange, PriceField, StockMovement } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { GENDER_LABELS, STOCK_REASON_LABELS, dateTime, tenge, volumeLabel } from "@/lib/format";
import { useApi } from "@/lib/queries";
import type { Brand, Gender } from "@/lib/types";
import { colors, fonts } from "@/theme";

const TYPES = ["EDP", "EDT", "Parfum", "Extrait", "EDC"];

export default function ProductAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  return (
    <AdminScreen title={isNew ? "Новый товар" : "Товар"} area={null}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {isNew ? <NewProduct /> : <EditProduct id={Number(id)} />}
      </KeyboardAvoidingView>
    </AdminScreen>
  );
}

/** Lists, the product itself and its histories are reloaded after any change. */
function useRefreshProducts() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/admin/products"),
    });
}

function NewProduct() {
  const refresh = useRefreshProducts();
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <ProductForm
        onSaved={(p) => {
          void refresh();
          router.replace(`/admin/products/${p.id}`);
        }}
      />
      <Muted style={{ fontSize: 13, textAlign: "center" }}>
        Объёмы и цены — после сохранения товара.
      </Muted>
    </ScrollView>
  );
}

function EditProduct({ id }: { id: number }) {
  const refresh = useRefreshProducts();
  const product = useApi<AdminProduct>(`/admin/products/${id}`);
  const [error, setError] = useState<string | null>(null);

  if (product.error && !product.data)
    return <ErrorState message={product.error.message} onRetry={() => void product.refetch()} />;
  if (!product.data) return <Loader />;
  const p = product.data;

  const remove = async () => {
    if (
      !(await confirm("Удалить товар?", `${p.brand.name} ${p.name} со всеми объёмами`, "Удалить"))
    )
      return;
    setError(null);
    try {
      await api(`/admin/products/${id}`, { method: "DELETE" });
      void refresh();
      router.back();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          small
          kind="outline"
          icon="open-outline"
          title="На витрине"
          onPress={() => router.push(`/product/${id}`)}
        />
      </View>
      <ProductForm key={p.updated_at} product={p} onSaved={() => void refresh()} />
      <VariantsEditor productId={id} variants={p.variants} onChanged={() => void refresh()} />
      <StockHistory productId={id} />
      <PriceHistory productId={id} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        kind="danger"
        icon="trash-outline"
        title="Удалить товар"
        onPress={() => void remove()}
      />
      <Muted style={{ fontSize: 12, textAlign: "center" }}>
        Товар, который уже есть в заказах, лучше скрыть («Показывать на сайте»).
      </Muted>
    </ScrollView>
  );
}

type FormState = {
  brand_id: number | null;
  name: string;
  type: string;
  category: string;
  gender: Gender | null;
  longevity: string;
  top_notes: string;
  mid_notes: string;
  base_notes: string;
  description: string;
  search_names: string;
  image_url: string | null;
  is_active: boolean;
  is_new: boolean;
};

function toForm(p?: AdminProduct): FormState {
  return {
    brand_id: p?.brand_id ?? null,
    name: p?.name ?? "",
    type: p?.type ?? "",
    category: p?.category ?? "",
    gender: p?.gender ?? null,
    longevity: p?.longevity ?? "",
    top_notes: p?.top_notes ?? "",
    mid_notes: p?.mid_notes ?? "",
    base_notes: p?.base_notes ?? "",
    description: p?.description ?? "",
    search_names: p?.search_names ?? "",
    image_url: p?.image_url ?? null,
    is_active: p?.is_active ?? true,
    is_new: p?.is_new ?? false,
  };
}

function ProductForm({
  product,
  onSaved,
}: {
  product?: AdminProduct;
  onSaved: (p: AdminProduct) => void;
}) {
  const brands = useApi<Brand[]>("/admin/brands");
  const [form, setForm] = useState<FormState>(() => toForm(product));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof FormState) => (text: string) => setForm({ ...form, [key]: text });

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const nullIfEmpty = (s: string) => (s.trim() ? s.trim() : null);
    const body = {
      brand_id: form.brand_id,
      name: form.name.trim(),
      type: nullIfEmpty(form.type),
      category: nullIfEmpty(form.category),
      gender: form.gender,
      longevity: nullIfEmpty(form.longevity),
      top_notes: nullIfEmpty(form.top_notes),
      mid_notes: nullIfEmpty(form.mid_notes),
      base_notes: nullIfEmpty(form.base_notes),
      description: nullIfEmpty(form.description),
      search_names: nullIfEmpty(form.search_names),
      image_url: form.image_url,
      is_active: form.is_active,
      is_new: form.is_new,
    };
    try {
      const saved = product
        ? await api<AdminProduct>(`/admin/products/${product.id}`, { method: "PATCH", body })
        : await api<AdminProduct>("/admin/products", { body });
      setForm(toForm(saved));
      setMsg({ ok: true, text: "Сохранено" });
      onSaved(saved);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block title={product ? `${product.brand.name} ${product.name}` : "Товар"}>
      <ImageUpload
        value={form.image_url}
        seed={product?.id ?? 0}
        onChange={(url) => setForm({ ...form, image_url: url })}
        hint="Фото станет белым квадратом 600×600 с флаконом в масштабе магазина."
      />
      {brands.error && <Notice tone="error">{brands.error.message}</Notice>}
      {!brands.data && !brands.error && <Loader />}
      {brands.data && (
        <ChipPicker
          label="Бренд *"
          value={form.brand_id}
          options={brands.data.map((b) => ({ value: b.id, label: b.name }))}
          onChange={(v) => setForm({ ...form, brand_id: v })}
        />
      )}
      <Field
        label="Название *"
        value={form.name}
        onChangeText={set("name")}
        testID="product-name"
      />
      <View style={{ gap: 6 }}>
        <Field label="Тип" value={form.type} onChangeText={set("type")} autoCapitalize="none" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {TYPES.map((t) => (
            <Pressable key={t} onPress={() => setForm({ ...form, type: t })} hitSlop={4}>
              <Text
                style={{
                  color: form.type === t ? colors.ink : colors.goldDark,
                  fontFamily: fonts.sansSemi,
                }}
              >
                {t}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ChipPicker
        label="Для кого"
        value={form.gender}
        allowNone="Не указано"
        options={(Object.keys(GENDER_LABELS) as Gender[]).map((g) => ({
          value: g,
          label: GENDER_LABELS[g],
        }))}
        onChange={(v) => setForm({ ...form, gender: v })}
      />
      <Field
        label="Категория"
        value={form.category}
        onChangeText={set("category")}
        placeholder="Восточные, цветочные…"
      />
      <Field
        label="Стойкость"
        value={form.longevity}
        onChangeText={set("longevity")}
        placeholder="8–10 часов"
      />
      <Field
        label="Верхние ноты"
        value={form.top_notes}
        onChangeText={set("top_notes")}
        hint="Через запятую"
      />
      <Field label="Ноты сердца" value={form.mid_notes} onChangeText={set("mid_notes")} />
      <Field label="Базовые ноты" value={form.base_notes} onChangeText={set("base_notes")} />
      <Field
        label="Описание"
        value={form.description}
        onChangeText={set("description")}
        multiline
      />
      <Field
        label="Другие названия для поиска"
        value={form.search_names}
        onChangeText={set("search_names")}
        placeholder="соваж, баккара"
      />
      <Toggle
        label="Показывать на сайте"
        value={form.is_active}
        onChange={(v) => setForm({ ...form, is_active: v })}
      />
      <Toggle
        label="Новинка"
        hint="В «Новых поступлениях» на главной"
        value={form.is_new}
        onChange={(v) => setForm({ ...form, is_new: v })}
      />
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
      <Button
        title={product ? "Сохранить" : "Создать товар"}
        testID="product-save"
        loading={busy}
        disabled={!form.brand_id || !form.name.trim()}
        onPress={() => void submit()}
      />
    </Block>
  );
}

/** The newest entries first; the rest behind «Показать все». */
function useShowAll<T>(items: T[] | undefined, first = 10) {
  const [all, setAll] = useState(false);
  const shown = items ? (all ? items : items.slice(0, first)) : [];
  const more =
    items && items.length > first && !all ? (
      <Button
        small
        kind="ghost"
        title={`Показать все (${items.length})`}
        onPress={() => setAll(true)}
      />
    ) : null;
  return { shown, more };
}

function HistoryLine({ left, right, sub }: { left: string; right: ReactNode; sub?: ReactNode }) {
  return (
    <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Txt style={{ fontSize: 14, flex: 1 }}>{left}</Txt>
        {right}
      </View>
      {sub}
    </View>
  );
}

/** Stock journal of the product: every sale, return, receipt, count, edit and import. */
function StockHistory({ productId }: { productId: number }) {
  const { data, error } = useApi<StockMovement[]>(`/admin/products/${productId}/stock-movements`);
  const { shown, more } = useShowAll(data);
  const link = (label: string, go: () => void) => (
    <Text style={{ color: colors.goldDark }} onPress={go}>
      {label}
    </Text>
  );
  return (
    <Block title="Движение склада">
      {error && <Notice tone="error">{error.message}</Notice>}
      {!data && !error && <Loader />}
      {data?.length === 0 && <Muted>Пока нет изменений остатков.</Muted>}
      {shown.map((m) => (
        <HistoryLine
          key={m.id}
          left={`${volumeLabel(m.volume_ml, m.is_tester)} · ${STOCK_REASON_LABELS[m.reason]}`}
          right={
            <Txt
              style={{ fontFamily: fonts.sansBold, color: m.delta > 0 ? colors.ok : colors.danger }}
            >
              {m.delta > 0 ? `+${m.delta}` : m.delta} → {m.stock_after}
            </Txt>
          }
          sub={
            <Muted style={{ fontSize: 12 }}>
              {dateTime(m.created_at)}
              {m.user_email ? ` · ${m.user_email}` : ""}
              {m.order_id && (
                <>
                  {" "}
                  ·{" "}
                  {link(`заказ № ${m.order_id}`, () => router.push(`/admin/orders/${m.order_id}`))}
                </>
              )}
              {m.receipt_id && (
                <> · {link("документ", () => router.push(`/admin/receipts/${m.receipt_id}`))}</>
              )}
              {m.count_id && (
                <> · {link("документ", () => router.push(`/admin/counts/${m.count_id}`))}</>
              )}
              {m.note ? `\n${m.note}` : ""}
            </Muted>
          }
        />
      ))}
      {more}
    </Block>
  );
}

const FIELD_LABELS: Record<PriceField, string> = {
  cost: "Себестоимость",
  retail: "Розница",
  wholesale: "Опт",
  bulk: "Крупный опт",
};

/** Every change of the product's costs and prices: by hand, an import, a price list, a receipt. */
function PriceHistory({ productId }: { productId: number }) {
  const { data, error } = useApi<PriceChange[]>(`/admin/products/${productId}/price-history`);
  const { shown, more } = useShowAll(data);
  return (
    <Block title="История цен">
      {error && <Notice tone="error">{error.message}</Notice>}
      {!data && !error && <Loader />}
      {data?.length === 0 && <Muted>Цены пока не менялись.</Muted>}
      {shown.map((c) => {
        const up = c.old_value !== null && c.new_value !== null && c.new_value > c.old_value;
        const down = c.old_value !== null && c.new_value !== null && c.new_value < c.old_value;
        return (
          <HistoryLine
            key={c.id}
            left={`${volumeLabel(c.volume_ml, c.is_tester)} · ${FIELD_LABELS[c.field]}`}
            right={
              <Txt style={{ fontSize: 14 }}>
                <Text style={{ color: colors.muted }}>
                  {c.old_value === null ? "—" : tenge(c.old_value)} →{" "}
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.sansBold,
                    color: up ? colors.ok : down ? colors.danger : colors.ink,
                  }}
                >
                  {c.new_value === null ? "—" : tenge(c.new_value)}
                </Text>
              </Txt>
            }
            sub={
              <Muted style={{ fontSize: 12 }}>
                {dateTime(c.created_at)} · {c.source}
                {c.user_email ? ` · ${c.user_email}` : ""}
              </Muted>
            }
          />
        );
      })}
      {more}
    </Block>
  );
}
