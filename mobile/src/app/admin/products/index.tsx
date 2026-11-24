import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, View } from "react-native";
import { Sheet } from "@/components/catalog";
import { AdminScreen, Pill, SearchBox } from "@/components/admin/kit";
import { ProductImage } from "@/components/product";
import { Button, Chip, EmptyState, ErrorState, Loader, Muted, Notice, Txt } from "@/components/ui";
import type { AdminCategory, AdminProduct } from "@/lib/admin-types";
import { errorText } from "@/lib/api";
import { fullName } from "@/lib/categories";
import { XLSX, saveAndShare } from "@/lib/files";
import { tenge, volumeLabel } from "@/lib/format";
import { useApi, usePages } from "@/lib/queries";
import type { Brand } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

type PriceCheck = "" | "below_cost" | "markup_down" | "markup_up";

interface Filters {
  brand_id: string;
  /** A section or group with everything in it; "0" = products not placed anywhere. */
  category_id: string;
  is_active: "" | "true" | "false";
  price_check: PriceCheck;
  no_variants: boolean;
  backordered: boolean;
  is_new: boolean;
  no_photo: boolean;
  no_barcode: boolean;
}

const EMPTY: Filters = {
  brand_id: "",
  category_id: "",
  is_active: "",
  price_check: "",
  no_variants: false,
  backordered: false,
  is_new: false,
  no_photo: false,
  no_barcode: false,
};

const TOGGLES: {
  key: "no_variants" | "backordered" | "is_new" | "no_photo" | "no_barcode";
  label: string;
}[] = [
  { key: "backordered", label: "Нужно заказать у поставщика" },
  { key: "no_variants", label: "Без цен / объёмов" },
  { key: "is_new", label: "Выбор Kyko" },
  { key: "no_photo", label: "Без фото" },
  { key: "no_barcode", label: "Без штрихкода" },
];

export default function ProductsAdminScreen() {
  return (
    <AdminScreen title="Товары" area={null}>
      <Products />
    </AdminScreen>
  );
}

function Products() {
  const params = useLocalSearchParams<{
    backordered?: string;
    no_variants?: string;
    category_id?: string;
  }>();
  const tree = useApi<AdminCategory[]>("/admin/categories");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY,
    backordered: params.backordered === "true",
    no_variants: params.no_variants === "true",
    category_id: params.category_id ?? "",
  });
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(
    () => ({
      q,
      brand_id: filters.brand_id,
      category_id: filters.category_id,
      is_active: filters.is_active,
      price_check: filters.price_check,
      no_variants: filters.no_variants,
      backordered: filters.backordered,
      is_new: filters.is_new,
      no_photo: filters.no_photo,
      no_barcode: filters.no_barcode,
    }),
    [q, filters],
  );
  const products = usePages<AdminProduct>("/admin/products", query);
  const items = useMemo(() => products.data?.pages.flatMap((p) => p.items) ?? [], [products.data]);
  const total = products.data?.pages[0]?.total;
  const active =
    (filters.brand_id ? 1 : 0) +
    (filters.category_id ? 1 : 0) +
    (filters.is_active ? 1 : 0) +
    (filters.price_check ? 1 : 0) +
    TOGGLES.filter((t) => filters[t.key]).length;

  /** The products of the current search and filters, in the import format. */
  const exportList = async () => {
    setExporting(true);
    setError(null);
    try {
      const day = new Date().toISOString().slice(0, 10);
      await saveAndShare(
        "/admin/products/export",
        `catalog_${day}${active || q ? "_filtered" : ""}.xlsx`,
        XLSX,
        query,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 8, gap: 8 }}>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Название, бренд, артикул"
          testID="products-search"
        />
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Button
            small
            kind={active ? "primary" : "outline"}
            icon="options-outline"
            title={active ? `Фильтры · ${active}` : "Фильтры"}
            onPress={() => setOpen(true)}
          />
          <Button
            small
            kind="outline"
            icon="share-outline"
            title="Excel"
            loading={exporting}
            onPress={() => void exportList()}
          />
          <Button
            small
            icon="add"
            title="Товар"
            testID="product-new"
            onPress={() => router.push({ pathname: "/admin/products/[id]", params: { id: "new" } })}
          />
          {total !== undefined && (
            <Muted style={{ marginLeft: "auto", fontSize: 13 }}>{total}</Muted>
          )}
        </View>
        {error && <Notice tone="error">{error}</Notice>}
      </View>
      {products.error && !products.data ? (
        <ErrorState message={products.error.message} onRetry={() => void products.refetch()} />
      ) : !products.data ? (
        <Loader />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10, flexGrow: 1 }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (products.hasNextPage && !products.isFetchingNextPage) void products.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl
              refreshing={products.isRefetching && !products.isFetchingNextPage}
              onRefresh={() => void products.refetch()}
              tintColor={colors.gold}
            />
          }
          ListFooterComponent={products.isFetchingNextPage ? <Loader /> : undefined}
          ListEmptyComponent={<EmptyState icon="pricetag-outline" title="Товаров не найдено" />}
          renderItem={({ item: p }) => (
            <ProductRow
              product={p}
              section={p.category_id && tree.data ? fullName(tree.data, p.category_id) : null}
            />
          )}
        />
      )}
      {open && (
        <FiltersSheet
          value={filters}
          onClose={() => setOpen(false)}
          onApply={(f) => {
            setFilters(f);
            setOpen(false);
          }}
        />
      )}
    </View>
  );
}

