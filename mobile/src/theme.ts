/**
 * The storefront's design system (frontend/src/app/globals.css): a warm light ground, ink text
 * and one gold accent. Cormorant Garamond for titles and perfume names, Manrope for the UI.
 */
export const colors = {
  ink: "#1c1917",
  // Text-safe gold: 4.7:1 on cream and white on it (WCAG AA), the same as the website's.
  gold: "#8c6945",
  goldDark: "#6f5235",
  goldSoft: "#f3ebe1",
  cream: "#faf8f5",
  white: "#ffffff",
  line: "#e7e5e4",
  // Text field borders: 3:1 on white (WCAG 1.4.11), the same as the website's.
  field: "#948d87",
  muted: "#78716c",
  faint: "#a8a29e",
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
  serif: "CormorantGaramond_600SemiBold",
  serifBold: "CormorantGaramond_700Bold",
  sans: "Manrope_400Regular",
  sansMedium: "Manrope_500Medium",
  sansSemi: "Manrope_600SemiBold",
  sansBold: "Manrope_700Bold",
} as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Order status badge colors, the same as the website's. */
export const statusColors = {
  new: { bg: "#f0f9ff", fg: "#0369a1", line: "#bae6fd" },
  processing: { bg: "#fffbeb", fg: "#b45309", line: "#fde68a" },
  shipped: { bg: "#f5f3ff", fg: "#6d28d9", line: "#ddd6fe" },
  delivered: { bg: "#ecfdf5", fg: "#047857", line: "#a7f3d0" },
  cancelled: { bg: "#f5f5f4", fg: "#78716c", line: "#e7e5e4" },
} as const;

/** Soft backgrounds for products without a photo (like the website's placeholder). */
export const placeholderTints = ["#fdf2e4", "#fce8ec", "#efe9f7", "#e8f1ec", "#f6efe2", "#eaeef6"];
