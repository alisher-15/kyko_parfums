/**
 * The storefront's design system (frontend/src/app/globals.css): a warm light ground, ink text
 * and one gold accent. Cormorant Garamond for titles and perfume names, Manrope for the UI.
 */
export const colors = {
  ink: "#2a1a1f",
  // Text-safe gold: 4.7:1 on cream and white on it (WCAG AA), the same as the website's.
  gold: "#9e2a4b",
  goldDark: "#7a1f39",
  goldSoft: "#f6e9e2",
  cream: "#fbf6f2",
  white: "#ffffff",
  line: "#eadfd8",
  // Text field borders: 3:1 on white (WCAG 1.4.11), the same as the website's.
  field: "#8c7b80",
  muted: "#6a5a5e",
  faint: "#a8999c",
  ok: "#047857",
  okSoft: "#ecfdf5",
  warn: "#b45309",
  warnSoft: "#fffbeb",
  warnLine: "#fde68a",
  danger: "#b91c1c",
  dangerSoft: "#fef2f2",
  dangerLine: "#fecaca",
} as const;

export const fonts = {
  serif: "Nunito_800ExtraBold",
  serifBold: "Nunito_900Black",
  sans: "Onest_400Regular",
  sansMedium: "Onest_500Medium",
  sansSemi: "Onest_600SemiBold",
  sansBold: "Onest_700Bold",
} as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Order status badge colors, the same as the website's. */
export const statusColors = {
  new: { bg: "#f0f9ff", fg: "#0369a1", line: "#bae6fd" },
  processing: { bg: "#fffbeb", fg: "#b45309", line: "#fde68a" },
  shipped: { bg: "#f5f3ff", fg: "#6d28d9", line: "#ddd6fe" },
  delivered: { bg: "#ecfdf5", fg: "#047857", line: "#a7f3d0" },
  cancelled: { bg: "#f5f5f4", fg: "#78716c", line: "#eadfd8" },
} as const;

/** Soft backgrounds for products without a photo (like the website's placeholder). */
export const placeholderTints = ["#f6e9e2", "#f1cbb6", "#fbe3dc", "#ead7ce", "#f8dfd6", "#f3e4ea"];
