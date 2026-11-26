import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { colors, fonts, radius } from "@/theme";

// «Шкатулка» (the jewel box): the home page opens on a compact velvet stage with the search.

/** Opens the catalog with this search, or with the keyboard in its field when there is none. */
export function searchCatalog(text: string) {
  const q = text.trim();
  const at = String(Date.now());
  router.navigate({ pathname: "/catalog", params: q ? { q, at } : { focus: at } });
}

/**
 * The stage: a compact velvet-into-cherry band with the light logo and the search (what the
 * shop promises is said right below, in the trust row). `top`: the status bar's room, painted
 * by the stage. `header`: the logo row. The search is typed here, as on the website: «Найти»
 * opens the catalog with the results.
 */
export function Stage({ top, header }: { top: number; header: ReactNode }) {
  const [text, setText] = useState("");
  return (
    <LinearGradient
      colors={[colors.deep, colors.velvet, "#7a2136"]}
      locations={[0, 0.7, 1]}
      style={[styles.stage, { paddingTop: top + 6 }]}
    >
      {header}
      <View style={styles.stageSearch} accessibilityRole="search">
        <Ionicons name="search-outline" size={18} color={colors.champagne} />
        <TextInput
          testID="home-search"
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => {
            searchCatalog(text);
            setText("");
          }}
          placeholder="Аромат, бренд или нота"
          placeholderTextColor={colors.onVelvetMuted}
          accessibilityLabel="Поиск по аромату или бренду"
          returnKeyType="search"
          autoCorrect={false}
          style={styles.stageSearchText}
        />
      </View>
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
  // 16 pt: smaller text makes iOS zoom into the field (web build).
  stageSearchText: {
    flex: 1,
    height: "100%",
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.pearl,
  },
});
