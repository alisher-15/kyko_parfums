import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts, radius } from "@/theme";

// «Шкатулка» (the jewel box): the home page opens on a compact velvet stage with the search.

/**
 * The stage: a compact velvet-into-cherry band with the light logo and the search (what the
 * shop promises is said right below, in the trust row). `top`: the status bar's room, painted
 * by the stage. `header`: the logo row.
 */
export function Stage({ top, header }: { top: number; header: ReactNode }) {
  return (
    <LinearGradient
      colors={[colors.deep, colors.velvet, "#7a2136"]}
      locations={[0, 0.7, 1]}
      style={[styles.stage, { paddingTop: top + 6 }]}
    >
      {header}
      <Pressable
        accessibilityRole="search"
        testID="home-search"
        onPress={() => router.navigate("/catalog")}
        style={({ pressed }) => [styles.stageSearch, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="search-outline" size={18} color={colors.champagne} />
        <Text style={styles.stageSearchText}>Аромат, бренд или нота</Text>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  stage: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  stageSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: "rgba(244,237,228,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(233,201,190,0.45)",
  },
  stageSearchText: { fontFamily: fonts.sans, fontSize: 14, color: colors.onVelvetMuted },
});
