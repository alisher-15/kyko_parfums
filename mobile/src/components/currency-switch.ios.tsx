import SegmentedControlClass, {
  type SegmentedControlProps,
} from "@react-native-segmented-control/segmented-control";
import type { ComponentType } from "react";
import { useCurrency } from "@/lib/currency";
import { colors, fonts } from "@/theme";

// The package types its class with a mixin that the current React types don't take as JSX.
const SegmentedControl = SegmentedControlClass as unknown as ComponentType<SegmentedControlProps>;

const CURRENCIES = ["KZT", "USD"] as const;

/**
 * ₸ / $ as the system's segmented control (UISegmentedControl): Liquid Glass on iOS 26, the
 * standard control before. Hidden while the shop has no dollar rate. `tone="dark"`: on the
 * velvet stage.
 */
export function CurrencySwitch({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  const { currency, rate, setCurrency } = useCurrency();
  if (!rate) return null;
  return (
    <SegmentedControl
      accessibilityLabel="Валюта"
      values={["₸", "$"]}
      selectedIndex={CURRENCIES.indexOf(currency)}
      onChange={(e) => setCurrency(CURRENCIES[e.nativeEvent.selectedSegmentIndex] ?? "KZT")}
      appearance={dark ? "dark" : "light"}
      fontStyle={{
        fontFamily: fonts.sansSemi,
        fontSize: 14,
        color: dark ? colors.onVelvetMuted : colors.muted,
      }}
      activeFontStyle={{
        fontFamily: fonts.sansBold,
        fontSize: 14,
        color: dark ? colors.pearl : colors.ink,
      }}
      style={{ width: 84, height: 30 }}
    />
  );
}
