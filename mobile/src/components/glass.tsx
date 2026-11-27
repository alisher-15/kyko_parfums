import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";

// iOS 26's Liquid Glass for the app's own floating pieces (the WhatsApp button, the home
// screen's bar), drawn by the system's UIGlassEffect through expo-glass-effect. The tab bar and
// the headers are the system's own on iOS and get the glass by themselves. Everywhere else
// (Android, the web build, older iOS, «Reduce Transparency» on) these pieces stay solid.

/** The device can draw Liquid Glass: iOS 26+, with the API really there (not every beta has it). */
const CAN_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

// «Reduce Transparency» (Settings → Accessibility): read once, then followed.
let reduceTransparency = false;
const listeners = new Set<() => void>();
if (CAN_GLASS) {
  const set = (on: boolean) => {
    reduceTransparency = on;
    listeners.forEach((l) => l());
  };
  void AccessibilityInfo.isReduceTransparencyEnabled().then(set);
  AccessibilityInfo.addEventListener("reduceTransparencyChanged", set);
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Whether to draw Liquid Glass now: the device can, and the customer hasn't turned it down. */
export function useGlass(): boolean {
  const reduced = useSyncExternalStore(
    subscribe,
    () => reduceTransparency,
    () => false,
  );
  return CAN_GLASS && !reduced;
}
