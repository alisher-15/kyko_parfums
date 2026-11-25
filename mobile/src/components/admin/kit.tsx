import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ProductImage } from "@/components/product";
import { Card, Chip, EmptyState, Loader, Muted, Title, Txt } from "@/components/ui";
import type { VariantSearchItem } from "@/lib/admin-types";
import { useAuth } from "@/lib/auth";
import { tenge, volumeLabel } from "@/lib/format";
import { useApi } from "@/lib/queries";
import { may, type Area } from "@/lib/staff";
import { colors, fonts, radius } from "@/theme";

/** «Are you sure?» — the phone's dialog, or the browser's in the web build. */
export function confirm(title: string, message: string, ok = "Да"): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  }
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Отмена", style: "cancel", onPress: () => resolve(false) },
      { text: ok, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

/**
 * A section of the admin: checks the role (the API checks it again) and sets the title.
 * `area` null: the owner's alone.
 */
export function AdminScreen({
  title,
  area,
  children,
}: {
  title: string;
  area: Area | null;
  children: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <>
      <Stack.Screen options={{ title }} />
      {may(user?.role, area) ? (
        children
      ) : (
        <EmptyState
          icon="lock-closed-outline"
          title="Нет доступа"
          text="Этот раздел открыт владельцу магазина."
        />
      )}
    </>
  );
}

/** A titled block of a form or a card. */
export function Block({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card style={[{ gap: 12 }, style]}>
      {(title || right) && (
        <View style={styles.blockHead}>
          {title && <Title style={{ fontSize: 22, flex: 1 }}>{title}</Title>}
          {right}
        </View>
      )}
      {children}
    </Card>
  );
}

/** «Label ........ value» */
export function KV({
  label,
  value,
  strong,
  color,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
  color?: string;
}) {
  return (
    <View style={styles.kv}>
      <Muted style={{ fontSize: 14, flexShrink: 1 }}>{label}</Muted>
      <Txt
        style={[
          { fontSize: 14, textAlign: "right", flexShrink: 1 },
          strong && { fontFamily: fonts.sansBold },
          color ? { color } : null,
        ]}
      >
        {value}
      </Txt>
    </View>
  );
}

/** Tabs in a row that scrolls sideways: statuses, kinds. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.seg, on && styles.segOn]}
          >
            <Text style={[styles.segText, on && { color: colors.white }]}>
              {o.label}
              {o.count !== undefined ? ` · ${o.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A search box that reports its text a moment after typing stops. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  testID,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  testID?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== value) onChange(text.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        testID={testID}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.searchInput}
        accessibilityLabel={placeholder}
      />
      {!!text && (
        <Pressable accessibilityLabel="Очистить" onPress={() => setText("")} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.faint} />
        </Pressable>
      )}
    </View>
  );
}

/** Find a volume by name, SKU or barcode (the till's search) and pick it. */
export function VariantSearch({
  onPick,
  placeholder = "Название, артикул или штрихкод",
  showCost = false,
  initialQuery = "",
}: {
  onPick: (item: VariantSearchItem) => void;
  placeholder?: string;
  showCost?: boolean;
  /** A search to start with (the user can change it). */
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const { data, isFetching } = useApi<VariantSearchItem[]>(q ? "/admin/store/variants" : null, {
    q,
    limit: 20,
  });
  return (
    <View style={{ gap: 8 }}>
      <SearchBox value={q} onChange={setQ} placeholder={placeholder} testID="variant-search" />
      {q !== "" && isFetching && !data && <Loader />}
      {q !== "" && data?.length === 0 && <Muted style={{ fontSize: 13 }}>Ничего не нашлось</Muted>}
      {q !== "" &&
        data?.map((v) => (
          <VariantRow
            key={v.variant_id}
            item={v}
            showCost={showCost}
            onPress={() => onPick(v)}
            testID={`pick-${v.variant_id}`}
          />
        ))}
    </View>
  );
}

export function VariantRow({
  item: v,
  onPress,
  right,
  showCost,
  testID,
}: {
  item: Pick<
    VariantSearchItem,
    | "product_id"
    | "brand_name"
    | "product_name"
    | "volume_ml"
    | "is_tester"
    | "sku"
    | "image_url"
    | "stock"
    | "retail_price"
    | "cost_price"
  >;
  onPress?: () => void;
  right?: ReactNode;
  showCost?: boolean;
  testID?: string;
}) {
  const body = (
    <>
      <ProductImage uri={v.image_url} seed={v.product_id} style={styles.thumb} iconSize={18} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }} numberOfLines={2}>
          {v.brand_name} {v.product_name}
        </Txt>
        <Muted style={{ fontSize: 12 }}>
          {volumeLabel(v.volume_ml, v.is_tester)}
          {v.sku ? ` · ${v.sku}` : ""} · остаток {v.stock}
        </Muted>
        <Txt style={{ fontSize: 13 }}>
          {tenge(v.retail_price)}
          {showCost && v.cost_price !== null ? (
            <Text style={{ color: colors.muted }}> · себест. {tenge(v.cost_price)}</Text>
          ) : null}
        </Txt>
      </View>
      {right}
    </>
  );
  if (!onPress) return <View style={styles.variantRow}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.variantRow, pressed && { backgroundColor: colors.goldSoft }]}
    >
      {body}
    </Pressable>
  );
}

/** A small colored label: a document's state, a user's role. */
export function Pill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "ok" | "warn" | "muted" | "gold" | "danger";
}) {
  const t = {
    ok: { bg: colors.okSoft, fg: colors.ok },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    muted: { bg: "#f5f5f4", fg: colors.muted },
    gold: { bg: colors.goldSoft, fg: colors.goldDark },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** A labelled on/off switch: «Показывать на сайте», «Выбор Kyko». */
export function Toggle({
  label,
  value,
  onChange,
  hint,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  testID?: string;
}) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontSize: 14 }}>{label}</Txt>
        {hint && <Muted style={{ fontSize: 12 }}>{hint}</Muted>}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.gold, false: colors.line }}
        thumbColor={colors.white}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** One choice out of a few, as chips that wrap: a brand, a gender, a supplier. */
export function ChipPicker<T extends string | number>({
  label,
  value,
  options,
  onChange,
  allowNone,
}: {
  label?: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T | null) => void;
  allowNone?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {allowNone && (
          <Chip label={allowNone} active={value === null} onPress={() => onChange(null)} />
        )}
        {options.map((o) => (
          <Chip
            key={String(o.value)}
            label={o.label}
            active={o.value === value}
            onPress={() => onChange(o.value)}
          />
        ))}
      </View>
    </View>
  );
}

/** Whole tenge typed into a field: "12 500" → 12500; empty → null. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/\s/g, "").replace(",", ".");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export function moneyText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 40 },
  label: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 0.4, color: colors.muted },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  seg: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  segOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  segText: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.ink },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 16, color: colors.ink, height: "100%" },
  variantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 8,
  },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, overflow: "hidden" },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  pillText: { fontFamily: fonts.sansBold, fontSize: 11 },
});
