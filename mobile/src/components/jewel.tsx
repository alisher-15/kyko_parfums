import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { childrenOf, openCategory, useCategories } from "@/lib/categories";
import { plural } from "@/lib/format";
import { useApi, type ProductFilters } from "@/lib/queries";
import type { Page, ProductListItem } from "@/lib/types";
import { colors, fonts, radius, space, type } from "@/theme";
import { Eyebrow, Title } from "./ui";

// «Шкатулка» (the jewel box): the home page opens on a compact velvet stage with the search, the
// scent families as colored cards, and the catalog as a magazine's contents.

type Params = Record<string, string | number>;

function openCollection(title: string, params: Params) {
  router.push({ pathname: "/collection", params: { ...params, title } });
}

/**
 * The stage: a compact velvet-into-cherry band with the light logo and the search (what the
 * shop promises is said right below, in the trust line). `top`: the status bar's room, painted by the stage. `header`: the logo row.
 */
export function Stage({ top, header }: { top: number; header: ReactNode }) {
  return (
    <LinearGradient
      colors={[colors.deep, colors.velvet, "#7a2136"]}
      locations={[0, 0.7, 1]}
      style={[styles.stage, { paddingTop: top + 6 }]}
    >
      {header}
      <Pressable
        accessibilityRole="search"
        testID="home-search"
        onPress={() => router.navigate("/catalog")}
        style={({ pressed }) => [styles.stageSearch, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="search-outline" size={18} color={colors.champagne} />
        <Text style={styles.stageSearchText}>Аромат, бренд или нота</Text>
      </Pressable>
    </LinearGradient>
  );
}

/** The scent families, each with its colors and the notes it is known by. */
const MOODS: Record<string, { colors: [string, string]; notes: string; light?: boolean }> = {
  Цветочные: { colors: ["#f8dde0", "#e7a7b4"], notes: "роза · жасмин · пион" },
  Древесные: { colors: ["#ead6c1", "#b88b64"], notes: "сандал · кедр · ветивер" },
  Восточные: { colors: ["#8a2a3c", "#2a070e"], notes: "амбра · ваниль · уд", light: true },
  Цитрусовые: { colors: ["#faf0c8", "#e6c96e"], notes: "бергамот · лимон · нероли" },
  Акватические: { colors: ["#e2eff5", "#93bfd3"], notes: "морской бриз · озон" },
  Фужерные: { colors: ["#e3eadb", "#97ad84"], notes: "лаванда · мох · герань" },
  Гурманские: { colors: ["#f3e0ca", "#c4905f"], notes: "ваниль · карамель · кофе" },
  Пряные: { colors: ["#f3d2b6", "#b2603a"], notes: "перец · кардамон · гвоздика" },
  Шипровые: { colors: ["#e0e2cf", "#878f66"], notes: "бергамот · пачули · мох" },
  Фруктовые: { colors: ["#fadfd2", "#e7957c"], notes: "персик · груша · ягоды" },
};

/** «Аромат по настроению»: the families the catalog has, as colored cards in a row. */
export function Moods() {
  const filters = useApi<{ categories: string[] }>("/filters");
  const families = (filters.data?.categories ?? []).filter((c) => MOODS[c]);
  if (families.length === 0) return null;
  return (
    <View style={{ marginTop: space.section }}>
      <View style={styles.head}>
        <Eyebrow>Аромат по настроению</Eyebrow>
        <Title style={{ marginTop: 6 }}>Что вам ближе?</Title>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {families.map((family) => {
          const m = MOODS[family];
          return (
            <Pressable
              key={family}
              accessibilityRole="link"
              accessibilityLabel={`${family}: ${m.notes}`}
              onPress={() => openCollection(family, { family })}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={m.colors} style={styles.mood}>
                <Text
                  // Long names («Акватические») a size smaller: the web ignores fitting.
                  style={[
                    styles.moodName,
                    family.length > 10 && { fontSize: 20 },
                    m.light && { color: colors.white },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {family}
                </Text>
                <Text style={[styles.moodNotes, m.light && { color: colors.onVelvetMuted }]}>
                  {m.notes}
                </Text>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** One line of the contents: the name large, how many there are small, an arrow. */
function IndexRow({
  title,
  params,
  note,
  onPress,
}: {
  title: string;
  params: Params;
  note?: (total: number) => string;
  onPress?: () => void;
}) {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    ...params,
    page_size: 1,
  } as ProductFilters & Params);
  if (data && data.total === 0) return null;
  const count = data
    ? note
      ? note(data.total)
      : `${data.total} ${plural(data.total, "аромат", "аромата", "ароматов")}`
    : " ";
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={onPress ?? (() => openCollection(title, params))}
      style={({ pressed }) => [styles.indexRow, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.indexName}>{title}</Text>
      <Text style={styles.indexCount}>{count}</Text>
      <Ionicons name="arrow-forward" size={18} color={colors.ink} />
    </Pressable>
  );
}

/**
 * The catalog as a magazine's contents: for her, for him, unisex, testers, niche, then the
 * catalog's other sections. Replaces the tiles of «С чего начнём?».
 */
export function CatalogIndex() {
  const tree = useCategories().data;
  const sections = tree ? childrenOf(tree, null) : [];
  const perfume = sections.find((c) => c.kind === "perfume");
  const others = sections.filter((c) => c !== perfume);
  return (
    <View style={{ marginTop: space.section, marginHorizontal: 16 }} testID="start-grid">
      <Eyebrow>Каталог</Eyebrow>
      <Title style={{ marginTop: 6, marginBottom: 8 }}>С чего начнём?</Title>
      <IndexRow title="Для неё" params={{ gender: "female" }} />
      <IndexRow title="Для него" params={{ gender: "male" }} />
      <IndexRow title="Унисекс" params={{ gender: "unisex" }} />
      <IndexRow title="Тестеры" params={{ tester: "true" }} note={() => "дешевле флакона"} />
      <IndexRow title="Ниша и люкс" params={{ top: "true" }} />
      {others.map((c) => (
        <IndexRow
          key={c.id}
          title={c.name}
          params={{ category_id: c.id }}
          note={(n) => `${n} ${plural(n, "товар", "товара", "товаров")}`}
          onPress={() => openCategory(tree ?? [], c)}
        />
      ))}
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/categories")}
        style={({ pressed }) => [styles.indexRow, pressed && { opacity: 0.6 }]}
      >
        <Text style={[styles.indexName, { color: colors.gold }]}>Все категории</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.gold} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  stageSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: "rgba(244,237,228,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(233,201,190,0.45)",
  },
  stageSearchText: { fontFamily: fonts.sans, fontSize: 14, color: colors.onVelvetMuted },
  head: { paddingHorizontal: 16, marginBottom: 16 },
  mood: {
    width: 160,
    height: 200,
    borderRadius: radius.lg,
    padding: 16,
    justifyContent: "flex-end",
    gap: 6,
  },
  moodName: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 28, color: colors.ink },
  moodNotes: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(42,7,14,0.75)",
  },
  indexRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  indexName: { flex: 1, fontFamily: fonts.serif, fontSize: 30, lineHeight: 34, color: colors.ink },
  indexCount: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
});
