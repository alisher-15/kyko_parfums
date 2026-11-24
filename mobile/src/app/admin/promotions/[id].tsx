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
  Text,
  View,
} from "react-native";
import { CreativeMaker } from "@/components/admin/creative-maker";
import { ImageUpload } from "@/components/admin/image-upload";
import {
  AdminScreen,
  Block,
  Pill,
  SearchBox,
  Segmented,
  Toggle,
  confirm,
} from "@/components/admin/kit";
import { ProductImage } from "@/components/product";
import { Button, Chip, ErrorState, Field, Loader, Muted, Notice, Txt } from "@/components/ui";
import type { AdminProduct, Promotion } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { PROMOTION_STATUS_LABELS, dayMonth, percentOff, tenge, volumeLabel } from "@/lib/format";
import { useApi } from "@/lib/queries";
import type { Brand, BrandBrief, Page } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

type ProductChoice = {
  id: number;
  name: string;
  type?: string | null;
  image_url?: string | null;
  brand: BrandBrief;
};

// One of three: a promotion on both brands and products would cover the whole brand,
// which is rarely what is meant (as on the website).
type Scope = "all" | "brands" | "products";

type FormState = {
  title: string;
  description: string;
  image_url: string | null;
  image_only: boolean;
  discount: string;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
  scope: Scope;
  brands: BrandBrief[];
  products: ProductChoice[];
};

function scopeOf(p?: Promotion): Scope {
  if (p?.all_products) return "all";
  if (p?.brands.length && !p.products.length) return "brands";
  return "products";
}

