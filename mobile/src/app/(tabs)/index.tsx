import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BrandsLine,
  Budget,
  Choice,
  Consult,
  Hits,
  Recent,
  StartGrid,
  Testers,
  TrustRow,
  Wholesale,
} from "@/components/home";
import { CurrencySwitch, PromotionRail } from "@/components/shop";
import { Muted } from "@/components/ui";
import { useApi } from "@/lib/queries";
import type { Brand, PromotionPublic } from "@/lib/types";
import { colors, radius } from "@/theme";

// The home screen, as the website's (frontend/src/app/page.tsx): search, banners, then the blocks
// of components/home.tsx. WhatsApp floats over every screen (components/whatsapp-button.tsx).

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const promotions = useApi<PromotionPublic[]>("/promotions");
  const brands = useApi<Brand[]>("/brands");
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Every block reloads: they all read /products, /promotions, /brands or /categories.
  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        /^\/(products|promotions|brands|categories)/.test(q.queryKey[0]),
    });
    setRefreshing(false);
  };

  return (
    // The status bar's room is outside the scroll, so the search sticks just below it.
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <View style={{ height: insets.top, backgroundColor: colors.cream }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 96 }}
        // The search (the second child) stays at the top while the page scrolls under it.
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />
        }
      >
        <View style={styles.header}>
          {/* The logo in the middle; the currency at the right, the same room at the left. */}
          <View style={styles.side} />
          <Image
            source={require("../../../assets/images/logo-pearl.png")}
            accessibilityRole="header"
            accessibilityLabel="Kyko"
            style={{ width: 112, height: 30 }}
            contentFit="contain"
          />
          <View style={[styles.side, { alignItems: "flex-end" }]}>
            <CurrencySwitch />
          </View>
        </View>

        <View style={styles.searchBar}>
          <Pressable
            accessibilityRole="search"
            testID="home-search"
            onPress={() => router.navigate("/catalog")}
            style={styles.search}
          >
            <Ionicons name="search-outline" size={18} color={colors.muted} />
            <Muted style={{ fontSize: 14 }}>Аромат, бренд или нота</Muted>
          </Pressable>
        </View>

        {!!promotions.data?.length && (
          <View style={{ marginTop: 8 }}>
            <PromotionRail promotions={promotions.data} />
          </View>
        )}

        <TrustRow />
        <StartGrid />
        <Hits />
        <Testers />
        <Choice />
        <Budget />
        <Consult />
        <Recent />
        {!!brands.data?.length && <BrandsLine brands={brands.data} />}
        <Wholesale />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  side: { width: 72 },
  searchBar: { backgroundColor: colors.cream, paddingTop: 8, paddingBottom: 12 },
  search: {
    marginHorizontal: 16,
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
});
