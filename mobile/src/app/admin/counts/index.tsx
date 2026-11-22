import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { AdminScreen, Pill } from "@/components/admin/kit";
import { Button, EmptyState, ErrorState, Loader, Muted, Notice, Txt } from "@/components/ui";
import type { CountBrief, StockCount } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/queries";
import { colors, fonts, radius } from "@/theme";

export default function CountsScreen() {
  return (
    <AdminScreen title="Инвентаризация" area="stock">
      <Counts />
    </AdminScreen>
  );
}

function Counts() {
  const list = useApi<CountBrief[]>("/admin/counts");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await api<StockCount>("/admin/counts", { body: {} });
      void list.refetch();
      router.push({ pathname: "/admin/counts/[id]", params: { id: c.id } });
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
      keyExtractor={(c) => String(c.id)}
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
            title="Новая инвентаризация"
            icon="add"
            loading={busy}
            onPress={() => void create()}
            testID="count-new"
          />
          <Muted style={{ fontSize: 13 }}>
            Пересчёт товара на полке: отсканируйте всё, что лежит, и проведите документ. Остатки
            станут равны посчитанному, расхождения запишутся в журнал склада.
          </Muted>
          {error && <Notice tone="error">{error}</Notice>}
        </View>
      }
      ListEmptyComponent={<EmptyState icon="clipboard-outline" title="Инвентаризаций пока нет" />}
      renderItem={({ item: c }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/admin/counts/[id]", params: { id: c.id } })}
          style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.cream }]}
        >
          <View style={styles.row}>
            <Txt style={{ fontFamily: fonts.sansBold }}>Инвентаризация № {c.id}</Txt>
            <Pill
              tone={c.status === "draft" ? "gold" : "muted"}
              label={c.status === "draft" ? "Идёт пересчёт" : "Проведена"}
            />
          </View>
          {c.note && <Txt style={{ fontSize: 14 }}>{c.note}</Txt>}
          <Muted style={{ fontSize: 12 }}>
            {c.lines} поз. · расхождение {c.difference > 0 ? `+${c.difference}` : c.difference} шт.
            · {dateTime(c.posted_at ?? c.created_at)}
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