function toForm(p?: Promotion): FormState {
  return {
    title: p?.title ?? "",
    description: p?.description ?? "",
    image_url: p?.image_url ?? null,
    image_only: p?.image_only ?? false,
    discount: p?.discount_percent != null ? String(p.discount_percent) : "",
    starts_on: p?.starts_on ?? "",
    ends_on: p?.ends_on ?? "",
    is_active: p?.is_active ?? true,
    scope: scopeOf(p),
    brands: p?.brands ?? [],
    products: p?.products ?? [],
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A date `days` from today on the phone, as the API takes it: 2026-11-20. */
function isoDay(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function PromotionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  return (
    <AdminScreen title={isNew ? "Новая акция" : "Акция"} area={null}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {isNew ? <PromotionForm /> : <EditPromotion id={Number(id)} />}
      </KeyboardAvoidingView>
    </AdminScreen>
  );
}

function EditPromotion({ id }: { id: number }) {
  const promotion = useApi<Promotion>(`/admin/promotions/${id}`);
  if (promotion.error && !promotion.data)
    return (
      <ErrorState message={promotion.error.message} onRetry={() => void promotion.refetch()} />
    );
  if (!promotion.data) return <Loader />;
  return <PromotionForm key={promotion.data.updated_at} promotion={promotion.data} />;
}

/**
 * A promotion: the banner on the home page and, with a percent, a discount off the retail price
 * of what it covers. Wholesale customers pay the lower of their price and the promotion's.
 */
function PromotionForm({ promotion }: { promotion?: Promotion }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(promotion));
  // The banner maker, filled from the form.
  const [making, setMaking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof FormState) => (text: string) => setForm({ ...form, [key]: text });

  // The home page's banners and every price a promotion touches change with it.
  const refresh = () =>
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" && !q.queryKey[0].startsWith("/admin/orders"),
    });

  const badDate = [form.starts_on, form.ends_on].some((d) => d !== "" && !DATE.test(d));

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      image_url: form.image_url,
      image_only: form.image_only,
      discount_percent: form.discount.trim() ? Number(form.discount.replace(",", ".")) : null,
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      is_active: form.is_active,
      all_products: form.scope === "all",
      brand_ids: form.scope === "brands" ? form.brands.map((b) => b.id) : [],
      product_ids: form.scope === "products" ? form.products.map((p) => p.id) : [],
    };
    try {
      const saved = promotion
        ? await api<Promotion>(`/admin/promotions/${promotion.id}`, { method: "PUT", body })
        : await api<Promotion>("/admin/promotions", { body });
      await refresh();
      if (promotion) setMsg({ ok: true, text: "Сохранено" });
      else router.replace({ pathname: "/admin/promotions/[id]", params: { id: saved.id } });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!promotion || !(await confirm("Удалить акцию?", promotion.title, "Удалить"))) return;
    setMsg(null);
    try {
      await api(`/admin/promotions/${promotion.id}`, { method: "DELETE" });
      await refresh();
      router.back();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {promotion && <Muted>Статус: {PROMOTION_STATUS_LABELS[promotion.status]}</Muted>}
      <Block title="Баннер">
        <ImageUpload
          kind="original"
          value={form.image_url}
          seed={promotion?.id ?? 0}
          onChange={(url) => setForm({ ...form, image_url: url })}
          previewStyle={{ width: "100%", aspectRatio: 3 / 2 }}
        />
        <Button
          small
          kind="outline"
          icon={making ? "close" : "color-palette-outline"}
          title={making ? "Скрыть шаблоны" : "Сделать по шаблону"}
          testID="promotion-make-banner"
          onPress={() => setMaking(!making)}
        />
        {making && (
          <View style={{ gap: 8 }}>
            <Muted style={{ fontSize: 12 }}>
              Заголовок, скидка, дата и товары взяты из акции — поправьте и поставьте баннер. Текст
              будет на картинке, поэтому включится «Готовый баннер».
            </Muted>
            <CreativeMaker
              lockFormat
              initial={{
                format: "banner",
                title: form.title,
                subtitle: form.description.slice(0, 160),
                badge: form.discount.trim()
                  ? percentOff(Number(form.discount.replace(",", ".")))
                  : "",
                note: form.ends_on ? `до ${dayMonth(form.ends_on)}` : "",
                products: form.scope === "products" ? form.products.slice(0, 3) : [],
              }}
              onUse={(url) => {
                setForm({ ...form, image_url: url, image_only: true });
                setMaking(false);
              }}
            />
          </View>
        )}
        {form.image_url && (
          <Toggle
            label="Готовый баннер: текст уже на картинке"
            hint="Сайт покажет картинку целиком, без своего названия, дат и скидки поверх неё."
            value={form.image_only}
            onChange={(v) => setForm({ ...form, image_only: v })}
          />
        )}
        <Muted style={{ fontSize: 12 }}>
          {form.image_url && form.image_only
            ? "Баннер — карточка 3:2 в ленте акций вверху главной, на телефоне их видно две с небольшим: картинка 1200×800 заполнит её целиком, без обрезки и полос. Карточка небольшая, поэтому пишите на картинке главное и крупно."
            : "Баннер — карточка 3:2 в ленте акций вверху главной: лучше всего картинка 1200×800, не меньше 600 px в ширину. Поверх неё пишутся скидка, дата окончания и название, поэтому оставьте внизу место под текст. Без картинки карточка будет тёмной с текстом."}
        </Muted>
      </Block>

      <Block title="Акция">
        <Field
          label="Название *"
          placeholder="Осенняя распродажа"
          value={form.title}
          onChangeText={set("title")}
          testID="promotion-title"
        />
        <Field
          label="Текст на баннере"
          placeholder="Скидка на ароматы Chanel до конца месяца"
          value={form.description}
          onChangeText={set("description")}
          multiline
        />
        <Field
          label="Скидка, %"
          hint="Пусто — только баннер, цены не меняются"
          placeholder="15"
          keyboardType="decimal-pad"
          value={form.discount}
          onChangeText={(t) => setForm({ ...form, discount: t.replace(/[^\d.,]/g, "") })}
          testID="promotion-discount"
        />
        <DateField
          label="Начало"
          hint="Пусто — сразу"
          value={form.starts_on}
          onChange={set("starts_on")}
          quick={[["Сегодня", 0]]}
        />
        <DateField
          label="Конец (включительно)"
          hint="Пусто — пока не выключите"
          value={form.ends_on}
          onChange={set("ends_on")}
          quick={[
            ["Через неделю", 7],
            ["Через месяц", 30],
          ]}
        />
        {badDate && <Notice tone="warn">Дата пишется так: 2026-11-30.</Notice>}
        <Muted style={{ fontSize: 12 }}>
          Скидка считается от розничной цены и округляется до целых. Оптовики платят меньшую из двух
          цен: свою оптовую или акционную. Скидки акций не суммируются между собой и со скидкой на
          кассе — действует большая.
        </Muted>
        <Toggle
          label="Включена"
          value={form.is_active}
          onChange={(v) => setForm({ ...form, is_active: v })}
        />
      </Block>

      <Block title="На что действует">
        <View style={{ marginHorizontal: -16 }}>
          <Segmented<Scope>
            value={form.scope}
            onChange={(scope) => setForm({ ...form, scope })}
            options={[
              { value: "all", label: "Весь каталог" },
              { value: "brands", label: "Бренды целиком" },
              { value: "products", label: "Отдельные товары" },
            ]}
          />
        </View>
        {promotion && promotion.brands.length > 0 && promotion.products.length > 0 && (
          <Notice tone="warn">
            Сейчас у акции выбраны и бренды ({promotion.brands.map((b) => b.name).join(", ")}), и
            товары, поэтому она действует на бренды целиком. Оставьте что-то одно и сохраните.
          </Notice>
        )}
        {form.scope === "brands" && (
          <BrandPicker selected={form.brands} onChange={(brands) => setForm({ ...form, brands })} />
        )}
        {form.scope === "products" && (
          <ProductPicker
            selected={form.products}
            onChange={(products) => setForm({ ...form, products })}
          />
        )}
      </Block>

      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
      <Button
        title={promotion ? "Сохранить акцию" : "Создать акцию"}
        testID="promotion-save"
        loading={busy}
        disabled={!form.title.trim() || badDate}
        onPress={() => void submit()}
      />
      {promotion && (
        <Button
          kind="danger"
          icon="trash-outline"
          title="Удалить акцию"
          onPress={() => void remove()}
        />
      )}
    </ScrollView>
  );
}

