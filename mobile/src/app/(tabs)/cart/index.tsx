import Ionicons from "@expo/vector-icons/Ionicons";
import { Link, router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTabBarInset } from "@/components/tab-stack";
import { ProductImage, QuantityStepper } from "@/components/product";
import { QuoteHints, TengeNote } from "@/components/shop";
import { Button, Card, EmptyState, Eyebrow, Loader, Muted, Notice, Txt } from "@/components/ui";
import { useCart } from "@/lib/cart";
import { useCurrency } from "@/lib/currency";
import { TIER_LABELS, volumeLabel } from "@/lib/format";
import { useQuote } from "@/lib/queries";
import { colors, fonts, radius } from "@/theme";

export default function CartScreen() {
  const tabInset = useTabBarInset();
  const { items, setQuantity, remove, ready } = useCart();
  const quote = useQuote(items);
  const { money } = useCurrency();

  if (!ready) return <Loader />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon="bag-outline"
        title="Корзина пуста"
        text="Добавьте ароматы из каталога — цены пересчитаются под ваш статус."
        action={<Button title="Перейти в каталог" onPress={() => router.navigate("/catalog")} />}
      />
    );
  }

  const q = quote.data;
  const lineByVariant = new Map(q?.lines.map((l) => [l.variant_id, l]));
  const unavailable = new Set(q?.unavailable_variant_ids);
  const busy = quote.isFetching;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => void quote.refetch()}
            tintColor={colors.gold}
          />
        }
      >
        {quote.error && <Notice tone="error">{quote.error.message}</Notice>}
        {items.map((item) => {
          const line = lineByVariant.get(item.variantId);
          const gone = unavailable.has(item.variantId);
          return (
            <Card key={item.variantId} style={styles.line}>
              <Link href={{ pathname: "/product/[id]", params: { id: item.productId } }} asChild>
                <Pressable accessibilityLabel={item.productName}>
                  <ProductImage
                    uri={line?.image_url ?? item.imageUrl}
                    seed={item.productId}
                    style={styles.thumb}
                    iconSize={22}
                  />
                </Pressable>
              </Link>
              <View style={{ flex: 1, gap: 2 }}>
                <Eyebrow style={{ fontSize: 10 }} numberOfLines={1}>
                  {item.brandName}
                </Eyebrow>
                <Text style={styles.name} numberOfLines={2}>
                  {item.productName}
                </Text>
                <Muted style={{ fontSize: 13 }}>
                  {volumeLabel(item.volumeMl, line?.is_tester ?? item.isTester)}
                </Muted>
                {gone && (
                  <Txt style={{ color: colors.danger, fontSize: 13 }}>Товар больше недоступен</Txt>
                )}
                {line && (
                  <View style={{ marginTop: 4 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "baseline",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <Txt style={{ fontFamily: fonts.sansBold }}>{money(line.line_total)}</Txt>
                      {line.quantity > 1 && (
                        <Muted style={{ fontSize: 12 }}>
                          {money(line.unit_price)} × {line.quantity}
                        </Muted>
                      )}
                      {line.unit_price < line.retail_unit_price && (
                        <Muted style={{ fontSize: 12, textDecorationLine: "line-through" }}>
                          {money(line.retail_unit_price * line.quantity)}
                        </Muted>
                      )}
                    </View>
                    <Txt style={{ fontSize: 11, color: colors.gold }}>
                      {line.promotion_title
                        ? `Акция «${line.promotion_title}»`
                        : TIER_LABELS[line.price_tier]}
                    </Txt>
                  </View>
                )}
                <View style={styles.lineActions}>
                  {!gone && (
                    <QuantityStepper
                      value={item.quantity}
                      onChange={(n) => setQuantity(item.variantId, n)}
                    />
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Удалить ${item.productName}`}
                    onPress={() => remove(item.variantId)}
                    hitSlop={8}
                    style={styles.remove}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.muted} />
                    <Muted style={{ fontSize: 13 }}>Удалить</Muted>
                  </Pressable>
                </View>
              </View>
            </Card>
          );
        })}

        {q && <QuoteHints quote={q} />}
        {q?.next_tier_total != null && q.next_tier_total < q.total && (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push("/wholesale")}
            style={styles.teaser}
          >
            <Txt style={{ fontSize: 14 }}>
              На крупном опте этот заказ стоил бы{" "}
              <Txt style={{ fontFamily: fonts.sansBold }}>{money(q.next_tier_total)}</Txt> —
              экономия {money(q.total - q.next_tier_total)}.
            </Txt>
            <Txt style={{ fontFamily: fonts.sansSemi, color: colors.gold, fontSize: 14 }}>
              Запросить крупный опт →
            </Txt>
          </Pressable>
        )}

        <Card style={{ gap: 8, opacity: busy ? 0.7 : 1 }}>
          <Row label="По розничным ценам" value={money(q?.retail_total)} />
          {!!q?.savings && q.savings > 0 && (
            <Row label="Ваша выгода" value={`−${money(q.savings)}`} color={colors.ok} />
          )}
          <View style={styles.totalRow}>
            <Txt style={styles.total}>Итого</Txt>
            <Txt style={styles.total} testID="cart-total">
              {money(q?.total)}
            </Txt>
          </View>
          <TengeNote total={q?.total} />
          <Muted style={{ fontSize: 12 }}>
            Оплата по факту или переводом после подтверждения менеджером.
          </Muted>
        </Card>
      </ScrollView>

      <View style={[styles.bar, { marginBottom: tabInset }]}>
        {/* Guests order too (retail prices), as on the website; the checkout offers to log in. */}
        <Button
          testID="checkout"
          title="Оформить заказ"
          disabled={!q?.can_checkout || busy}
          onPress={() => router.push("/checkout")}
        />
      </View>
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Txt style={{ fontSize: 14, color: color ?? colors.muted }}>{label}</Txt>
      <Txt style={{ fontSize: 14, color: color ?? colors.ink }}>{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", gap: 12, padding: 12 },
  thumb: { width: 84, height: 84, borderRadius: radius.md, overflow: "hidden" },
  name: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 21, color: colors.ink },
  lineActions: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 8 },
  remove: { flexDirection: "row", alignItems: "center", gap: 4 },
  teaser: {
    borderWidth: 1,
    borderColor: "rgba(166,124,82,0.4)",
    backgroundColor: "#f8f1e6",
    borderRadius: radius.md,
    padding: 14,
    gap: 4,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 10,
    marginTop: 2,
  },
  total: { fontFamily: fonts.sansBold, fontSize: 18 },
  bar: {
    padding: 16,
    paddingTop: 10,
    backgroundColor: colors.cream,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
