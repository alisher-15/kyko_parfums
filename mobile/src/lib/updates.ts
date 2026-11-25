import * as Updates from "expo-updates";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

/**
 * Over-the-air updates (EAS Update, channel of the build profile): fixes to screens and texts
 * reach installed apps without a new APK. The app checks when it starts and whenever it comes
 * back to the screen, downloads a new update in the background, and switches to it the next time
 * it goes to the background, so nobody is interrupted. A change of native code (a new native
 * package, app.json plugins, Firebase) still needs a new build: the runtime version (fingerprint)
 * changes, and such an update never reaches the older builds.
 */
export function useOtaUpdates(): void {
  useEffect(() => {
    if (Platform.OS === "web" || __DEV__ || !Updates.isEnabled) return;
    let pending = false;
    let checking = false;
    const check = async () => {
      if (checking || pending) return;
      checking = true;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          pending = true;
        }
      } catch {
        // No connection or the update service is down: the next start tries again.
      } finally {
        checking = false;
      }
    };
    void check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
      else if (state === "background" && pending) void Updates.reloadAsync();
    });
    return () => sub.remove();
  }, []);
}
