import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useCart } from "@/lib/cart";
import { useFavorites } from "@/lib/favorites";
import { colors, fonts } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

function icon(active: IconName, idle: IconName) {
  function TabIcon({
    focused,
    color,
    size,
  }: {
    focused: boolean;
    color: ColorValue;
    size: number;
  }) {
    return <Ionicons name={focused ? active : idle} size={size} color={color as string} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const { count } = useCart();
  const favorites = useFavorites();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontFamily: fonts.sansSemi, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line },
        tabBarBadgeStyle: {
          backgroundColor: colors.gold,
          fontFamily: fonts.sansBold,
          fontSize: 11,
        },
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.serifBold, fontSize: 24 },
        headerTitleAlign: "left",
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Главная", headerShown: false, tabBarIcon: icon("home", "home-outline") }}
      />
      <Tabs.Screen
        name="catalog"
        options={{ title: "Каталог", tabBarIcon: icon("search", "search-outline") }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Избранное",
          tabBarIcon: icon("heart", "heart-outline"),
          tabBarBadge: favorites.ids.length || undefined,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Корзина",
          tabBarIcon: icon("bag", "bag-outline"),
          tabBarBadge: count ? (count > 99 ? "99+" : count) : undefined,
          tabBarButtonTestID: "tab-cart",
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Профиль", tabBarIcon: icon("person", "person-outline") }}
      />
    </Tabs>
  );
}
