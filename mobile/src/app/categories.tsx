import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { ErrorState, Loader } from "@/components/ui";
import { childrenOf, openCategory, useCategories } from "@/lib/categories";
import { plural } from "@/lib/format";
import { assetUrl } from "@/lib/config";
import type { Category } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

const GAP = 10;

/**
 * The catalog tree step by step, as Kaspi's «Категории» and the website's /categories: the
 * sections as cards (the name at the top left, the picture at the bottom right, three in a row);
 * a section with groups opens its groups the same way (`parent`), with «Все товары» first; a node
 * without groups opens its products. «Все категории» on the home screen leads here.
 */
export default function CategoriesScreen() {
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 6 : width >= 600 ? 4 : 3;
  const size = (Math.min(width, 1200) - 32 - GAP * (columns - 1)) / columns;
  const categories = useCategories();
  const params = useLocalSearchParams<{ parent?: string; title?: string }>();
  const parentId = Number(params.parent) || null;
  const all = categories.data ?? [];
  const parent = parentId ? all.find((c) => c.id === parentId) : undefined;
  // A link to a node that is gone shows the sections.
  const nodes = childrenOf(all, parent ? parent.id : null);
  type Cell = Category | { all: true };
  const cells: Cell[] = parent ? [{ all: true }, ...nodes] : nodes;

  if (categories.error && !categories.data)
    return (
      <ErrorState message={categories.error.message} onRetry={() => void categories.refetch()} />
    );
  if (!categories.data) return <Loader />;

  return (
    <>
      <Stack.Screen options={{ title: parent?.name ?? "Категории" }} />
      <FlatList
        key={columns}
        data={cells}
        numColumns={columns}
        keyExtractor={(c) => ("all" in c ? "all" : String(c.id))}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ padding: 16, gap: GAP }}
        accessibilityLabel="Категории"
        refreshControl={
          <RefreshControl
            refreshing={categories.isRefetching}
            onRefresh={() => void categories.refetch()}
            tintColor={colors.gold}
          />
        }
        renderItem={({ item }) =>
          "all" in item ? (
            parent && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Все товары: ${parent.name}`}
                onPress={() =>
                  router.push({
                    pathname: "/collection",
                    params: { category_id: parent.id, title: parent.name },
                  })
                }
                style={({ pressed }) => [
                  styles.card,
                  styles.allCard,
                  { width: size, height: size },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.name, { color: colors.white }]}>Все товары</Text>
                <Text style={styles.allCount}>
                  {parent.product_count}{" "}
                  {plural(parent.product_count, "товар", "товара", "товаров")} →
                </Text>
              </Pressable>
            )
          ) : (
            <CategoryCard category={item} size={size} onPress={() => openCategory(all, item)} />
          )
        }
      />
    </>
  );
}

function CategoryCard({
  category: c,
  size,
  onPress,
}: {
  category: Category;
  size: number;
  onPress: () => void;
}) {
  const src = assetUrl(c.image_url);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={c.name}
      testID={`category-card-${c.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width: size, height: size },
        pressed && { backgroundColor: "#e7e5e4" },
      ]}
    >
      {src ? (
        // White photo backgrounds melt into the card, as on Kaspi.
        <View style={styles.picture}>
          <Image
            source={src}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            contentPosition="right bottom"
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : (
        <Text style={styles.letter}>{c.name.slice(0, 1)}</Text>
      )}
      <Text style={styles.name} numberOfLines={2}>
        {c.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  allCard: { backgroundColor: colors.velvet, justifyContent: "space-between", paddingBottom: 10 },
  allCount: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.onVelvetMuted,
    paddingHorizontal: 10,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  name: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
    color: colors.ink,
    padding: 10,
  },
  picture: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "78%",
    height: "68%",
    mixBlendMode: "multiply",
  },
  letter: {
    position: "absolute",
    right: 8,
    bottom: -4,
    fontFamily: fonts.serif,
    fontSize: 56,
    color: colors.gold,
    opacity: 0.4,
  },
});