function ProductRow({ product: p, section }: { product: AdminProduct; section: string | null }) {
  const stock = p.variants.reduce((s, v) => s + v.stock, 0);
  return (
    <Pressable
      testID={`admin-product-${p.id}`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/admin/products/[id]", params: { id: p.id } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.cream }]}
    >
      <ProductImage
        uri={p.image_url ?? p.variants[0]?.photo_url}
        seed={p.id}
        style={styles.thumb}
        iconSize={20}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Muted style={{ fontSize: 11 }}>
          {p.brand.name}
          {section ? ` · ${section}` : ""}
        </Muted>
        <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 15 }} numberOfLines={2}>
          {p.name}
          {p.type ? ` · ${p.type}` : ""}
        </Txt>
        {p.variants.length === 0 ? (
          <Txt style={{ fontSize: 12, color: colors.warn }}>Нет объёмов и цен</Txt>
        ) : (
          p.variants.slice(0, 3).map((v) => (
            <Muted key={v.id} style={{ fontSize: 12 }}>
              {volumeLabel(v.volume_ml, v.is_tester)} · {tenge(v.retail_price)} · {v.stock} шт.
            </Muted>
          ))
        )}
        {p.variants.length > 3 && (
          <Muted style={{ fontSize: 12 }}>ещё {p.variants.length - 3}…</Muted>
        )}
        <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
          {!p.is_active && <Pill tone="muted" label="Скрыт" />}
          {p.is_new && <Pill tone="gold" label="Выбор Kyko" />}
          {stock < 0 && <Pill tone="warn" label="под заказ" />}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </Pressable>
  );
}

function FiltersSheet({
  value,
  onClose,
  onApply,
}: {
  value: Filters;
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const [draft, setDraft] = useState(value);
  const { data: brands } = useApi<Brand[]>("/admin/brands");
  const { data: tree } = useApi<AdminCategory[]>("/admin/categories");
  return (
    <Sheet
      visible
      title="Фильтры"
      onClose={onClose}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            kind="outline"
            title="Сбросить"
            style={{ flex: 1 }}
            onPress={() => onApply(EMPTY)}
          />
          <Button title="Показать" style={{ flex: 2 }} onPress={() => onApply(draft)} />
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Txt style={styles.group}>На сайте</Txt>
          <View style={styles.chips}>
            {(
              [
                ["", "На сайте и скрытые"],
                ["true", "Опубликованные"],
                ["false", "Скрытые"],
              ] as const
            ).map(([v, l]) => (
              <Chip
                key={v}
                label={l}
                active={draft.is_active === v}
                onPress={() => setDraft({ ...draft, is_active: v })}
              />
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Txt style={styles.group}>Проверка цен</Txt>
          <View style={styles.chips}>
            {(
              [
                ["", "Все"],
                ["below_cost", "Ниже себестоимости"],
                ["markup_down", "Наценка упала"],
                ["markup_up", "Наценка выросла"],
              ] as const
            ).map(([v, l]) => (
              <Chip
                key={v}
                label={l}
                active={draft.price_check === v}
                onPress={() => setDraft({ ...draft, price_check: v })}
              />
            ))}
          </View>
        </View>
        {TOGGLES.map((t) => (
          <View key={t.key} style={styles.toggle}>
            <Txt style={{ flex: 1 }}>{t.label}</Txt>
            <Switch
              value={draft[t.key]}
              onValueChange={(v) => setDraft({ ...draft, [t.key]: v })}
              trackColor={{ true: colors.gold, false: colors.line }}
              thumbColor={colors.white}
              accessibilityLabel={t.label}
            />
          </View>
        ))}
        {!!tree?.length && (
          <View style={{ gap: 8 }}>
            <Txt style={styles.group}>Раздел</Txt>
            <View style={styles.chips}>
              <Chip
                label="Все"
                active={!draft.category_id}
                onPress={() => setDraft({ ...draft, category_id: "" })}
              />
              {tree.map((c) => (
                <Chip
                  key={c.id}
                  label={fullName(tree, c.id)}
                  active={draft.category_id === String(c.id)}
                  onPress={() => setDraft({ ...draft, category_id: String(c.id) })}
                />
              ))}
              <Chip
                label="Без раздела"
                active={draft.category_id === "0"}
                onPress={() => setDraft({ ...draft, category_id: "0" })}
              />
            </View>
          </View>
        )}
        {!!brands?.length && (
          <View style={{ gap: 8 }}>
            <Txt style={styles.group}>Бренд</Txt>
            <View style={styles.chips}>
              <Chip
                label="Все"
                active={!draft.brand_id}
                onPress={() => setDraft({ ...draft, brand_id: "" })}
              />
              {brands.map((b) => (
                <Chip
                  key={b.id}
                  label={b.name}
                  active={draft.brand_id === String(b.id)}
                  onPress={() => setDraft({ ...draft, brand_id: String(b.id) })}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 10,
  },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, overflow: "hidden" },
  group: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
