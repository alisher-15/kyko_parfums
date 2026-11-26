import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Divider, ErrorState, Loader, Muted, Txt } from "@/components/ui";
import { useApi } from "@/lib/queries";
import type { Brand } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

export default function BrandsScreen() {
  const { data, error, refetch } = useApi<Brand[]>("/brands");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter((b) => !needle || b.name.toLowerCase().includes(needle));
  }, [data, q]);

  if (error && !data) return <ErrorState message={error.message} onRetry={() => refetch()} />;
  if (!data) return <Loader />;

  return (
    <FlatList
      data={shown}
      keyExtractor={(b) => String(b.id)}
      keyboardDismissMode="on-drag"
      ListHeaderComponent={
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Найти бренд"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoCorrect={false}
            accessibilityLabel="Найти бренд"
          />
        </View>
      }
      ItemSeparatorComponent={() => <Divider style={{ marginLeft: 16 }} />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push({
              pathname: "/collection",
              params: { brand_id: item.id, title: item.name },
            })
          }
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.goldSoft }]}
        >
          <Txt style={styles.name}>{item.name}</Txt>
          <Muted style={{ marginLeft: "auto" }}>{item.product_count}</Muted>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </Pressable>
      )}
      ListEmptyComponent={<Muted style={{ padding: 16 }}>Такого бренда нет</Muted>}
    />
  );
}

const styles = StyleSheet.create({
  search: {
    margin: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    height: 44,
  },
  input: { flex: 1, fontFamily: fonts.sans, fontSize: 16, color: colors.ink, height: "100%" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.white,
  },
  name: { fontFamily: fonts.serif, fontSize: 20 },
});
