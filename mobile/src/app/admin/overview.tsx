import { router, type Href } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { AdminScreen, Block, KV } from "@/components/admin/kit";
import { Button, ErrorState, Loader, Muted, Txt } from "@/components/ui";
import type { Stats } from "@/lib/admin-types";
import { ROLE_LABELS, STATUS_LABELS, tenge } from "@/lib/format";
import { useApi } from "@/lib/queries";
import type { OrderStatus, UserRole } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

/** The owner's figures, as on the website's «Обзор». */
export default function OverviewScreen() {
  return (
    <AdminScreen title="Обзор" area={null}>
      <Overview />
    </AdminScreen>
  );
}

function Overview() {
  const stats = useApi<Stats>("/admin/stats");
  if (stats.error && !stats.data) {
    return <ErrorState message={stats.error.message} onRetry={() => void stats.refetch()} />;
  }
  if (!stats.data) return <Loader />;
  const d = stats.data;
  // Margin only over sales whose cost is known.
  const margin =
    d.costed_revenue > 0 ? Math.round((d.gross_profit / d.costed_revenue) * 100) : null;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={
        <RefreshControl
          refreshing={stats.isRefetching}
          onRefresh={() => void stats.refetch()}
          tintColor={colors.gold}
        />
      }
    >
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          title="Продажа"
          icon="cart-outline"
          style={{ flex: 1 }}
          onPress={() => router.push("/admin/pos")}
        />
        <Button
          kind="outline"
          title="Приёмка"
          icon="download-outline"
          style={{ flex: 1 }}
          onPress={() => router.push("/admin/receipts")}
        />
      </View>
      <View style={styles.grid}>
        <Tile
          label="Новые заказы"
          value={String(d.orders_by_status.new)}
          accent={d.orders_by_status.new > 0}
          href={{ pathname: "/admin/orders", params: { status: "new" } }}
        />
        <Tile
          label="Выручка · выданные заказы"
          value={tenge(d.revenue_total)}
          href={{ pathname: "/admin/orders", params: { status: "delivered" } }}
        />
        <Tile
          label={`В работе, ещё не выдано · ${d.pending_orders}`}
          value={tenge(d.pending_total)}
          href="/admin/orders"
        />
        <Tile
          label="Возвраты"
          value={tenge(d.refunds_total)}
          href={{ pathname: "/admin/orders", params: { status: "delivered" } }}
        />
        <Tile
          label={`Магазин сегодня · ${d.store_sales_today}`}
          value={tenge(d.store_revenue_today)}
          href={{ pathname: "/admin/orders", params: { channel: "store" } }}
        />
        <Tile
          label="Выручка сайта"
          value={tenge(d.revenue_by_channel.online)}
          href={{ pathname: "/admin/orders", params: { channel: "online" } }}
        />
        <Tile
          label="Выручка магазина"
          value={tenge(d.revenue_by_channel.store)}
          href={{ pathname: "/admin/orders", params: { channel: "store" } }}
        />
        <Tile
          label="Заявки на опт"
          value={String(d.wholesale_requests)}
          accent={d.wholesale_requests > 0}
          href={{ pathname: "/admin/users", params: { requests: "true" } }}
        />
        <Tile
          label={`Валовая прибыль${margin === null ? "" : ` · маржа ${margin}%`}`}
          value={tenge(d.gross_profit)}
          href={{ pathname: "/admin/orders", params: { status: "delivered" } }}
        />
        <Tile
          label="Склад по себестоимости"
          value={tenge(d.stock_value)}
          href={{ pathname: "/admin/products", params: { no_cost: "true" } }}
        />
        <Tile
          label="В наличии без себестоимости"
          value={String(d.variants_without_cost)}
          accent={d.variants_without_cost > 0}
          href={{ pathname: "/admin/products", params: { no_cost: "true" } }}
        />
        <Tile
          label={`Заказать у поставщика · ${d.units_backordered} шт.`}
          value={String(d.variants_backordered)}
          accent={d.variants_backordered > 0}
          href={{ pathname: "/admin/products", params: { backordered: "true" } }}
        />
        {d.variants_few === undefined ? (
          <Tile label="Мало на складе (≤ 3 шт.)" value={String(d.variants_low_stock)} />
        ) : (
          <>
            <Tile
              label="Мало на складе · 1–5 шт., объёмов"
              value={String(d.variants_few)}
              href={{ pathname: "/admin/products", params: { stock_state: "few" } }}
            />
            <Tile
              label="Нет в наличии · объёмов"
              value={String(d.variants_out ?? 0)}
              href={{ pathname: "/admin/products", params: { stock_state: "out" } }}
            />
          </>
        )}
        <Tile label="Товаров" value={String(d.products_total)} href="/admin/products" />
        <Tile
          label="Без цен / объёмов"
          value={String(d.products_without_variants)}
          href={{ pathname: "/admin/products", params: { no_variants: "true" } }}
        />
        <Tile label="Брендов" value={String(d.brands_total)} href="/admin/brands" />
      </View>

      <Block title="Заказы по статусам">
        {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
          <Pressable
            key={s}
            onPress={() => router.push({ pathname: "/admin/orders", params: { status: s } })}
          >
            <KV label={STATUS_LABELS[s]} value={d.orders_by_status[s]} strong />
          </Pressable>
        ))}
      </Block>
      <Block title="Пользователи по ролям">
        {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
          <Pressable
            key={r}
            onPress={() => router.push({ pathname: "/admin/users", params: { role: r } })}
          >
            <KV label={ROLE_LABELS[r]} value={d.users_by_role[r] ?? 0} strong />
          </Pressable>
        ))}
      </Block>
    </ScrollView>
  );
}

function Tile({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: string;
  href?: Href;
  accent?: boolean;
}) {
  const body = (
    <>
      <Muted style={styles.tileLabel}>{label}</Muted>
      <Txt style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
    </>
  );
  const style = [styles.tile, accent && styles.accent];
  if (!href) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} style={style}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 12,
    gap: 4,
  },
  accent: { borderColor: colors.gold, backgroundColor: "#fdf8ef" },
  tileLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fonts.sansSemi,
    textTransform: "uppercase",
  },
  tileValue: { fontFamily: fonts.sansBold, fontSize: 20, fontVariant: ["tabular-nums"] },
});
