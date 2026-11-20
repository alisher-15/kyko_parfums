import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { AdminScreen, Pill, SearchBox, Segmented } from "@/components/admin/kit";
import { StatusBadge } from "@/components/shop";
import { Button, EmptyState, ErrorState, Loader, Muted, Txt } from "@/components/ui";
import type { AdminOrderBrief } from "@/lib/admin-types";
import { PAYMENT_LABELS, ROLE_LABELS, STATUS_LABELS, dateTime, tenge } from "@/lib/format";
import { usePages } from "@/lib/queries";
import type { OrderChannel, OrderStatus } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

export default function AdminOrdersScreen() {
  return (
    <AdminScreen title="Заказы и продажи" area="orders">
      <Orders />
    </AdminScreen>
  );
}

function Orders() {
  const params = useLocalSearchParams<{ status?: string; channel?: string }>();
  const [status, setStatus] = useState<OrderStatus | "">((params.status as OrderStatus) ?? "");
  const [channel, setChannel] = useState<OrderChannel | "">((params.channel as OrderChannel) ?? "");
  const [q, setQ] = useState("");
  const orders = usePages<AdminOrderBrief>("/admin/orders", { status, channel, q });
  const items = useMemo(() => orders.data?.pages.flatMap((p) => p.items) ?? [], [orders.data]);
  const total = orders.data?.pages[0]?.total;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ gap: 8, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ paddingHorizontal: 16, flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <SearchBox value={q} onChange={setQ} placeholder="№, email, имя, телефон" />
          </View>
          <Button
            small
            icon="add"
            title="Продажа"
            onPress={() => router.push("/admin/pos")}
            style={{ minHeight: 46 }}
          />
        </View>
        <Segmented
          value={channel}
          onChange={setChannel}
          options={[
            { value: "", label: "Все каналы" },
            { value: "online", label: "Сайт" },
            { value: "store", label: "Магазин" },
          ]}
        />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            {
              value: "" as OrderStatus | "",
              label: total !== undefined && status === "" ? `Все · ${total}` : "Все",
            },
            ...(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => ({
              value: s,
              label:
                s === status && total !== undefined
                  ? `${STATUS_LABELS[s]} · ${total}`
                  : STATUS_LABELS[s],
            })),
          ]}
        />
      </View>
      {orders.error && !orders.data ? (
        <ErrorState message={orders.error.message} onRetry={() => void orders.refetch()} />
      ) : !orders.data ? (
        <Loader />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10, flexGrow: 1 }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (orders.hasNextPage && !orders.isFetchingNextPage) void orders.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl
              refreshing={orders.isRefetching && !orders.isFetchingNextPage}
              onRefresh={() => void orders.refetch()}
              tintColor={colors.gold}
            />
          }
          ListFooterComponent={orders.isFetchingNextPage ? <Loader /> : undefined}
          ListEmptyComponent={<EmptyState icon="receipt-outline" title="Заказов нет" />}
          renderItem={({ item: o }) => <OrderCard order={o} />}
        />
      )}
    </View>
  );
}

function OrderCard({ order: o }: { order: AdminOrderBrief }) {
  const guest = o.channel === "online" && !o.user_email;
  const backorder = o.has_backorder && (o.status === "new" || o.status === "processing");
  return (
    <Pressable
      testID={`admin-order-${o.id}`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/admin/orders/[id]", params: { id: o.id } })}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.cream }]}
    >
      <View style={styles.row}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
          <Txt style={{ fontFamily: fonts.sansBold }}>№ {o.id}</Txt>
          <Pill
            tone={o.channel === "store" ? "gold" : "muted"}
            label={
              o.channel === "online"
                ? "Сайт"
                : `Магазин${o.payment_method ? ` · ${PAYMENT_LABELS[o.payment_method]}` : ""}`
            }
          />
          {backorder && <Pill tone="warn" label="под заказ" />}
        </View>
        <StatusBadge status={o.status} />
      </View>
      <Txt style={{ fontSize: 14 }}>{o.contact_name ?? "Покупатель без имени"}</Txt>
      <Muted style={{ fontSize: 12 }}>
        {[o.contact_phone, ROLE_LABELS[o.customer_role], guest ? "без регистрации" : o.user_email]
          .filter(Boolean)
          .join(" · ")}
      </Muted>
      <View style={styles.row}>
        <Muted style={{ fontSize: 12 }}>
          {dateTime(o.created_at)} · {o.items_count} шт.
        </Muted>
        <View style={{ alignItems: "flex-end" }}>
          <Txt style={{ fontFamily: fonts.sansBold }}>{tenge(o.total_amount)}</Txt>
          {o.returned_amount > 0 && (
            <Txt style={{ fontSize: 12, color: colors.danger }}>
              возврат −{tenge(o.returned_amount)}
            </Txt>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.faint} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 12,
    paddingRight: 28,
    gap: 4,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chevron: { position: "absolute", right: 8, top: "50%" },
});
