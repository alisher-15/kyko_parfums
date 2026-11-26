/**
 * «Каждая — жемчужина» (the brand file): cherry #5C1020 frames the app — header, tab bar,
 * main buttons — over a pearl ground #F4EDE4; mother-of-pearl #E9C9BE is the one accent and
 * velvet #2A070E the darkest tone (text, dark bands). Cormorant Garamond for titles and
 * perfume names, Manrope for the UI. Every text color here passes WCAG AA on its ground.
 */
export const colors = {
  ink: "#2a070e",
  // The accent for text and marks on light grounds: cherry (11.7:1 on pearl). The name stays
  // «gold» so every screen follows the theme.
  gold: "#5c1020",
  goldDark: "#451019",
  goldSoft: "#f3e2da",
  cream: "#f4ede4",
  white: "#ffffff",
  line: "#e8d9d0",
  // Text field borders: 3:1 on white (WCAG 1.4.11), the same as the website's.
  field: "#9a7c81",
  muted: "#6b4a50",
  faint: "#a88f94",
  // Cherry (named velvet for the frame role): the header, the tab bar and the main buttons;
  // its lighter fold for fields on it. Pearl: fills that carry cherry text (8.8:1) and marks
  // on cherry; pearlLight: text and icons on cherry.
  velvet: "#5c1020",
  velvetSoft: "#6e1a2c",
  champagne: "#e9c9be",
  champagneLight: "#e9c9be",
  onVelvetMuted: "#e0bcc2",
  deep: "#2a070e",
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
  cancelled: { bg: "#f5f5f4", fg: "#78716c", line: "#e8d9d0" },
} as const;

/** Soft backgrounds for products without a photo (like the website's placeholder). */
export const placeholderTints = ["#f3e2da", "#efe0d8", "#f6ebe4", "#ead6cd", "#f1e4dd", "#ecdcd4"];
