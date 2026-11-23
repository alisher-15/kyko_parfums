import { Image } from "expo-image";
import { router } from "expo-router";
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
import { childrenOf, useCategories } from "@/lib/categories";
import { assetUrl } from "@/lib/config";
import type { Category } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

const GAP = 10;

/**
 * Every section as a card, as Kaspi's «Категории» and the website's /categories: the name at the
 * top left, the picture at the bottom right, three in a row on phones. «Все категории» on the home
 * screen leads here; a card opens the section with its groups as chips.
 */
export default function CategoriesScreen() {
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 6 : width >= 600 ? 4 : 3;
  const size = (Math.min(width, 1200) - 32 - GAP * (columns - 1)) / columns;
  const categories = useCategories();

  if (categories.error && !categories.data)
    return (
      <ErrorState message={categories.error.message} onRetry={() => void categories.refetch()} />
    );
  if (!categories.data) return <Loader />;

  return (
    <FlatList
      key={columns}
      data={childrenOf(categories.data, null)}
      numColumns={columns}
      keyExtractor={(c) => String(c.id)}
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
      renderItem={({ item }) => <CategoryCard category={item} size={size} />}
    />
  );
}

function CategoryCard({ category: c, size }: { category: Category; size: number }) {
  const src = assetUrl(c.image_url);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={c.name}
      testID={`category-card-${c.id}`}
      onPress={() =>
        router.push({ pathname: "/collection", params: { category_id: c.id, title: c.name } })
      }
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
  card: {
    backgroundColor: "#f5f5f4",
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
