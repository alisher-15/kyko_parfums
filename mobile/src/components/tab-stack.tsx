import { Stack } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "@/theme";

/**
 * A tab's own stack, for its header: the system navigation bar (on iOS 26 its buttons are
 * Liquid Glass by themselves), styled like the app's other headers. `headerShown={false}`: the
 * screen shows its title itself (the catalog, whose title slides away with its filters).
 */
export function TabStack({ title, headerShown = true }: { title: string; headerShown?: boolean }) {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.serif, fontSize: 26 },
        headerTitleAlign: "left",
        contentStyle: { backgroundColor: colors.cream },
      }}
    >
      <Stack.Screen name="index" options={{ title, headerShown }} />
    </Stack>
  );
}

/**
 * The room a tab screen leaves free at the bottom of its scroll content. On iOS the system tab
 * bar floats over the screen (Liquid Glass on iOS 26) and the tab's safe area includes it; on
 * Android and the web the tab bar sits under the screen, so nothing.
 */
export function useTabBarInset(): number {
  const { bottom } = useSafeAreaInsets();
  return Platform.OS === "ios" ? bottom : 0;
}
