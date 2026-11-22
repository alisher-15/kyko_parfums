import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi, useProducts, type ProductFilters } from "@/lib/queries";
import { GENDER_LABELS, SORT_LABELS, plural } from "@/lib/format";
import type { Filters, Gender, ProductSort } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";
import { ProductCard } from "./product";
import { Button, Chip, EmptyState, ErrorState, Field, Loader, Muted, Title, Txt } from "./ui";

type UserFilters = Omit<ProductFilters, "q" | "sort" | "promotion_id">;

const SORTS = Object.keys(SORT_LABELS) as ProductSort[];

function countFilters(f: UserFilters): number {
  return (
    (f.brand_id?.length ?? 0) +
    (f.gender?.length ?? 0) +
    (f.category?.length ?? 0) +
    (f.type?.length ?? 0) +
    (f.min_price !== undefined || f.max_price !== undefined ? 1 : 0) +
    (f.on_sale ? 1 : 0) +
    (f.is_new ? 1 : 0)
  );
}

/**
 * The catalog: search, filters, sort and a grid that loads more as the customer scrolls.
 * `fixed` filters come from where the customer came from (a brand, a promotion) and stay on.
 */
export function CatalogView({
  fixed = {},
  autoFocus,
}: {
  fixed?: ProductFilters;
  autoFocus?: boolean;
}) {
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const cardWidth = (Math.min(width, 1200) - 32 - 12 * (columns - 1)) / columns;

  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ProductSort>(fixed.sort ?? "default");
  const [chosen, setChosen] = useState<UserFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // Search as the customer types, without a request per letter.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const filters = useMemo<ProductFilters>(
    () => ({
      ...chosen,
      ...fixed,
      // Both the fixed and the chosen brands narrow the list.
      brand_id: fixed.brand_id ?? chosen.brand_id,
      q: q || undefined,
      sort,
    }),
    [chosen, fixed, q, sort],
  );
  const products = useProducts(filters);
  const items = useMemo(() => products.data?.pages.flatMap((p) => p.items) ?? [], [products.data]);
  const total = products.data?.pages[0]?.total;
  const active = countFilters(chosen);

  let body: ReactNode = null;
  if (products.error && !products.data) {
    body = <ErrorState message={products.error.message} onRetry={() => void products.refetch()} />;
  } else if (!products.data) {
    body = <Loader />;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.top}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="catalog-search"
            value={text}
            onChangeText={setText}
            placeholder="Аромат или бренд"
            placeholderTextColor={colors.faint}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoFocus={autoFocus}
            accessibilityLabel="Поиск"
          />
          {!!text && (
            <Pressable accessibilityLabel="Очистить поиск" onPress={() => setText("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.faint} />
            </Pressable>
          )}
        </View>
        <View style={styles.toolbar}>
          <ToolButton
            icon="options-outline"
            label={active ? `Фильтры · ${active}` : "Фильтры"}
            active={active > 0}
            onPress={() => setFiltersOpen(true)}
          />
          <ToolButton
            icon="swap-vertical"
            label={SORT_LABELS[sort]}
            onPress={() => setSortOpen(true)}
          />
          {total !== undefined && (
            <Muted style={{ marginLeft: "auto", fontSize: 13 }}>
              {total} {plural(total, "товар", "товара", "товаров")}
            </Muted>
          )}
        </View>
      </View>

      {body ?? (
        <FlatList
          key={columns}
          data={items}
          numColumns={columns}
          keyExtractor={(p) => String(p.id)}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, flexGrow: 1 }}
          renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
          onEndReachedThreshold={0.6}
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
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="Ничего не нашлось"
              text="Попробуйте другое название или уберите часть фильтров."
              action={
                (active > 0 || !!text) && (
                  <Button
                    kind="outline"
                    title="Сбросить поиск и фильтры"
                    onPress={() => {
                      setText("");
                      setChosen({});
                    }}
                  />
                )
              }
            />
          }
          keyboardDismissMode="on-drag"
        />
      )}

      <FiltersSheet
        visible={filtersOpen}
        value={chosen}
        hideBrands={!!fixed.brand_id}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setChosen(next);
          setFiltersOpen(false);
        }}
      />
      <Sheet visible={sortOpen} title="Сортировка" onClose={() => setSortOpen(false)}>
        {SORTS.map((s) => (
          <Pressable
            key={s}
            accessibilityRole="radio"
            accessibilityState={{ checked: s === sort }}
            onPress={() => {
              setSort(s);
              setSortOpen(false);
            }}
            style={styles.option}
          >
            <Txt style={{ fontFamily: s === sort ? fonts.sansBold : fonts.sans }}>
              {SORT_LABELS[s]}
            </Txt>
            {s === sort && <Ionicons name="checkmark" size={20} color={colors.gold} />}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: "options-outline" | "swap-vertical";
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tool,
        active && { borderColor: colors.ink, backgroundColor: colors.ink },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={16} color={active ? colors.white : colors.ink} />
      <Txt style={[styles.toolText, active && { color: colors.white }]} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** A panel sliding up from the bottom. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
      >
        <View style={styles.sheetHead}>
          <Title style={{ fontSize: 24 }}>{title}</Title>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={onClose}
            hitSlop={10}
          >
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer && <View style={styles.sheetFooter}>{footer}</View>}
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface FiltersSheetProps {
  visible: boolean;
  value: UserFilters;
  hideBrands: boolean;
  onClose: () => void;
  onApply: (filters: UserFilters) => void;
}

/** Mounted while open, so every opening starts from the filters in use. */
function FiltersSheet(props: FiltersSheetProps) {
  return props.visible ? <FiltersForm {...props} /> : null;
}

function FiltersForm({ value, hideBrands, onClose, onApply }: FiltersSheetProps) {
  const { data } = useApi<Filters>("/filters");
  const [draft, setDraft] = useState<UserFilters>(value);
  const [minText, setMinText] = useState(
    value.min_price !== undefined ? String(value.min_price) : "",
  );
  const [maxText, setMaxText] = useState(
    value.max_price !== undefined ? String(value.max_price) : "",
  );

  function toggle<K extends "brand_id" | "gender" | "category" | "type">(
    key: K,
    item: NonNullable<UserFilters[K]>[number],
  ) {
    setDraft((d) => {
      const list = (d[key] ?? []) as (typeof item)[];
      const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
      return { ...d, [key]: next.length ? next : undefined };
    });
  }

  const price = (t: string) => {
    const n = Number(t.replace(/\D/g, ""));
    return t.trim() && Number.isFinite(n) ? n : undefined;
  };

  const apply = () => onApply({ ...draft, min_price: price(minText), max_price: price(maxText) });

  return (
    <Sheet
      visible
      title="Фильтры"
      onClose={onClose}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button kind="outline" title="Сбросить" style={{ flex: 1 }} onPress={() => onApply({})} />
          <Button title="Показать" style={{ flex: 2 }} onPress={apply} testID="filters-apply" />
        </View>
      }
    >
      {!data ? (
        <Loader />
      ) : (
        <View style={{ gap: 20 }}>
          <View style={{ gap: 10 }}>
            <ToggleRow
              label="Только товары по акции"
              value={!!draft.on_sale}
              onChange={(v) => setDraft((d) => ({ ...d, on_sale: v || undefined }))}
            />
            <ToggleRow
              label="Новинки"
              value={!!draft.is_new}
              onChange={(v) => setDraft((d) => ({ ...d, is_new: v || undefined }))}
            />
          </View>
          {data.genders.length > 0 && (
            <Group title="Для кого">
              {data.genders.map((g: Gender) => (
                <Chip
                  key={g}
                  label={GENDER_LABELS[g]}
                  active={draft.gender?.includes(g)}
                  onPress={() => toggle("gender", g)}
                />
              ))}
            </Group>
          )}
          {!hideBrands && data.brands.length > 0 && (
            <Group title="Бренд">
              {data.brands.map((b) => (
                <Chip
                  key={b.id}
                  label={`${b.name} · ${b.product_count}`}
                  active={draft.brand_id?.includes(b.id)}
                  onPress={() => toggle("brand_id", b.id)}
                />
              ))}
            </Group>
          )}
          {data.categories.length > 0 && (
            <Group title="Группа ароматов">
              {data.categories.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={draft.category?.includes(c)}
                  onPress={() => toggle("category", c)}
                />
              ))}
            </Group>
          )}
          {data.types.length > 0 && (
            <Group title="Тип">
              {data.types.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={draft.type?.includes(t)}
                  onPress={() => toggle("type", t)}
                />
              ))}
            </Group>
          )}
          <View style={{ gap: 8 }}>
            <Txt style={styles.groupTitle}>Цена, ₸</Txt>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Field
                label="от"
                style={{ flex: 1 }}
                value={minText}
                onChangeText={setMinText}
                keyboardType="number-pad"
                placeholder={data.price_min !== null ? String(Math.floor(data.price_min)) : ""}
              />
              <Field
                label="до"
                style={{ flex: 1 }}
                value={maxText}
                onChangeText={setMaxText}
                keyboardType="number-pad"
                placeholder={data.price_max !== null ? String(Math.ceil(data.price_max)) : ""}
              />
            </View>
          </View>
        </View>
      )}
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt style={styles.groupTitle}>{title}</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <Txt style={{ flex: 1 }}>{label}</Txt>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.gold, false: colors.line }}
        thumbColor={colors.white}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 10 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    height: "100%",
  },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8 },
  tool: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    height: 36,
    maxWidth: 190,
  },
  toolText: { fontFamily: fonts.sansSemi, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: "rgba(28,25,23,0.35)" },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sheetFooter: { paddingHorizontal: 16, paddingTop: 12 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  groupTitle: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted },
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
