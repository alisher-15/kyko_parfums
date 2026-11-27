import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductImage, QuantityStepper } from "@/components/product";
import { Button, Eyebrow, Muted, Title, Txt } from "@/components/ui";
import { useCart } from "@/lib/cart";
import { useCurrency } from "@/lib/currency";
import { volumeLabel } from "@/lib/format";
import { useApi } from "@/lib/queries";
import type { ProductDetail } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

/**
 * «Вы выбрали»: the sheet the product screen opens after «В корзину» (a system form sheet, sized
 * to its content): the photo, the price for this customer, the quantity in the cart, and the
 * way on, to the checkout or the cart, or back to the shop.
 */
export default function AddedSheet() {
  const params = useLocalSearchParams<{ product: string; variant: string }>();
  const productId = Number(params.product);
  const variantId = Number(params.variant);
  const insets = useSafeAreaInsets();
  // The same cached answer as the product screen: the price is already this customer's.
  const product = useApi<ProductDetail>(productId > 0 ? `/products/${productId}` : null);
  const { items, setQuantity } = useCart();
  const { money } = useCurrency();
  const item = items.find((i) => i.variantId === variantId);
  const variant = product.data?.variants.find((v) => v.id === variantId);

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.head}>
        <Title style={{ flex: 1, fontSize: 26 }}>Вы выбрали</Title>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.close}
        >
          <Ionicons name="close" size={20} color={colors.ink} />
        </Pressable>
      </View>

      {item && (
        <View style={styles.row}>
          <ProductImage
            uri={variant?.photo_url ?? item.imageUrl}
            seed={item.productId}
            style={styles.thumb}
            iconSize={22}
            studio
          />
          <View style={{ flex: 1, gap: 3 }}>
            {variant && (
              <View style={styles.prices}>
                <Txt style={styles.price}>{money(variant.price * item.quantity)}</Txt>
                {variant.price < variant.retail_price && (
                  <Muted style={styles.old}>{money(variant.retail_price * item.quantity)}</Muted>
                )}
              </View>
            )}
            <Eyebrow style={{ fontSize: 10 }} numberOfLines={1}>
              {item.brandName}
            </Eyebrow>
            <Text style={styles.name} numberOfLines={2}>
              {item.productName}
            </Text>
            <Muted style={{ fontSize: 13 }}>{volumeLabel(item.volumeMl, item.isTester)}</Muted>
            <View style={{ marginTop: 6, alignSelf: "flex-start" }}>
              <QuantityStepper value={item.quantity} onChange={(n) => setQuantity(variantId, n)} />
            </View>
          </View>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <Button
          testID="added-checkout"
          title="Оформить заказ"
          onPress={() => router.replace("/checkout")}
        />
        <Button kind="outline" title="Перейти в корзину" onPress={() => router.navigate("/cart")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.cream, paddingHorizontal: 20, paddingTop: 22, gap: 18 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", gap: 14 },
  thumb: { width: 96, height: 96, borderRadius: radius.md, overflow: "hidden" },
  prices: { flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  price: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.ink },
  old: { fontSize: 13, textDecorationLine: "line-through" },
  name: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 22, color: colors.ink },
});
