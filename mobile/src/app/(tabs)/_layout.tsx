import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";
import { NativeTabs } from "expo-router/native-tabs";
import type { ComponentProps } from "react";
import { Platform, type ColorValue } from "react-native";
import { JewelTabBar } from "@/components/tab-bar";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { isStaff } from "@/lib/staff";
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

/**
 * iOS: the system's own tab bar (UITabBarController), Liquid Glass on iOS 26, shrinking as the
 * page scrolls down. The tabs' screens scroll under it and leave its room free themselves
 * (`useTabBarInset`), so the system's automatic insets are off.
 */
function SystemTabs({
  cart,
  favorites,
  staff,
}: {
  cart: number;
  favorites: number;
  staff: boolean;
}) {
  return (
    <NativeTabs tintColor={colors.gold} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
        <NativeTabs.Trigger.Label>Главная</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="catalog" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
        <NativeTabs.Trigger.Label>Каталог</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="favorites" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: "heart", selected: "heart.fill" }} />
        <NativeTabs.Trigger.Label>Избранное</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={!favorites}>{String(favorites)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cart" disableAutomaticContentInsets testID="tab-cart">
        <NativeTabs.Trigger.Icon sf={{ default: "bag", selected: "bag.fill" }} />
        <NativeTabs.Trigger.Label>Корзина</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={!cart}>
          {cart > 99 ? "99+" : String(cart)}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      {/* Staff only: owner, cashier, warehouse (lib/staff.ts). */}
      <NativeTabs.Trigger
        name="admin"
        hidden={!staff}
        disableAutomaticContentInsets
        testID="tab-admin"
      >
        <NativeTabs.Trigger.Icon sf={{ default: "briefcase", selected: "briefcase.fill" }} />
        <NativeTabs.Trigger.Label>Админка</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: "person", selected: "person.fill" }} />
        <NativeTabs.Trigger.Label>Профиль</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

export default function TabsLayout() {
  const { count } = useCart();
  const { user } = useAuth();
  const favorites = useFavorites();
  if (Platform.OS === "ios") {
    return <SystemTabs cart={count} favorites={favorites.ids.length} staff={isStaff(user?.role)} />;
  }
  // Android and the web: the velvet pill (components/tab-bar.tsx). Each tab's header comes from
  // its own stack (components/tab-stack.tsx), as on iOS.
  return (
    <Tabs
      tabBar={(props) => <JewelTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.3 },
        tabBarStyle: { backgroundColor: colors.cream, borderTopColor: colors.line },
        tabBarBadgeStyle: {
          backgroundColor: colors.velvet,
          color: colors.white,
          fontFamily: fonts.sansBold,
          fontSize: 11,
        },
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.serif, fontSize: 26 },
        headerTitleAlign: "left",
        sceneStyle: { backgroundColor: colors.cream },
        headerShown: false,
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
        name="admin"
        options={{
          title: "Админка",
          // Staff only: owner, cashier, warehouse (lib/staff.ts).
          href: isStaff(user?.role) ? undefined : null,
          tabBarIcon: icon("briefcase", "briefcase-outline"),
          tabBarButtonTestID: "tab-admin",
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Профиль", tabBarIcon: icon("person", "person-outline") }}
      />
    </Tabs>
  );
}