function DateField({
  label,
  hint,
  value,
  onChange,
  quick,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  quick: [string, number][];
}) {
  return (
    <View style={{ gap: 6 }}>
      <Field
        label={label}
        hint={hint}
        placeholder="ГГГГ-ММ-ДД"
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^\d-]/g, "").slice(0, 10))}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {quick.map(([text, days]) => (
          <Chip key={text} label={text} onPress={() => onChange(isoDay(days))} />
        ))}
        {value !== "" && <Chip label="Очистить" onPress={() => onChange("")} />}
      </View>
    </View>
  );
}

function BrandPicker({
  selected,
  onChange,
}: {
  selected: BrandBrief[];
  onChange: (brands: BrandBrief[]) => void;
}) {
  const brands = useApi<Brand[]>("/admin/brands");
  const [search, setSearch] = useState("");
  const ids = new Set(selected.map((b) => b.id));
  const shown = (brands.data ?? []).filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()),
  );
  const toggle = (b: BrandBrief) =>
    onChange(
      ids.has(b.id)
        ? selected.filter((x) => x.id !== b.id)
        : [...selected, { id: b.id, name: b.name }],
    );
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontFamily: fonts.sansSemi }}>
        Бренды{selected.length ? ` · ${selected.length}` : ""}
      </Txt>
      <SearchBox value={search} onChange={setSearch} placeholder="Найти бренд" />
      {!brands.data && <Loader />}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {shown.map((b) => (
          <Chip key={b.id} label={b.name} active={ids.has(b.id)} onPress={() => toggle(b)} />
        ))}
      </View>
    </View>
  );
}

function ProductPicker({
  selected,
  onChange,
}: {
  selected: ProductChoice[];
  onChange: (products: ProductChoice[]) => void;
}) {
  const [search, setSearch] = useState("");
  const found = useApi<Page<AdminProduct>>(search.length >= 2 ? "/admin/products" : null, {
    q: search,
    page_size: 10,
  });
  const ids = new Set(selected.map((p) => p.id));
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontFamily: fonts.sansSemi }}>
        Товары{selected.length ? ` · ${selected.length}` : ""}
      </Txt>
      {selected.map((p) => (
        <View key={p.id} style={styles.chosen}>
          <Txt style={{ flex: 1, fontSize: 14 }}>
            <Text style={{ color: colors.muted }}>{p.brand.name}</Text> {p.name}
            {p.type ? <Text style={{ color: colors.muted }}> · {p.type}</Text> : null}
          </Txt>
          <Pressable
            accessibilityLabel={`Убрать ${p.name}`}
            hitSlop={8}
            onPress={() => onChange(selected.filter((x) => x.id !== p.id))}
          >
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ))}
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Найти товар: название или бренд"
        testID="promotion-product-search"
      />
      {found.data?.items.length === 0 && <Muted style={{ fontSize: 13 }}>Ничего не найдено</Muted>}
      {found.data?.items.map((p) => (
        <ProductOption
          key={p.id}
          product={p}
          added={ids.has(p.id)}
          onAdd={() =>
            onChange([
              ...selected,
              { id: p.id, name: p.name, type: p.type, image_url: p.image_url, brand: p.brand },
            ])
          }
        />
      ))}
    </View>
  );
}

/**
 * A found product as a small card: products of one name (an EDP and an Extrait, a bottle and a
 * set) differ by their type, volumes and price, so all of them are shown (as on the website).
 */
function ProductOption({
  product: p,
  added,
  onAdd,
}: {
  product: AdminProduct;
  added: boolean;
  onAdd: () => void;
}) {
  const volumes = [...p.variants].sort(
    (a, b) => a.volume_ml - b.volume_ml || Number(a.is_tester) - Number(b.is_tester),
  );
  const photo = p.image_url ?? volumes.find((v) => v.photo_url)?.photo_url ?? null;
  return (
    <Pressable
      accessibilityRole="button"
      testID={`promotion-add-${p.id}`}
      disabled={added}
      onPress={onAdd}
      style={({ pressed }) => [styles.found, (pressed || added) && { opacity: 0.5 }]}
    >
      <ProductImage uri={photo} seed={p.id} style={styles.thumb} iconSize={16} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <Txt style={{ fontSize: 14 }}>
            <Text style={{ color: colors.muted }}>{p.brand.name}</Text> {p.name}
          </Txt>
          {p.type && <Pill label={p.type} />}
          {!p.is_active && <Text style={{ color: colors.danger, fontSize: 11 }}>скрыт</Text>}
        </View>
        <Muted style={{ fontSize: 12 }} numberOfLines={1}>
          {volumes.length
            ? `${volumes.map((v) => volumeLabel(v.volume_ml, v.is_tester)).join(" · ")} · от ${tenge(
                Math.min(...volumes.map((v) => v.retail_price)),
              )}`
            : "нет объёмов"}
        </Muted>
      </View>
      <Text style={{ color: colors.goldDark, fontFamily: fonts.sansSemi, fontSize: 12 }}>
        {added ? "добавлен" : "+ добавить"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  found: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 8,
  },
});
