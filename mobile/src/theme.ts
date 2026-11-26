/**
 * «Бархат и шампань»: velvet (a near-black burgundy) frames the app — header, tab bar, dark
 * bands — over a paper ground; champagne gold is the one accent. Cormorant Garamond for titles
 * and perfume names, Inter for the UI. Every text color here passes WCAG AA on its ground.
 */
export const colors = {
  ink: "#2a070e",
  // Text-safe gold: 5.4:1 on paper, 6.2:1 on white and for white on it (WCAG AA).
  gold: "#7a5b32",
  goldDark: "#634a28",
  goldSoft: "#f1e7d8",
  cream: "#f6eee6",
  white: "#ffffff",
  line: "#e6d6d0",
  // Text field borders: 3:1 on white (WCAG 1.4.11), the same as the website's.
  field: "#9a7c81",
  muted: "#6b4a50",
  faint: "#a88f94",
  // Velvet: headers, the tab bar, dark bands and the main buttons; its lighter fold for fields
  // on velvet. Champagne: fills that carry velvet text (7.8:1) and marks on velvet;
  // champagneLight: text and icons on velvet (9.9:1).
  velvet: "#2a070e",
  velvetSoft: "#3d0f19",
  champagne: "#c9a26b",
  champagneLight: "#d9b98a",
  onVelvetMuted: "#cdb0b5",
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
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemi: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
} as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Order status badge colors, the same as the website's. */
export const statusColors = {
  new: { bg: "#f0f9ff", fg: "#0369a1", line: "#bae6fd" },
  processing: { bg: "#fffbeb", fg: "#b45309", line: "#fde68a" },
  shipped: { bg: "#f5f3ff", fg: "#6d28d9", line: "#ddd6fe" },
  delivered: { bg: "#ecfdf5", fg: "#047857", line: "#a7f3d0" },
  cancelled: { bg: "#f5f5f4", fg: "#78716c", line: "#e6d6d0" },
} as const;

/** Soft backgrounds for products without a photo (like the website's placeholder). */
export const placeholderTints = ["#f1e7d8", "#efe3dc", "#ece2d3", "#f4ebe2", "#e9dccb", "#f2e6df"];
