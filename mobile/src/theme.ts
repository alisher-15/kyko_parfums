/**
 * The storefront's design system (frontend/src/app/globals.css): a warm light ground, ink text
 * and one gold accent. Cormorant Garamond for titles and perfume names, Manrope for the UI.
 */
export const colors = {
  ink: "#2a070e",
  // Text-safe gold: 4.7:1 on cream and white on it (WCAG AA), the same as the website's.
  gold: "#a8385a",
  goldDark: "#8a2b48",
  goldSoft: "#f3e3df",
  cream: "#f6eee6",
  white: "#ffffff",
  line: "#e6d6d0",
  // Text field borders: 3:1 on white (WCAG 1.4.11), the same as the website's.
  field: "#9a7c81",
  muted: "#6b4a50",
  faint: "#a88f94",
  // Velvet direction: the dark ground of headers and bars, its lighter fold, the rose of a
  // scent spot (buttons, on velvet text) and pearl (text and marks on velvet).
  velvet: "#2a070e",
  velvetSoft: "#3d0f19",
  rose: "#d4627f",
  pearl: "#e9c9be",
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
export const placeholderTints = ["#e9c9be", "#f1dcd5", "#efe0e3", "#e6d3cf", "#f4e6e0", "#eadbe0"];
