import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { assetUrl } from "@/lib/config";
import { useCurrency } from "@/lib/currency";
import { useFavorites } from "@/lib/favorites";
import { GENDER_LABELS, percentOff } from "@/lib/format";
import type { ProductListItem } from "@/lib/types";
import { colors, fonts, placeholderTints, radius, studioTints, type } from "@/theme";
import { Badge, Eyebrow, Muted, Txt } from "./ui";

/**
 * A bottle photo, or a soft tint with a drop while the product has none (like the website).
 * `studio`: the bottle on a colored backdrop, the photo's white
 * multiplied away (the photos are bottles on white squares, scripts/normalize_photos.py).
 */
export function ProductImage({
  uri,
  seed,
  style,
  iconSize = 32,
  studio = false,
}: {
  uri: string | null | undefined;
  seed: number;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
  studio?: boolean;
}) {
  const src = assetUrl(uri);
  if (src && studio) {
    const tint = studioTints[seed % studioTints.length];
    return (
      <View style={style}>
        <LinearGradient
          colors={["#ffffff", tint]}
          locations={[0.05, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Image
          source={src}
          style={[StyleSheet.absoluteFill, styles.studioPhoto]}
          contentFit="contain"
          transition={150}
          recyclingKey={src}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
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
      <Ionicons name="water-outline" size={iconSize} color="rgba(92,16,32,0.35)" />
    </View>
  );
}

/**
 * A product in a grid or a sideways row. `compact`: the home page's rows, a smaller card with
 * brand, name, price and volumes only. `note`: one more badge («Купили 41 раз»). `tester`: the
 * card of the home page's «Тестеры»: the tester's price next to the bottle's, struck through.
 * `dark`: the words on a velvet band (light text).
 */
export function ProductCard({
  product,
  width,
  compact = false,
  note,
  tester = false,
  dark = false,
}: {
  product: ProductListItem;
  width?: number;
  compact?: boolean;
  note?: string;
  tester?: boolean;
  dark?: boolean;
}) {
  const light = dark ? { color: colors.pearl } : null;
  const soft = dark ? { color: colors.onVelvetMuted } : null;
  const { money } = useCurrency();
  const offer = tester ? product.tester : null;
  const favorites = useFavorites();
  const liked = favorites.has(product.id);
  const meta = [product.gender && GENDER_LABELS[product.gender], product.category]
    .filter(Boolean)
    .join(" · ");
  // One mark on the photo at most: the saving first, then what the shop says about it.
  const badge = offer
    ? {
        label: `−${Math.round((1 - offer.price / offer.bottle_price) * 100)}%`,
        tone: "gold" as const,
      }
    : product.deal
      ? { label: percentOff(product.deal.discount_percent), tone: "gold" as const }
      : note
        ? { label: note, tone: "ink" as const }
        : product.is_new
          ? { label: "Выбор Kyko", tone: "ink" as const }
          : null;
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
        <ProductImage
          uri={product.image_url}
          seed={product.id}
          style={StyleSheet.absoluteFill}
          iconSize={compact ? 22 : undefined}
          studio
        />
        {badge && (
          <View style={styles.badges}>
            <Badge small={compact} label={badge.label} tone={badge.tone} />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? "Убрать из избранного" : "В избранное"}
          hitSlop={6}
          onPress={() => favorites.toggle(product.id)}
          style={[styles.heart, compact && styles.heartCompact]}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={compact ? 17 : 19}
            color={liked ? colors.gold : colors.ink}
          />
        </Pressable>
      </View>
      <View style={[styles.body, compact && styles.bodyCompact]}>
        <Eyebrow
          numberOfLines={1}
          style={[{ fontSize: compact ? 9 : 10, letterSpacing: 1.4 }, soft]}
        >
          {product.brand.name}
        </Eyebrow>
        <Text style={[styles.name, compact && styles.nameCompact, light]} numberOfLines={2}>
          {product.name}
        </Text>
        {!!meta && !compact && (
          <Muted style={styles.meta} numberOfLines={1}>
            {meta}
          </Muted>
        )}
        <View style={[styles.bottom, compact && { paddingTop: 4 }]}>
          {offer ? (
            <Txt style={[styles.price, compact && styles.priceCompact, light]} numberOfLines={1}>
              <Text style={[styles.from, styles.struck, compact && { fontSize: 11 }, soft]}>
                {money(offer.bottle_price)}
              </Text>{" "}
              {money(offer.price)}
            </Txt>
          ) : product.min_price !== null ? (
            <Txt style={[styles.price, compact && styles.priceCompact, light]} numberOfLines={1}>
              <Text style={[styles.from, compact && { fontSize: 11 }, soft]}>от </Text>
              {money(product.min_price)}
            </Txt>
          ) : (
            <Muted style={{ fontSize: 13 }}>Цена по запросу</Muted>
          )}
          {offer ? (
            <Muted style={[styles.meta, compact && styles.metaCompact, soft]} numberOfLines={1}>
              тестер {offer.volume_ml} мл
            </Muted>
          ) : (
            product.volumes.length > 0 && (
              <Muted style={[styles.meta, compact && styles.metaCompact, soft]} numberOfLines={1}>
                {product.volumes.join(" / ")} мл{product.type ? ` · ${product.type}` : ""}
              </Muted>
            )
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
  struck: { textDecorationLine: "line-through" },
  studioPhoto: { margin: "12%", mixBlendMode: "multiply" },

  // No frame: the bottle in a white window, the words under it on the page.
  card: { flexShrink: 0 },
  pressed: { opacity: 0.8 },
  // A 4:5 window: the bottle stands taller than in a square, like a studio shot.
  photoBox: {
    aspectRatio: 0.8,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  photo: { position: "absolute", top: 14, left: 14, right: 14, bottom: 14 },
  photoCompact: { top: 10, left: 10, right: 10, bottom: 10 },
  badges: { position: "absolute", top: 8, left: 8 },
  heart: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heartCompact: { width: 34, height: 34 },
  body: { paddingTop: 10, paddingHorizontal: 2, gap: 3, flex: 1 },
  bodyCompact: { paddingTop: 8, gap: 2 },
  name: { ...type.name, color: colors.ink },
  nameCompact: { fontSize: 16, lineHeight: 19 },
  meta: { fontSize: 12, lineHeight: 16 },
  bottom: { marginTop: "auto", paddingTop: 6, gap: 1 },
  price: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.ink },
  priceCompact: { fontSize: 13 },
  metaCompact: { fontSize: 11, lineHeight: 14 },
  from: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    height: 52,
  },
  stepButton: { width: 40, height: 50, alignItems: "center", justifyContent: "center" },
  stepValue: {
    minWidth: 28,
    textAlign: "center",
    fontFamily: fonts.sansBold,
    fontVariant: ["tabular-nums"],
  },
});
