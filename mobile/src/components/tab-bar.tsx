import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/theme";
import { Pearl } from "./ui";

/** The pill's height without the safe area; the WhatsApp button sits above it. */
export const TAB_PILL = 62;

/**
 * The tab bar as the base of a jewel box: a velvet pill floating over the pearl page, the
 * chosen tab marked with a small pearl. Same tabs, badges and test IDs as the default bar;
 * a hidden tab (`href: null`, the admin panel for customers) is left out.
 */
export function JewelTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
}: BottomTabBarProps) {
  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.pill} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          if ((options as { hidden?: boolean }).hidden) return null;
          const focused = index === state.index;
          const label = typeof options.title === "string" ? options.title : route.name;
          const color = focused ? colors.champagne : "#b8979d";
          const badge = options.tabBarBadge;
          const onPress = () => {
            const event = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              testID={options.tabBarButtonTestID}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={badge ? `${label}, ${badge}` : label}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
              style={styles.item}
            >
              <View>
                {options.tabBarIcon?.({ focused, color, size: 22 })}
                {badge !== undefined && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {label}
              </Text>
              {/* The pearl under the chosen tab: the brand's mark as the «you are here». */}
              <View style={styles.markSlot}>{focused && <Pearl size={6} />}</View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { backgroundColor: colors.cream, paddingHorizontal: 12, paddingTop: 6 },
  pill: {
    height: TAB_PILL,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.deep,
    borderRadius: 24,
    paddingHorizontal: 6,
    shadowColor: colors.deep,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 6, gap: 2 },
  label: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.3 },
  markSlot: { height: 8, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.champagne,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fonts.sansBold, fontSize: 9, color: colors.deep },
});
