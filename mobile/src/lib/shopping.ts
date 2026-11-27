import { useAuth } from "./auth";
import { isStaff } from "./staff";

/**
 * Whether the signed-in person shops: customers and guests do; the shop's staff (owner,
 * cashier, warehouse) work in the admin panel and the till instead, so the app shows them no
 * cart and no favorites, and the tab bar keeps to four tabs (the iOS tab bar shows five at most).
 */
export function useShopping(): boolean {
  const { user } = useAuth();
  return !isStaff(user?.role);
}
