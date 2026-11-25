import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { api, hasTokens } from "./api";
import { prefs } from "./storage";

/**
 * Order notifications (backend: services/push.py). The shop's status changes reach the phone
 * through Expo's push service; tapping one opens the order. The phone is registered only after
 * the customer allows notifications, and forgotten on logout.
 */

const TOKEN_KEY = "kyko.pushToken";
// Set once the phone has asked at the first start (see askOnFirstLaunch).
const ASKED_KEY = "kyko.pushAsked";
// The Android channel the backend sends to («channelId» in services/push.py).
const CHANNEL = "orders";

/** On iOS the system asks once; after a «no» only the phone's settings can turn them on. */
export type PushStatus = "unsupported" | "undetermined" | "granted" | "denied";

// A notification that arrives while the app is open is still shown on top.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Push needs a real phone: no web build, no simulator. */
function supported(): boolean {
  return Platform.OS !== "web" && Device.isDevice;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!supported()) return "unsupported";
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

/** The «Заказы» channel. Android 13+ shows the permission prompt only once a channel exists. */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "Заказы",
    description: "Статус ваших заказов",
    importance: AndroidImportance.HIGH,
  });
}

/** Send this phone's address to the shop, for the signed-in customer. */
async function register(): Promise<boolean> {
  await ensureChannel();
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/me/push-tokens", {
      body: { token, platform: Platform.OS === "ios" ? "ios" : "android" },
    });
    await prefs.set(TOKEN_KEY, token);
    return true;
  } catch (err) {
    // No token: Expo Go on Android, no connection, or an Android build made without Firebase
    // (`googleServicesFile`). Tried again at the next start; the account screen says it isn't on.
    console.warn("Push registration failed", err);
    await prefs.set(TOKEN_KEY, null);
    return false;
  }
}

/** Whether this phone's address reached the shop (notifications can come). */
async function registered(): Promise<boolean> {
  return (await prefs.get<string | null>(TOKEN_KEY, null)) !== null;
}

/**
 * The first start after installing (or after the update that brought this): the phone asks
 * whether the shop may send order notifications. Asked once; after a «no» the account screen
 * turns them on later. A guest who allows them is registered when they sign in (syncPush).
 */
export async function askOnFirstLaunch(): Promise<void> {
  if (!supported()) return;
  if (await prefs.get<boolean>(ASKED_KEY, false)) return;
  await prefs.set(ASKED_KEY, true);
  if ((await pushStatus()) !== "undetermined") return;
  await ensureChannel();
  const { status } = await Notifications.requestPermissionsAsync();
  if (status === "granted" && hasTokens()) await register();
}

/** Ask the customer, and register the phone if they agree. */
export async function enablePush(): Promise<PushStatus> {
  if (!supported()) return "unsupported";
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return status === "denied" ? "denied" : "undetermined";
  await register();
  return "granted";
}

/** At start and after signing in: keep the shop's copy of this phone's address current. */
export async function syncPush(): Promise<void> {
  if ((await pushStatus()) === "granted") await register();
}

/** On logout: this phone stops getting the account's notifications. */
export async function forgetPush(): Promise<void> {
  const token = await prefs.get<string | null>(TOKEN_KEY, null);
  if (!token) return;
  await prefs.set(TOKEN_KEY, null);
  try {
    await api("/auth/push-tokens/forget", { body: { token } });
  } catch {
    // Offline: the shop forgets it once Expo reports the token unused, or on the next login.
  }
}

/** The permission, re-read when the customer comes back from the phone's settings. */
export function usePushStatus(): {
  status: PushStatus | null;
  /** Allowed on the phone but the shop has no address for it: nothing would arrive. */
  notConnected: boolean;
  enable: () => Promise<void>;
  openSettings: () => void;
} {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    const read = () => {
      void pushStatus().then(setStatus);
      void registered().then(setConnected);
    };
    read();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    return () => sub.remove();
  }, []);
  const enable = useCallback(async () => {
    setStatus(await enablePush());
    setConnected(await registered());
  }, []);
  const openSettings = useCallback(() => void Linking.openSettings(), []);
  return { status, notConnected: status === "granted" && !connected, enable, openSettings };
}

/** Tapping a notification opens its order, also when it started the app. */
export function useNotificationTaps(ready: boolean): void {
  useEffect(() => {
    if (!ready || Platform.OS === "web") return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      // A new order, sent to the staff: it opens in the admin panel.
      const adminOrderId = Number(data?.admin_order_id);
      if (Number.isInteger(adminOrderId) && adminOrderId > 0) {
        router.push({ pathname: "/admin/orders/[id]", params: { id: adminOrderId } });
        return;
      }
      const orderId = Number(data?.order_id);
      if (Number.isInteger(orderId) && orderId > 0) {
        router.push({ pathname: "/orders/[id]", params: { id: orderId } });
      }
    };
    // The tap that started the app, then the taps while it runs.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      open(response);
      void Notifications.clearLastNotificationResponseAsync();
    });
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [ready]);
}
