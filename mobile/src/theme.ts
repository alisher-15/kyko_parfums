/**
 * «Каждая — жемчужина» (the brand file), set as an editorial shop: a light pearl page and
 * chrome (header and tab bar are not filled), white photo wells without frames, cherry
 * #5C1020 only where the customer acts (the main button, links, the active tab), velvet
 * #2A070E for text, mother-of-pearl #E9C9BE and the pearl itself as the brand's mark.
 * Cormorant Garamond for titles and perfume names, Manrope for the UI.
 * Every text color here passes WCAG AA on its ground.
 */
export const colors = {
  ink: "#2a070e",
  // The accent for text and marks on light grounds: cherry (12.7:1 on the page). The name
  // stays «gold» so every screen follows the theme.
  gold: "#5c1020",
  goldDark: "#451019",
  // Soft fills: chips, skeletons, the empty states' circle.
  goldSoft: "#f2e8e1",
  // The page and the chrome: a light pearl.
  cream: "#faf6f1",
  white: "#ffffff",
  line: "#eadfd6",
  // Text field borders: 3:1 on white (WCAG 1.4.11).
  field: "#9a7c81",
  muted: "#6b4a50",
  faint: "#a88f94",
  // The main buttons and filled marks: cherry, and its lighter fold.
  velvet: "#5c1020",
  velvetSoft: "#6e1a2c",
  // Mother-of-pearl: fills that carry cherry text (8.8:1) and marks on cherry.
  champagne: "#e9c9be",
  champagneLight: "#e9c9be",
  onVelvetMuted: "#e0bcc2",
  // Brand pearl: the brand file's background, used for brand moments.
  pearl: "#f4ede4",
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
  // The brand line «Каждая — жемчужина» and the stage's headline.
  serifItalic: "CormorantGaramond_500Medium_Italic",
  sans: "Manrope_400Regular",
  sansMedium: "Manrope_500Medium",
  sansSemi: "Manrope_600SemiBold",
  sansBold: "Manrope_700Bold",
} as const;

/** Small, precise corners: luxury retail draws edges, it doesn't round them off. */
export const radius = { sm: 4, md: 6, lg: 8, pill: 999 } as const;

/** One spacing scale for every screen (4-point steps). */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, section: 40 } as const;

/** The type scale: Cormorant for what is read as a name, Manrope for what is used. */
export const type = {
  display: { fontFamily: fonts.serif, fontSize: 38, lineHeight: 42 },
  h1: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 34 },
  h2: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 28 },
  name: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 21 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  // Uppercase labels: brand names, sections, buttons.
  label: {
    fontFamily: fonts.sansSemi,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.8,
    textTransform: "uppercase" as const,
  },
} as const;

/** Order status badge colors, the same as the website's. */
export const statusColors = {
  new: { bg: "#f0f9ff", fg: "#0369a1", line: "#bae6fd" },
  processing: { bg: "#fffbeb", fg: "#b45309", line: "#fde68a" },
  shipped: { bg: "#f5f3ff", fg: "#6d28d9", line: "#ddd6fe" },
  delivered: { bg: "#ecfdf5", fg: "#047857", line: "#a7f3d0" },
  cancelled: { bg: "#f5f5f4", fg: "#78716c", line: "#eadfd6" },
} as const;

/**
 * The studio's backdrops: soft jewel tones a bottle stands on (by product, so a card keeps its
 * color). The photo's white is multiplied into them, as if shot on colored paper.
 */
export const studioTints = ["#efe1d8", "#ebe3d3", "#e2e6dc", "#e0e5eb", "#e9e0e8", "#f1dfd9"];

/** Soft backgrounds for products without a photo (like the website's placeholder). */
export const placeholderTints = ["#f4ede4", "#f2e8e1", "#f6efe9", "#efe4dc", "#f5ece6", "#f1e7e0"];
