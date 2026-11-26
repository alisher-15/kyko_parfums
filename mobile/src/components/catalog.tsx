import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
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
import { router } from "expo-router";
import { chipsFor, childrenOf, useCategories } from "@/lib/categories";
import { useApi, useProducts, type ProductFilters } from "@/lib/queries";
import { GENDER_LABELS, SORT_LABELS, plural } from "@/lib/format";
import type { Filters, Gender, ProductSort } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";
import { ProductCard } from "./product";
import { Button, Chip, EmptyState, ErrorState, Field, Loader, Muted, Title, Txt } from "./ui";

type UserFilters = Omit<ProductFilters, "q" | "sort" | "promotion_id" | "category_id" | "id">;

const SORTS = Object.keys(SORT_LABELS) as ProductSort[];

function countFilters(f: UserFilters): number {
  return (
    (f.brand_id?.length ?? 0) +
    (f.gender?.length ?? 0) +
    (f.category?.length ?? 0) +
    (f.type?.length ?? 0) +
    (f.min_price !== undefined || f.max_price !== undefined ? 1 : 0) +
    (f.on_sale ? 1 : 0) +
    (f.is_new ? 1 : 0) +
    (f.tester ? 1 : 0) +
    (f.top ? 1 : 0)
  );
}

/**
 * The catalog: search, filters, sort and a grid that loads more as the customer scrolls.
 * `fixed` filters come from where the customer came from (a brand, a promotion) and stay on.
 * `query`: a search typed elsewhere (the home screen), shown in the field and run at once.
 * `focusKey`: when it changes, the search field takes the focus (the keyboard opens).
 */
export function CatalogView({
  fixed = {},
  autoFocus,
  query,
  focusKey,
}: {
  fixed?: ProductFilters;
  autoFocus?: boolean;
  query?: string;
  focusKey?: string;
}) {
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const cardWidth = (Math.min(width, 1200) - 32 - 12 * (columns - 1)) / columns;

  const [text, setText] = useState(query ?? "");
  const [q, setQ] = useState((query ?? "").trim());
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    if (focusKey) input.current?.focus();
  }, [focusKey]);
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
    body = <CardSkeletons columns={columns} width={cardWidth} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.top}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            ref={input}
            testID="catalog-search"
            value={text}
            onChangeText={setText}
            placeholder="Аромат или бренд"
            placeholderTextColor={colors.muted}
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

      <SectionChips
        categoryId={fixed.category_id}
        // Only the whole catalog offers the sections; a brand or a promotion keeps its own list.
        show={fixed.category_id !== undefined || Object.keys(fixed).length === 0}
      />

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
        categoryId={fixed.category_id}
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

/**
 * The catalog tree over the products, as on the website: in the whole catalog its sections; in a
 * section «Все» and its groups; in a group without groups of its own, its siblings.
 */
function SectionChips({ categoryId, show }: { categoryId?: number; show: boolean }) {
  const tree = useCategories().data;
  if (!show || !tree) return null;
  let chips: { key: string; label: string; active: boolean; onPress: () => void }[];
  if (categoryId === undefined) {
    chips = childrenOf(tree, null).map((c) => ({
      key: String(c.id),
      label: c.name,
      active: false,
      onPress: () =>
        router.push({ pathname: "/collection", params: { category_id: c.id, title: c.name } }),
    }));
  } else {
    const open = (id: number, title: string) =>
      router.setParams({ category_id: String(id), title });
    const { parent, chips: nodes } = chipsFor(tree, categoryId);
    if (nodes.length === 0) return null;
    chips = [
      ...(parent
        ? [
            {
              key: "all",
              label: "Все",
              active: parent.id === categoryId,
              onPress: () => open(parent.id, parent.name),
            },
          ]
        : []),
      ...nodes.map((c) => ({
        key: String(c.id),
        label: c.name,
        active: c.id === categoryId,
        onPress: () => open(c.id, c.name),
      })),
    ];
  }
  if (chips.length === 0) return null;
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="Подразделы"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}
      >
        {chips.map((c) => (
          <Chip key={c.key} label={c.label} active={c.active} onPress={c.onPress} />
        ))}
      </ScrollView>
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
        active && { borderColor: colors.velvet, backgroundColor: colors.velvet },
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
  /** The section the list is in: its brands, genders and types only. */
  categoryId?: number;
  onClose: () => void;
  onApply: (filters: UserFilters) => void;
}

/** Mounted while open, so every opening starts from the filters in use. */
function FiltersSheet(props: FiltersSheetProps) {
  return props.visible ? <FiltersForm {...props} /> : null;
}

