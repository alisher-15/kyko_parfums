import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductImage, QuantityStepper } from "@/components/product";
import { CartButton } from "@/components/shop";
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Eyebrow,
  IconButton,
  Loader,
  Muted,
  Title,
  Txt,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { siteUrl } from "@/lib/config";
import { whatsappAbout } from "@/lib/contacts";
import { useCurrency } from "@/lib/currency";
import { useFavorites } from "@/lib/favorites";
import {
  GENDER_LABELS,
  TIER_LABELS,
  dayMonth,
  percentOff,
  splitNotes,
  tenge,
  volumeLabel,
} from "@/lib/format";
import { useApi } from "@/lib/queries";
import { rememberViewed } from "@/lib/recent";
import type { PricingRules, ProductDetail, VariantPublic } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const valid = Number.isInteger(productId) && productId > 0;
  const product = useApi<ProductDetail>(valid ? `/products/${productId}` : null);
  // For «Вы смотрели» on the home screen: only a product the shop could show.
  const shownId = product.data?.id;
  useEffect(() => {
    if (shownId) rememberViewed(shownId);
  }, [shownId]);
  const rules = useApi<PricingRules>("/pricing/rules");
  const favorites = useFavorites();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const header = (
    <Stack.Screen
      options={{
        title: "",
        headerRight: () =>
          valid ? (
            <View style={{ flexDirection: "row" }}>
              <IconButton
                name="share-outline"
                label="Поделиться"
                onPress={() => {
                  const p = product.data;
                  const url = siteUrl(`/products/${productId}`);
                  void Share.share(
                    Platform.OS === "ios"
                      ? { url, message: p ? `${p.brand.name} ${p.name}` : undefined }
                      : { message: p ? `${p.brand.name} ${p.name} — ${url}` : url },
                  );
                }}
              />
              <IconButton
                testID="product-favorite"
                name={favorites.has(productId) ? "heart" : "heart-outline"}
                color={favorites.has(productId) ? colors.gold : colors.ink}
                label={favorites.has(productId) ? "Убрать из избранного" : "В избранное"}
                onPress={() => favorites.toggle(productId)}
              />
              <CartButton />
            </View>
          ) : null,
      }}
    />
  );

  if (!valid || (product.error instanceof ApiError && product.error.status === 404)) {
    return (
      <>
        {header}
        <EmptyState
          icon="water-outline"
          title="Товар не найден"
          text="Возможно, его убрали из каталога."
          action={<Button title="В каталог" onPress={() => router.navigate("/catalog")} />}
        />
      </>
    );
  }
  if (product.error && !product.data) {
    return (
      <>
        {header}
        <ErrorState message={product.error.message} onRetry={() => void product.refetch()} />
      </>
    );
  }
  if (!product.data) {
    return (
      <>
        {header}
        <Loader />
      </>
    );
  }

  const p = product.data;
  // Bottles come first, testers after them (the API orders them so).
  const variant = p.variants.find((v) => v.id === selectedId) ?? p.variants[0];

  return (
    <>
      {header}
      <ProductBody product={p} variant={variant} rules={rules.data} onSelect={setSelectedId} />
    </>
  );
}

