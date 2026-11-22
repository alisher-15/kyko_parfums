import { Image } from "expo-image";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { AdminScreen, Pill } from "@/components/admin/kit";
import { Button, EmptyState, ErrorState, Loader, Muted, Txt } from "@/components/ui";
import type { PromotionBrief, PromotionStatus } from "@/lib/admin-types";
import { assetUrl } from "@/lib/config";
import { PROMOTION_STATUS_LABELS, percentOff, plural, shortDate } from "@/lib/format";
import { useApi } from "@/lib/queries";
import { colors, fonts, radius } from "@/theme";

const STATUS_TONES: Record<PromotionStatus, "ok" | "gold" | "muted" | "warn"> = {
  running: "ok",
  scheduled: "gold",
  ended: "muted",
  off: "warn",
};

/** «1 ноя — 30 ноя», «до 30 ноя», «без срока». */
function promotionDates(p: Pick<PromotionBrief, "starts_on" | "ends_on">): string {
  if (p.starts_on && p.ends_on) return `${shortDate(p.starts_on)} — ${shortDate(p.ends_on)}`;
  if (p.starts_on) return `с ${shortDate(p.starts_on)}`;
  if (p.ends_on) return `до ${shortDate(p.ends_on)}`;
  return "без срока";
}

function scopeText(p: PromotionBrief): string {
  if (p.all_products) return "весь каталог";
  if (p.brands_count)
    return `${p.brands_count} ${plural(p.brands_count, "бренд", "бренда", "брендов")}`;
  return `${p.products_count} ${plural(p.products_count, "товар", "товара", "товаров")}`;
}

export default function PromotionsScreen() {
  return (
    <AdminScreen title="Акции" area={null}>
      <Promotions />
    </AdminScreen>
  );
}

function Promotions() {
  const list = useApi<PromotionBrief[]>("/admin/promotions");
  if (list.error && !list.data)
    return <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />;
  if (!list.data) return <Loader />;
  return (
    <FlatList
      data={list.data}
      keyExtractor={(p) => String(p.id)}
      contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          tintColor={colors.gold}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          <Button
            title="Новая акция"
            icon="add"
            testID="promotion-new"
            onPress={() =>
              router.push({ pathname: "/admin/promotions/[id]", params: { id: "new" } })
            }
          />
          <Muted style={{ fontSize: 13 }}>
            Баннер на главной и, если указан процент, скидка от розничной цены на весь каталог,
            бренды или отдельные товары.
          </Muted>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="pricetags-outline"
          title="Акций пока нет"
          text="Создайте баннер для главной страницы."
        />
      }
      renderItem={({ item: p }) => (
        <Pressable
          accessibilityRole="button"
          testID={`promotion-${p.id}`}
          onPress={() => router.push({ pathname: "/admin/promotions/[id]", params: { id: p.id } })}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
        >
          {p.image_url ? (
            <Image
              source={{ uri: assetUrl(p.image_url) ?? undefined }}
              style={styles.banner}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.banner, { backgroundColor: colors.ink }]} />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 15 }} numberOfLines={2}>
              {p.title}
            </Txt>
            <Muted style={{ fontSize: 12 }}>
              {p.discount_percent !== null
                ? `${percentOff(p.discount_percent)} · `
                : "только баннер · "}
              {scopeText(p)} · {promotionDates(p)}
            </Muted>
            <Pill label={PROMOTION_STATUS_LABELS[p.status]} tone={STATUS_TONES[p.status]} />
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 10,
  },
  banner: { width: 96, height: 36, borderRadius: radius.sm },
});
