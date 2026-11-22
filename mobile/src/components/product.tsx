import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { assetUrl } from "@/lib/config";
import { useCurrency } from "@/lib/currency";
import { useFavorites } from "@/lib/favorites";
import { GENDER_LABELS, percentOff } from "@/lib/format";
import type { ProductListItem } from "@/lib/types";
import { colors, fonts, placeholderTints, radius } from "@/theme";
import { Badge, Eyebrow, Muted, Txt } from "./ui";

/** A bottle photo, or a soft tint with a drop while the product has none (like the website). */
export function ProductImage({
  uri,
  seed,
  style,
  iconSize = 32,
}: {
  uri: string | null | undefined;
  seed: number;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
}) {
  const src = assetUrl(uri);
  if (src) {
    return (
      <View style={[{ backgroundColor: colors.white }, style]}>
        <Image
          source={src}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={150}
          recyclingKey={src}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  return (
    <View
      style={[
        style,
        {
          backgroundColor: placeholderTints[seed % placeholderTints.length],
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      <Ionicons name="water-outline" size={iconSize} color="rgba(166,124,82,0.6)" />
    </View>
  );
}

/** A product in a grid or a sideways row. */
export function ProductCard({ product, width }: { product: ProductListItem; width?: number }) {
  const { money } = useCurrency();
  const favorites = useFavorites();
  const liked = favorites.has(product.id);
  const meta = [product.gender && GENDER_LABELS[product.gender], product.category]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      testID={`product-${product.id}`}
      accessibilityRole="link"
      accessibilityLabel={`${product.brand.name} ${product.name}`}
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
      style={({ pressed }) => [
        styles.card,
        width ? { width } : { flex: 1 },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.photoBox}>
        <ProductImage uri={product.image_url} seed={product.id} style={styles.photo} />
        <View style={styles.badges}>
          {product.deal && <Badge label={percentOff(product.deal.discount_percent)} />}
          {product.is_new && <Badge label="Новинка" tone="ink" />}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? "Убрать из избранного" : "В избранное"}
          hitSlop={6}
          onPress={() => favorites.toggle(product.id)}
          style={styles.heart}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={18}
            color={liked ? colors.gold : colors.muted}
          />
        </Pressable>
      </View>
      <View style={styles.body}>
        <Eyebrow numberOfLines={1} style={{ fontSize: 10 }}>
          {product.brand.name}
        </Eyebrow>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        {!!meta && (
          <Muted style={styles.meta} numberOfLines={1}>
            {meta}
          </Muted>
        )}
        <View style={styles.bottom}>
          {product.min_price !== null ? (
            <Txt style={styles.price} numberOfLines={1}>
              <Text style={styles.from}>от </Text>
              {money(product.min_price)}
            </Txt>
          ) : (
            <Muted style={{ fontSize: 13 }}>Цена по запросу</Muted>
          )}
          {product.volumes.length > 0 && (
            <Muted style={styles.meta} numberOfLines={1}>
              {product.volumes.join(" / ")} мл{product.type ? ` · ${product.type}` : ""}
            </Muted>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** − 1 + */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Меньше"
        disabled={value <= min}
        onPress={() => onChange(value - 1)}
        style={[styles.stepButton, value <= min && { opacity: 0.35 }]}
        hitSlop={4}
      >
        <Ionicons name="remove" size={18} color={colors.ink} />
      </Pressable>
      <Txt style={styles.stepValue} accessibilityLabel={`Количество ${value}`}>
        {value}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Больше"
        disabled={value >= 10_000}
        onPress={() => onChange(value + 1)}
        style={styles.stepButton}
        hitSlop={4}
      >
        <Ionicons name="add" size={18} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexShrink: 0,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  pressed: { opacity: 0.85 },
  photoBox: { aspectRatio: 1, backgroundColor: colors.white },
  photo: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: radius.sm,
  },
  badges: { position: "absolute", top: 8, left: 8, gap: 4 },
  heart: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 12,
    gap: 2,
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  name: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 21, color: colors.ink },
  meta: { fontSize: 12, lineHeight: 16 },
  bottom: { marginTop: "auto", paddingTop: 8, gap: 2 },
  price: { fontFamily: fonts.sansBold, fontSize: 15 },
  from: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    height: 44,
  },
  stepButton: { width: 40, height: 42, alignItems: "center", justifyContent: "center" },
  stepValue: {
    minWidth: 28,
    textAlign: "center",
    fontFamily: fonts.sansBold,
    fontVariant: ["tabular-nums"],
  },
});
