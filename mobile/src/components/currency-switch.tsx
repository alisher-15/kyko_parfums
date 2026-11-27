import { Pressable, StyleSheet, Text, View } from "react-native";
import { useCurrency } from "@/lib/currency";
import { colors, fonts } from "@/theme";

/**
 * ₸ / $. Hidden while the shop has no dollar rate. `tone="dark"`: on the velvet stage. iOS has
 * the system's segmented control instead (currency-switch.ios.tsx).
 */
export function CurrencySwitch({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  const { currency, rate, setCurrency } = useCurrency();
  if (!rate) return null;
  return (
    <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel="Валюта">
      {(["KZT", "USD"] as const).map((c) => (
        <Pressable
          key={c}
          accessibilityRole="radio"
          accessibilityState={{ checked: currency === c }}
          accessibilityLabel={c === "KZT" ? "Цены в тенге" : "Цены в долларах"}
          onPress={() => setCurrency(c)}
          style={[
            styles.switchItem,
            currency === c && styles.switchActive,
            currency === c && dark && { borderBottomColor: colors.champagne },
          ]}
        >
          <Text
            style={[
              styles.switchText,
              dark && { color: colors.onVelvetMuted },
              currency === c && { color: dark ? colors.pearl : colors.ink },
            ]}
          >
            {c === "KZT" ? "₸" : "$"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: "row", gap: 2 },
  switchItem: {
    width: 30,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: "transparent",
  },
  switchActive: { borderBottomColor: colors.ink },
  switchText: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.faint },
});
