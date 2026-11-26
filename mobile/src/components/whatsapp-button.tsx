import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname } from "expo-router";
import { Linking, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { whatsappAbout } from "@/lib/contacts";
import { siteUrl } from "@/lib/config";

// The shop's browsing screens only. Elsewhere it covered content (the account's menu rows, an
// order's history, forms); the account has a WhatsApp row and an order its «Написать о заказе».
const SHOWN = ["/", "/catalog", "/cart", "/brands", "/categories", "/collection"];
const SHOWN_UNDER = ["/product/"];
// The tab screens: the button sits above the tab bar.
const TABS = ["/", "/catalog", "/favorites", "/cart", "/account"];
/** The tab bar's height above the safe area, about the same on iOS and Android. */
const TAB_BAR = 56;
/** The product screen's «В корзину» bar above the safe area. */
const PRODUCT_BAR = 76;
/** The cart's «Оформить заказ» bar above the tab bar: the button covered its right end. */
const CART_BAR = 76;

/**
 * WhatsApp in the corner of every shop screen, as on the website: orders, payment and delivery
 * are agreed there. On a product screen the first message carries the product's link.
 */
export function WhatsAppButton() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (!SHOWN.includes(pathname) && !SHOWN_UNDER.some((p) => pathname.startsWith(p))) return null;
  const product = pathname.startsWith("/product/");
  const bottom =
    insets.bottom +
    14 +
    (product ? PRODUCT_BAR : TABS.includes(pathname) ? TAB_BAR : 0) +
    (pathname === "/cart" ? CART_BAR : 0);
  const text = product
    ? `Здравствуйте! Вопрос про этот аромат: ${siteUrl(pathname.replace("/product/", "/products/"))}`
    : "Здравствуйте! У меня вопрос";
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Написать в WhatsApp"
      testID="whatsapp-button"
      onPress={() => void Linking.openURL(whatsappAbout(text))}
      style={({ pressed }) => [styles.button, { bottom }, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name="logo-whatsapp" size={26} color="#1fa855" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // A quiet white button with WhatsApp's green mark: present on every shop screen, without
  // a loud green disc over the products.
  button: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#eadfd6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2a070e",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
});