function ProductBody({
  product,
  variant,
  rules,
  onSelect,
}: {
  product: ProductDetail;
  variant: VariantPublic | undefined;
  rules: PricingRules | undefined;
  onSelect: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // The photo leaves room for the name and the price on the first screen.
  const photoHeight = Math.min(width, Math.round(height * 0.42));
  const { user } = useAuth();
  const { add, count } = useCart();
  const { money } = useCurrency();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const choose = (v: VariantPublic) => {
    onSelect(v.id);
    setQty(1);
    setAdded(false);
  };

  const addToCart = () => {
    if (!variant) return;
    add(
      {
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        brandName: product.brand.name,
        volumeMl: variant.volume_ml,
        isTester: variant.is_tester,
        imageUrl: variant.photo_url ?? product.image_url,
      },
      qty,
    );
    setAdded(true);
    if (Platform.OS !== "web")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const chips = [
    product.type,
    product.gender && GENDER_LABELS[product.gender],
    product.category,
    product.longevity && `Стойкость: ${product.longevity}`,
  ].filter(Boolean) as string[];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <ProductImage
          uri={variant?.photo_url ?? product.image_url}
          seed={product.id}
          style={[styles.photo, { height: photoHeight }]}
          iconSize={56}
        />
        <View style={styles.content}>
          {(product.category_path ?? []).length > 0 && (
            // The product's section and group, as the website's breadcrumbs.
            <View style={styles.path} accessibilityLabel="Разделы">
              {(product.category_path ?? []).map((c, i) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="link"
                  hitSlop={6}
                  onPress={() =>
                    router.push({
                      pathname: "/collection",
                      params: { category_id: c.id, title: c.name },
                    })
                  }
                  style={{ flexDirection: "row" }}
                >
                  {i > 0 && <Muted style={styles.pathText}> › </Muted>}
                  <Muted style={[styles.pathText, { textDecorationLine: "underline" }]}>
                    {c.name}
                  </Muted>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              router.push({
                pathname: "/collection",
                params: { brand_id: product.brand.id, title: product.brand.name },
              })
            }
          >
            <Eyebrow style={{ fontSize: 12 }}>{product.brand.name}</Eyebrow>
          </Pressable>
          <Title style={styles.name} accessibilityRole="header">
            {product.name}
          </Title>
          {chips.length > 0 && (
            <View style={styles.chips}>
              {chips.map((c) => (
                <Chip key={c} label={c} />
              ))}
            </View>
          )}

          {!variant ? (
            <Card style={{ marginTop: 20 }}>
              <Muted>Цена и наличие уточняются. Напишите менеджеру или загляните позже.</Muted>
            </Card>
          ) : (
            <Purchase product={product} variant={variant} rules={rules} onSelect={choose} />
          )}

          {variant?.next_tier_price != null && (
            <View style={styles.teaser}>
              <Eyebrow>Ваша следующая цена</Eyebrow>
              <View
                style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}
              >
                <Txt style={{ fontFamily: fonts.sansBold, fontSize: 22 }}>
                  {money(variant.next_tier_price)}
                </Txt>
                <Muted style={{ fontSize: 13 }}>
                  на крупном опте · −
                  {Math.round((1 - variant.next_tier_price / variant.price) * 100)}% к вашей цене
                </Muted>
              </View>
              <Muted style={{ fontSize: 13 }}>
                {rules?.next_tier_terms || "Условия перехода на крупный опт уточнит менеджер."}
              </Muted>
              <Button
                small
                kind="gold"
                title="Запросить крупный опт"
                style={{ alignSelf: "flex-start", marginTop: 6 }}
                onPress={() => router.push("/wholesale")}
              />
            </View>
          )}

          {(!user || user.role === "retail") && (
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                router.push(
                  user ? "/wholesale" : { pathname: "/register", params: { next: "/wholesale" } },
                )
              }
              style={styles.wholesale}
            >
              <Txt style={{ fontFamily: fonts.serifBold, fontSize: 20, color: colors.white }}>
                Для магазинов и салонов
              </Txt>
              <Txt style={{ color: "#d6d3d1", fontSize: 13 }}>
                Оптовые цены для бизнеса. Оставьте заявку — менеджер подтвердит статус, и цены в
                каталоге обновятся.
              </Txt>
              <Txt
                style={{
                  color: colors.gold,
                  fontFamily: fonts.sansSemi,
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                {user ? "Оставить заявку →" : "Зарегистрироваться и оставить заявку →"}
              </Txt>
            </Pressable>
          )}

          <NotesPyramid product={product} />

          {product.description && (
            <View style={{ marginTop: 24, gap: 6 }}>
              <Txt style={styles.label}>Описание</Txt>
              <Txt style={{ color: "#44403c", lineHeight: 23 }}>{product.description}</Txt>
            </View>
          )}

          <Pressable
            accessibilityRole="link"
            onPress={() =>
              Linking.openURL(
                whatsappAbout(
                  `Здравствуйте! Вопрос про ${product.brand.name} ${product.name}${variant ? `, ${volumeLabel(variant.volume_ml, variant.is_tester)}` : ""}: ${siteUrl(`/products/${product.id}`)}`,
                ),
              )
            }
            style={styles.ask}
          >
            <Ionicons name="logo-whatsapp" size={20} color={colors.gold} />
            <Txt style={{ fontFamily: fonts.sansSemi }}>Спросить об аромате в WhatsApp</Txt>
          </Pressable>
        </View>
      </ScrollView>

      {variant && (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
          {added ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.navigate("/cart")}
              style={styles.added}
              testID="added-to-cart"
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.ok} />
              <Txt style={{ color: colors.ok, fontFamily: fonts.sansSemi, fontSize: 14 }}>
                Добавлено · перейти в корзину →
              </Txt>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <QuantityStepper value={qty} onChange={setQty} />
            <Button
              testID="add-to-cart"
              // With the cart's bag next to it, a narrow phone has no room for the sum.
              title={
                count > 0 && width < 400 ? "В корзину" : `В корзину · ${money(variant.price * qty)}`
              }
              style={{ flex: 1 }}
              onPress={addToCart}
            />
            {/* Once something is in the cart, the way to it is right here. */}
            {count > 0 && <CartButton boxed />}
          </View>
        </View>
      )}
    </View>
  );
}

function Purchase({
  product,
  variant,
  rules,
  onSelect,
}: {
  product: ProductDetail;
  variant: VariantPublic;
  rules: PricingRules | undefined;
  onSelect: (v: VariantPublic) => void;
}) {
  const { money } = useCurrency();
  const discounted = variant.price < variant.retail_price;
  const bottles = product.variants.filter((v) => !v.is_tester);
  const testers = product.variants.filter((v) => v.is_tester);
  const volumes = variant.is_tester ? testers : bottles;
  // Switching between the bottle and the tester keeps the volume when there is one.
  const target = (kind: VariantPublic[]) =>
    kind.find((v) => v.id === variant.id) ??
    kind.find((v) => v.volume_ml === variant.volume_ml) ??
    kind[0];

  return (
    <View style={{ marginTop: 20, gap: 16 }}>
      {testers.length > 0 && (
        <View style={{ gap: 8 }}>
          <View style={styles.kinds} accessibilityRole="radiogroup">
            {bottles.length > 0 && (
              <KindButton
                title="Товар"
                active={!variant.is_tester}
                onPress={() => onSelect(target(bottles))}
              />
            )}
            <KindButton
              title="Тестер"
              active={variant.is_tester}
              onPress={() => onSelect(target(testers))}
            />
          </View>
          {variant.is_tester && (
            <Muted style={{ fontSize: 13 }}>
              Тестер — тот же аромат, что и в обычном флаконе, но в простой упаковке.
            </Muted>
          )}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Txt style={styles.label}>Объём</Txt>
        <View style={styles.volumes}>
          {volumes.map((v) => {
            const on = v.id === variant.id;
            return (
              <Pressable
                key={v.id}
                testID={`volume-${v.id}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => onSelect(v)}
                style={[styles.volume, on && styles.volumeOn]}
              >
                <Txt style={[styles.volumeMl, on && { color: colors.white }]}>{v.volume_ml} мл</Txt>
                <Txt style={[styles.volumePrice, on && { color: "#d6d3d1" }]}>{money(v.price)}</Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <Txt style={styles.price} testID="product-price">
            {money(variant.price)}
          </Txt>
          {discounted && <Txt style={styles.oldPrice}>{money(variant.retail_price)}</Txt>}
        </View>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {variant.deal ? (
            <Badge label={`Акция ${percentOff(variant.deal.discount_percent)}`} />
          ) : (
            <Chip label={TIER_LABELS[variant.price_tier]} />
          )}
          {variant.is_tester && <Chip label="Тестер" />}
        </View>
        {variant.deal && (
          <Muted style={{ fontSize: 13 }}>
            «{variant.deal.title}»
            {variant.deal.ends_on ? ` — до ${dayMonth(variant.deal.ends_on)}` : ""}
          </Muted>
        )}

        {(variant.wholesale_price !== null || variant.bulk_price !== null) && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PriceCell label="Розница" value={variant.retail_price} />
            {variant.wholesale_price !== null && (
              <PriceCell
                label="Опт"
                value={variant.wholesale_price}
                hint={thresholdHint(rules, "wholesale")}
              />
            )}
            {variant.bulk_price !== null && (
              <PriceCell
                label="Крупный опт"
                value={variant.bulk_price}
                hint={thresholdHint(rules, "bulk")}
              />
            )}
          </View>
        )}

        {discounted && !variant.deal && rules && hasThresholds(rules) && (
          <Muted style={{ fontSize: 12 }}>
            {rules.mode === "order_total"
              ? "Сниженная цена применяется, когда сумма заказа достигает порога. Иначе заказ считается по рознице."
              : "Сниженная цена применяется к позиции, когда её количество достигает порога."}
          </Muted>
        )}

        {(variant.stock !== null || variant.sku) && (
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            {variant.stock !== null && (
              <Txt style={{ color: colors.warn, fontSize: 14 }}>
                Осталось мало: {variant.stock} шт.
              </Txt>
            )}
            {variant.sku && <Muted style={{ fontSize: 12 }}>Артикул: {variant.sku}</Muted>}
          </View>
        )}
      </Card>
    </View>
  );
}

function KindButton({
  title,
  active,
  onPress,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[styles.kind, active && { backgroundColor: colors.ink }]}
    >
      <Txt style={[styles.kindText, active && { color: colors.white }]}>{title}</Txt>
    </Pressable>
  );
}

function PriceCell({ label, value, hint }: { label: string; value: number; hint?: string | null }) {
  const { money } = useCurrency();
  return (
    <View style={styles.cell}>
      <Muted style={{ fontSize: 11 }}>{label}</Muted>
      <Txt
        style={{ fontFamily: fonts.sansSemi, fontSize: 13 }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {money(value)}
      </Txt>
      {hint && <Muted style={{ fontSize: 10, textAlign: "center" }}>{hint}</Muted>}
    </View>
  );
}

function thresholdHint(rules: PricingRules | undefined, tier: "wholesale" | "bulk"): string | null {
  if (!rules) return null;
  if (rules.mode === "order_total") {
    const amount =
      tier === "wholesale" ? rules.wholesale_min_order_amount : rules.bulk_min_order_amount;
    return amount ? `от ${tenge(amount)} в заказе` : null;
  }
  const qty = tier === "wholesale" ? rules.wholesale_min_item_qty : rules.bulk_min_item_qty;
  return qty && qty > 1 ? `от ${qty} шт.` : null;
}

function hasThresholds(rules: PricingRules): boolean {
  return rules.mode === "order_total"
    ? !!(rules.wholesale_min_order_amount || rules.bulk_min_order_amount)
    : (rules.wholesale_min_item_qty ?? 1) > 1 || (rules.bulk_min_item_qty ?? 1) > 1;
}

function NotesPyramid({ product }: { product: ProductDetail }) {
  const levels = [
    { title: "Верхние ноты", notes: splitNotes(product.top_notes) },
    { title: "Ноты сердца", notes: splitNotes(product.mid_notes) },
    { title: "Базовые ноты", notes: splitNotes(product.base_notes) },
  ].filter((l) => l.notes.length > 0);
  if (levels.length === 0) return null;
  return (
    <View style={{ marginTop: 24, gap: 12 }}>
      <Txt style={styles.label}>Пирамида аромата</Txt>
      {levels.map((l) => (
        <View key={l.title} style={{ gap: 6 }}>
          <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>{l.title}</Txt>
          <View style={styles.chips}>
            {l.notes.map((n) => (
              <Chip key={n} label={n} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%" },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  name: { fontSize: 36, lineHeight: 38, marginTop: 4 },
  path: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  pathText: { fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  kinds: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 3,
  },
  kind: { borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 8 },
  kindText: { fontFamily: fonts.sansSemi, fontSize: 14 },
  volumes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  volume: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 92,
  },
  volumeOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  volumeMl: { fontFamily: fonts.sansBold, fontSize: 15 },
  volumePrice: { fontSize: 12, color: colors.muted },
  price: { fontFamily: fonts.sansBold, fontSize: 30, lineHeight: 36 },
  oldPrice: { fontSize: 17, color: colors.muted, textDecorationLine: "line-through" },
  cell: {
    flex: 1,
    backgroundColor: colors.cream,
    borderRadius: radius.sm,
    padding: 8,
    alignItems: "center",
    gap: 2,
  },
  teaser: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(166,124,82,0.4)",
    backgroundColor: "#f8ecea",
    borderRadius: radius.lg,
    padding: 16,
    gap: 4,
  },
  wholesale: {
    marginTop: 16,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: 16,
    gap: 4,
  },
  ask: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
  },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  added: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
});
