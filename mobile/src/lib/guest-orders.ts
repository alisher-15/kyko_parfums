import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { prefs } from "./storage";

/**
 * Orders placed without an account, as on the website: the shop gives each a secret key
 * (`guest_key`), and whoever has it sees and can cancel the order (`/orders/guest/{id}` with the
 * «X-Order-Key» header). The app keeps them on this phone, so «Мои заказы» lists them.
 */
export interface GuestOrder {
  id: number;
  key: string;
  total: number;
  created_at: string;
}

const KEY = "kyko.guestOrders";

export async function guestOrders(): Promise<GuestOrder[]> {
  return prefs.get<GuestOrder[]>(KEY, []);
}

export async function rememberGuestOrder(order: GuestOrder): Promise<void> {
  const known = (await guestOrders()).filter((o) => o.id !== order.id);
  await prefs.set(KEY, [order, ...known].slice(0, 50));
}

/** The guest orders on this phone, read again whenever the screen comes into view. */
export function useGuestOrders(): GuestOrder[] {
  const [orders, setOrders] = useState<GuestOrder[]>([]);
  useFocusEffect(
    useCallback(() => {
      void guestOrders().then(setOrders);
    }, []),
  );
  return orders;
}
