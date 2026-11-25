import Ionicons from "@expo/vector-icons/Ionicons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { StatusBadge } from "@/components/shop";
import { Button, EmptyState, ErrorState, Loader, Muted, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, plural, tenge } from "@/lib/format";
import { useGuestOrders } from "@/lib/guest-orders";
import type { OrderBrief, Page } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

export default function OrdersScreen() {
  const { user, ready } = useAuth();
  const guestOrders = useGuestOrders();
  const orders = useInfiniteQuery({
    queryKey: ["/orders", "infinite"],
    queryFn: ({ pageParam }) =>
      api<Page<OrderBrief>>("/orders", { query: { page: pageParam, page_size: 20 } }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    enabled: ready && !!user,
  });

  if (!user) {
    if (guestOrders.length === 0) {
      return (
        <EmptyState
          icon="person-outline"
          title="Войдите, чтобы видеть заказы"
          action={<Button title="Войти" onPress={() => router.replace("/login")} />}
        />
      );
    }
    // Orders placed without an account on this phone (each opens by its key).
    return (
      <FlatList
        data={guestOrders}
        keyExtractor={(o) => String(o.id)}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        ListHeaderComponent={
          <Muted style={{ fontSize: 13, marginBottom: 4 }}>
            Заказы без регистрации, оформленные на этом телефоне. Войдите, чтобы новые заказы
            сохранялись в кабинете.
          </Muted>
        }
        renderItem={({ item: o }) => (
          <Pressable
            testID={`order-${o.id}`}
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: "/orders/[id]", params: { id: o.id, key: o.key } })
            }
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Txt style={{ fontFamily: fonts.sansBold }}>№ {o.id}</Txt>
              <Muted style={{ fontSize: 13 }}>{dateTime(o.created_at)}</Muted>
            </View>
            <Txt style={{ fontFamily: fonts.sansBold }}>{tenge(o.total)}</Txt>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        )}
      />
    );
  }
  if (orders.error && !orders.data) {
    return <ErrorState message={orders.error.message} onRetry={() => void orders.refetch()} />;
  }
  if (!orders.data) return <Loader />;

  const items = orders.data.pages.flatMap((p) => p.items);
  return (
    <FlatList
      data={items}
      keyExtractor={(o) => String(o.id)}
      contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
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
      ListEmptyComponent={
        <EmptyState
          icon="receipt-outline"
          title="Заказов пока нет"
          text="Здесь будут ваши заказы и их статусы."
          action={<Button title="Перейти в каталог" onPress={() => router.navigate("/catalog")} />}
        />
      }
      renderItem={({ item: o }) => (
        <Pressable
          testID={`order-${o.id}`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/orders/[id]", params: { id: o.id } })}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Txt style={{ fontFamily: fonts.sansBold }}>№ {o.id}</Txt>
              <StatusBadge status={o.status} />
            </View>
            <Muted style={{ fontSize: 13 }}>
              {dateTime(o.created_at)} · {o.items_count}{" "}
              {plural(o.items_count, "позиция", "позиции", "позиций")}
              {o.channel === "store" ? " · в магазине" : ""}
            </Muted>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Txt style={{ fontFamily: fonts.sansBold }}>
              {tenge(o.total_amount - o.returned_amount)}
            </Txt>
            {o.returned_amount > 0 && (
              <Muted style={{ fontSize: 12 }}>возврат {tenge(o.returned_amount)}</Muted>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 14,
  },
});