function FiltersForm({ value, hideBrands, categoryId, onClose, onApply }: FiltersSheetProps) {
  const { data } = useApi<Filters>("/filters", { category_id: categoryId });
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
              label="Выбор Kyko"
              value={!!draft.is_new}
              onChange={(v) => setDraft((d) => ({ ...d, is_new: v || undefined }))}
            />
            <ToggleRow
              label="Тестеры"
              value={!!draft.tester}
              onChange={(v) => setDraft((d) => ({ ...d, tester: v || undefined }))}
            />
            <ToggleRow
              label="Ниша и люкс"
              value={!!draft.top}
              onChange={(v) => setDraft((d) => ({ ...d, top: v || undefined }))}
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
            <BrandFilter
              brands={data.brands}
              selected={draft.brand_id ?? []}
              onToggle={(id) => toggle("brand_id", id)}
            />
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

/** The brands with the most products shown at first; the rest behind «Все бренды». */
const BRANDS_SHOWN = 10;

/**
 * The brand filter: a search field, the biggest brands (and the chosen ones) as chips, and every
 * brand as a list with check marks after «Все бренды» or while searching, so hundreds of brands
 * never pour out at once.
 */
function BrandFilter({
  brands,
  selected,
  onToggle,
}: {
  brands: Filters["brands"];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const [text, setText] = useState("");
  const [all, setAll] = useState(false);
  const q = text.trim().toLowerCase();
  const asList = all || !!q;
  const list = brands
    .filter((b) => !q || b.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const top = [
    ...brands.filter((b) => selected.includes(b.id)),
    ...[...brands]
      .sort((a, b) => b.product_count - a.product_count)
      .filter((b) => !selected.includes(b.id))
      .slice(0, BRANDS_SHOWN),
  ];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt style={styles.groupTitle}>
          Бренд{selected.length ? ` · выбрано ${selected.length}` : ""}
        </Txt>
        {asList && !q && (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setAll(false)}>
            <Txt style={styles.link}>Свернуть</Txt>
          </Pressable>
        )}
      </View>
      {brands.length > BRANDS_SHOWN && (
        <View style={[styles.search, { height: 40 }]}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Найти бренд"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { fontSize: 15 }]}
            autoCorrect={false}
            accessibilityLabel="Найти бренд"
          />
        </View>
      )}
      {asList ? (
        <View style={styles.brandList}>
          {list.length === 0 && <Muted style={{ padding: 12 }}>Ничего не нашлось</Muted>}
          {list.map((b) => {
            const on = selected.includes(b.id);
            return (
              <Pressable
                key={b.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => onToggle(b.id)}
                style={styles.brandRow}
              >
                <Ionicons
                  name={on ? "checkbox" : "square-outline"}
                  size={20}
                  color={on ? colors.gold : colors.faint}
                />
                <Txt style={{ flex: 1, fontFamily: on ? fonts.sansSemi : fonts.sans }}>
                  {b.name}
                </Txt>
                <Muted style={{ fontSize: 12 }}>{b.product_count}</Muted>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {top.map((b) => (
            <Chip
              key={b.id}
              label={b.name}
              active={selected.includes(b.id)}
              onPress={() => onToggle(b.id)}
            />
          ))}
          {brands.length > top.length && (
            <Chip label={`Все бренды · ${brands.length}`} onPress={() => setAll(true)} />
          )}
        </View>
      )}
    </View>
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

/**
 * The catalog's first load: the shape of the cards that are coming (photo, brand, name,
 * price), so the grid doesn't jump when they arrive. Still, no shimmer.
 */
function CardSkeletons({ columns, width }: { columns: number; width: number }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Загружаем товары"
      style={styles.skeletons}
    >
      {Array.from({ length: columns * 2 }, (_, i) => (
        <View key={i} style={[styles.skeleton, { width }]}>
          <View style={[styles.skeletonPhoto, { height: width }]} />
          <View style={{ paddingTop: 12, gap: 8 }}>
            <View style={[styles.skeletonBar, { width: "40%" }]} />
            <View style={[styles.skeletonBar, { width: "80%", height: 14 }]} />
            <View style={[styles.skeletonBar, { width: "55%" }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletons: { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 16, paddingTop: 4 },
  // The card's shape: a photo window and three lines under it, no frame.
  skeleton: {},
  skeletonPhoto: { backgroundColor: colors.goldSoft, borderRadius: radius.lg },
  skeletonBar: { height: 10, borderRadius: 5, backgroundColor: colors.goldSoft },
  top: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 10 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    height: 44,
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
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    height: 36,
    maxWidth: 190,
  },
  toolText: { fontFamily: fonts.sansMedium, fontSize: 13 },
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
  link: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.gold },
  brandList: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
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
