import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useIsFocused } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Animated, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BrandsLine,
  Budget,
  Choice,
  Consult,
  Hits,
  Recent,
  Testers,
  TrustRow,
  Wholesale,
} from "@/components/home";
import { CatalogIndex, Moods, Stage } from "@/components/jewel";
import { CurrencySwitch, PromotionRail } from "@/components/shop";
import { useApi } from "@/lib/queries";
import type { Brand, PromotionPublic } from "@/lib/types";
import { colors } from "@/theme";

// The home screen, as the website's blocks (frontend/src/app/page.tsx) set in a jewel box: the
// compact velvet stage with the search, then the blocks of components/home.tsx and components/jewel.tsx.
// A light bar with the logo and the search slides in once the stage has scrolled away.

/** How far the page scrolls before the light bar shows. */
const BAR_FROM = 130;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const promotions = useApi<PromotionPublic[]>("/promotions");
  const brands = useApi<Brand[]>("/brands");
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [scrollY] = useState(() => new Animated.Value(0));
  const focused = useIsFocused();
  const [onStage, setOnStage] = useState(true);

  // Light status bar text over the velvet stage, dark once the light bar covers it.
  useEffect(() => {
    if (focused) setStatusBarStyle(onStage ? "light" : "dark");
    return () => setStatusBarStyle("dark");
  }, [focused, onStage]);
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => setOnStage(value < BAR_FROM));
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  const barOpacity = scrollY.interpolate({
    inputRange: [BAR_FROM - 40, BAR_FROM + 20],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // Every block reloads: they all read /products, /promotions, /brands, /categories or /filters.
  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        /^\/(products|promotions|brands|categories|filters)/.test(q.queryKey[0]),
    });
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.champagne}
            progressViewOffset={insets.top}
          />
        }
      >
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

        {!!promotions.data?.length && (
          <View style={{ marginTop: 24 }}>
            <PromotionRail promotions={promotions.data} />
          </View>
        )}

        <TrustRow />
        <Moods />
        <Hits />
        <CatalogIndex />
        <Testers />
        <Choice />
        <Budget />
        <Consult />
        <Recent />
        {!!brands.data?.length && <BrandsLine brands={brands.data} />}
        <Wholesale />
      </Animated.ScrollView>

      {/* The light bar: the dark logo and a way to search, once the stage is gone. */}
      <Animated.View
        pointerEvents={onStage ? "none" : "auto"}
        style={[styles.bar, { paddingTop: insets.top + 6, opacity: barOpacity }]}
      >
        <View style={styles.side}>
          <Pressable
            accessibilityRole="search"
            accessibilityLabel="Поиск"
            hitSlop={10}
            onPress={() => router.navigate("/catalog")}
          >
            <Ionicons name="search-outline" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <Image
          source={require("../../../assets/images/logo-pearl.png")}
          accessibilityLabel="Kyko"
          style={{ width: 96, height: 26 }}
          contentFit="contain"
        />
        <View style={[styles.side, { alignItems: "flex-end" }]}>
          <CurrencySwitch />
        </View>
      </Animated.View>
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
  side: { width: 72 },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.cream,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
});
