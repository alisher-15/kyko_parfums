import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname } from "expo-router";
import { Linking, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { whatsappAbout } from "@/lib/contacts";
import { siteUrl } from "@/lib/config";

// Screens where the button would cover a form or is of no use (staff screens, sign-in, checkout).
const HIDDEN = [
  "/admin",
  "/login",
  "/register",
  "/forgot-password",
  "/checkout",
  "/change-password",
  "/delete-account",
];
// The tab screens: the button sits above the tab bar.
const TABS = ["/", "/catalog", "/favorites", "/cart", "/account"];
/** The tab bar's height above the safe area, about the same on iOS and Android. */
const TAB_BAR = 56;
/** The product screen's «В корзину» bar above the safe area. */
const PRODUCT_BAR = 76;

/**
 * WhatsApp in the corner of every shop screen, as on the website: orders, payment and delivery
 * are agreed there. On a product screen the first message carries the product's link.
 */
export function WhatsAppButton() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  const product = pathname.startsWith("/product/");
  const bottom =
    insets.bottom + 14 + (product ? PRODUCT_BAR : TABS.includes(pathname) ? TAB_BAR : 0);
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
      <Ionicons name="logo-whatsapp" size={30} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#25d366",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
