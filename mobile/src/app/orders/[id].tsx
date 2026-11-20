import { useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { StatusBadge } from "@/components/shop";
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Loader,
  Muted,
  Notice,
  Title,
  Txt,
} from "@/components/ui";
import { ApiError, api, errorText } from "@/lib/api";
import { CONTACTS, whatsappAbout } from "@/lib/contacts";
import { dateTime, percentOff, tenge, volumeLabel } from "@/lib/format";
import { useApi } from "@/lib/queries";
import type { Order } from "@/lib/types";
import { colors, fonts } from "@/theme";

/** Orders always show tenge: that is what is charged (as on the website's account pages). */
export default function OrderScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const orderId = Number(id);
  const queryClient = useQueryClient();
  const order = useApi<Order>(
    Number.isInteger(orderId) && orderId > 0 ? `/orders/${orderId}` : null,
  );
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (order.error instanceof ApiError && order.error.status === 404) {
    return <EmptyState icon="receipt-outline" title="Заказ не найден" />;
  }
  if (order.error && !order.data) {
    return <ErrorState message={order.error.message} onRetry={() => void order.refetch()} />;
  }
  if (!order.data) return <Loader />;
  const o = order.data;

  const cancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      const updated = await api<Order>(`/orders/${o.id}/cancel`, { method: "POST" });
      queryClient.setQueryData([`/orders/${o.id}`, null], updated);
      void queryClient.invalidateQueries({ queryKey: ["/orders"] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setCancelling(false);
    }
  };
  const confirmCancel = () => {
    if (Platform.OS === "web") {
      void cancel();
      return;
    }
    Alert.alert("Отменить заказ?", "Товары вернутся на склад, восстановить заказ будет нельзя.", [
      { text: "Нет", style: "cancel" },
      { text: "Отменить заказ", style: "destructive", onPress: () => void cancel() },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={
        <RefreshControl
          refreshing={order.isRefetching}
          onRefresh={() => void order.refetch()}
          tintColor={colors.gold}
        />
      }
    >
      <Stack.Screen options={{ title: `Заказ № ${o.id}` }} />
      {created === "1" && (
        <Notice tone="success">
          Заказ оформлен! Менеджер свяжется с вами, чтобы подтвердить наличие и доставку.
        </Notice>
      )}

      <Card style={{ gap: 6 }}>
        <View style={styles.headRow}>
          <StatusBadge status={o.status} />
          <Muted style={{ fontSize: 13 }}>{dateTime(o.created_at)}</Muted>
        </View>
        <Txt
          style={{ fontFamily: fonts.sansBold, fontSize: 28, lineHeight: 34 }}
          testID="order-total"
        >
          {tenge(o.net_total)}
        </Txt>
        {o.discount_total > 0 && (
          <Txt style={{ color: colors.ok, fontSize: 14 }}>Скидка {tenge(o.discount_total)}</Txt>
        )}
        {o.returned_amount > 0 && (
          <Muted style={{ fontSize: 13 }}>
            Сумма заказа {tenge(o.total_amount)}, возвращено {tenge(o.returned_amount)}
          </Muted>
        )}
      </Card>

      <Card style={{ gap: 10 }}>
        <Title style={{ fontSize: 22 }}>Состав</Title>
        {o.items.map((item, i) => (
          <View key={item.id} style={{ gap: 2 }}>
            {i > 0 && <Divider style={{ marginBottom: 10 }} />}
            <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>
              {item.brand_name} {item.product_name}
            </Txt>
            <View style={styles.headRow}>
              <Muted style={{ fontSize: 13, flex: 1 }}>
                {volumeLabel(item.volume_ml, item.is_tester)} · {tenge(item.price_applied)} ×{" "}
                {item.quantity}
                {item.quantity !== item.original_quantity
                  ? ` (было ${item.original_quantity})`
                  : ""}
              </Muted>
              <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>
                {tenge(item.line_total)}
              </Txt>
            </View>
            {(item.promotion_title || item.discount_percent > 0) && (
              <Txt style={{ fontSize: 12, color: colors.gold }}>
                {item.promotion_title
                  ? `Акция «${item.promotion_title}»`
                  : `Скидка ${percentOff(item.discount_percent)}`}
              </Txt>
            )}
            {item.returned_quantity > 0 && (
              <Muted style={{ fontSize: 12 }}>Возвращено: {item.returned_quantity} шт.</Muted>
            )}
          </View>
        ))}
      </Card>

      {o.channel === "online" && (
        <Card style={{ gap: 4 }}>
          <Title style={{ fontSize: 22 }}>Доставка</Title>
          <Txt style={{ fontSize: 14 }}>
            {[o.delivery_city, o.delivery_address].filter(Boolean).join(", ")}
          </Txt>
          <Muted style={{ fontSize: 13 }}>
            {[o.contact_name, o.contact_phone, o.contact_email].filter(Boolean).join(" · ")}
          </Muted>
          {o.comment && <Muted style={{ fontSize: 13 }}>Комментарий: {o.comment}</Muted>}
        </Card>
      )}

      {o.events.length > 0 && (
        <Card style={{ gap: 10 }}>
          <Title style={{ fontSize: 22 }}>История</Title>
          {[...o.events].reverse().map((e, i) => (
            <View key={i} style={styles.event}>
              <View style={[styles.dot, i === 0 && { backgroundColor: colors.gold }]} />
              <View style={{ flex: 1 }}>
                <Txt style={{ fontSize: 14 }}>{e.message}</Txt>
                <Muted style={{ fontSize: 12 }}>{dateTime(e.created_at)}</Muted>
              </View>
            </View>
          ))}
        </Card>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {o.status === "new" && (
        <Button
          kind="danger"
          title="Отменить заказ"
          loading={cancelling}
          onPress={confirmCancel}
          testID="cancel-order"
        />
      )}
      <Button
        kind="outline"
        icon="logo-whatsapp"
        title="Вопрос по заказу"
        onPress={() => Linking.openURL(whatsappAbout(`Здравствуйте! Вопрос по заказу № ${o.id}`))}
      />
      {created === "1" && (
        <Button kind="ghost" title="Продолжить покупки" onPress={() => router.navigate("/")} />
      )}
      <Muted style={{ textAlign: "center", fontSize: 12 }}>{CONTACTS[0].label}</Muted>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  event: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line, marginTop: 6 },
});
