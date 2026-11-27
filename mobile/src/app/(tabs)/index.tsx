import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useIsFocused } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CurrencySwitch } from "@/components/currency-switch";
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
import { Stage } from "@/components/jewel";
import { PromotionRail } from "@/components/shop";
import { useTabBarInset } from "@/components/tab-stack";
import { useApi } from "@/lib/queries";
import type { Brand, PromotionPublic } from "@/lib/types";
import { colors } from "@/theme";

// The home screen, as the website's (frontend/src/app/page.tsx), set in a jewel box: the compact
// velvet stage with the logo, the currency and the search stays pinned at the top, and the
// blocks of components/home.tsx scroll under it in the website's order. Pulling down to refresh
// shows the spinner under the stage.

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tabInset = useTabBarInset();
  const promotions = useApi<PromotionPublic[]>("/promotions");
  const brands = useApi<Brand[]>("/brands");
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const focused = useIsFocused();

  // Light status bar text over the velvet stage, dark again on the other screens.
  useEffect(() => {
    if (focused) setStatusBarStyle("light");
    return () => setStatusBarStyle("dark");
  }, [focused]);

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
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <Stage
        top={insets.top}
        header={
          <View style={styles.header}>
            <View style={styles.side} />
            <Image
              source={require("../../../assets/images/logo-pearl-light.png")}
              accessibilityRole="header"
              accessibilityLabel="Kyko"
              style={{ width: 112, height: 30 }}
              contentFit="contain"
            />
            <View style={[styles.side, { alignItems: "flex-end" }]}>
              <CurrencySwitch tone="dark" />
            </View>
          </View>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 + tabInset }}
        scrollIndicatorInsets={{ bottom: tabInset }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />
        }
      >
        {!!promotions.data?.length && (
          <View style={{ marginTop: 24 }}>
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
    paddingBottom: 4,
  },
  side: { width: 88 },
});
