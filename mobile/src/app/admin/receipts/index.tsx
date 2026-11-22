import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { AdminScreen, Pill } from "@/components/admin/kit";
import { Button, EmptyState, ErrorState, Loader, Muted, Notice, Txt } from "@/components/ui";
import type { Receipt, ReceiptBrief } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { dateTime, tenge } from "@/lib/format";
import { useApi } from "@/lib/queries";
import { colors, fonts, radius } from "@/theme";

export default function ReceiptsScreen() {
  return (
    <AdminScreen title="Приёмка" area="stock">
      <Receipts />
    </AdminScreen>
  );
}

function Receipts() {
  const list = useApi<ReceiptBrief[]>("/admin/receipts");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Receipt>("/admin/receipts", { body: {} });
      void list.refetch();
      router.push({ pathname: "/admin/receipts/[id]", params: { id: r.id } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (list.error && !list.data)
    return <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />;
  if (!list.data) return <Loader />;
  return (
    <FlatList
      data={list.data}
      keyExtractor={(r) => String(r.id)}
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
            title="Новая приёмка"
            icon="add"
            loading={busy}
            onPress={() => void create()}
            testID="receipt-new"
          />
          <Muted style={{ fontSize: 13 }}>
            Приходная накладная от поставщика: сканируйте коробки, укажите закупочные цены и
            проведите документ. Товар добавится на склад, себестоимость пересчитается.
          </Muted>
          {error && <Notice tone="error">{error}</Notice>}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="download-outline"
          title="Приёмок пока нет"
          text="Создайте первую, когда придёт товар."
        />
      }
      renderItem={({ item: r }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/admin/receipts/[id]", params: { id: r.id } })}
          style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.cream }]}
        >
          <View style={styles.row}>
            <Txt style={{ fontFamily: fonts.sansBold }}>Приёмка № {r.id}</Txt>
            <Pill
              tone={r.status === "draft" ? "gold" : "muted"}
              label={r.status === "draft" ? "Черновик" : "Проведена"}
            />
          </View>
          <Txt style={{ fontSize: 14 }}>
            {r.supplier ?? "Поставщик не указан"}
            {r.number ? ` · накл. ${r.number}` : ""}
          </Txt>
          <Muted style={{ fontSize: 12 }}>
            {r.lines} поз. · {r.total_quantity} шт.
            {r.total_cost > 0 ? ` · ${tenge(r.total_cost)}` : ""} ·{" "}
            {dateTime(r.posted_at ?? r.created_at)}
          </Muted>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 12,
    gap: 4,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
