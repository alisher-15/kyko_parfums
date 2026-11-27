import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { createContext, useContext, useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";

// iOS 26's Liquid Glass for the app's floating chrome (the tab bar, the WhatsApp button, the
// home screen's bar). Everywhere else (Android, the web build, older iOS, «Reduce
// Transparency» on) the same pieces keep their solid look.

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

/**
 * The room the floating glass tab bar takes over the bottom of a tab screen, which its scroll
 * content leaves free (0 where the bar is solid and the screen ends above it).
 */
export const TabBarSpace = createContext(0);

export function useTabBarSpace(): number {
  return useContext(TabBarSpace);
}
