import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useAuth } from "@/lib/auth";
import { childrenOf, openCategory, useCategories } from "@/lib/categories";
import { assetUrl } from "@/lib/config";
import { CONTACTS, WHATSAPP, YOUTUBE, whatsappAbout } from "@/lib/contacts";
import { plural } from "@/lib/format";
import { useApi, type ProductFilters } from "@/lib/queries";
import { useRecentlyViewed } from "@/lib/recent";
import type { Brand, Page, ProductListItem } from "@/lib/types";
import { colors, fonts, radius, space, type } from "@/theme";
import { ProductCard } from "./product";
import { Eyebrow, Muted, Pearl, Title, Txt } from "./ui";

// The home screen's blocks, as on the website (frontend/src/app/home-sections.tsx) and in the
// same order: trust, «С чего начнём?», «Хиты продаж», «Тестеры», «Выбор Kyko», «Подарок по
// бюджету», advice in WhatsApp, «Вы смотрели», the top brands in one line, and wholesale. Set in
// the jewel box style: velvet and cherry, mother-of-pearl, bottles on studio backdrops.

type Params = Record<string, string | number>;

/** Opens part of the catalog (the collection screen) with these filters and this title. */
function openCollection(title: string, params: Params) {
  router.push({ pathname: "/collection", params: { ...params, title } });
}

export function Section({
  title,
  hint,
  more,
  moreLabel = "Все",
  children,
}: {
  title: string;
  hint?: string;
  more?: () => void;
  moreLabel?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ marginTop: space.xxl }}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Title>{title}</Title>
          {!!hint && <Muted style={{ fontSize: 13, marginTop: 2 }}>{hint}</Muted>}
        </View>
        {more && (
          <Pressable accessibilityRole="link" onPress={more} hitSlop={8}>
            <Txt style={styles.more}>{moreLabel}</Txt>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function Rail({
  items,
  card = (p) => <ProductCard product={p} width={RAIL_CARD} compact />,
}: {
  items: ProductListItem[];
  card?: (p: ProductListItem) => ReactNode;
}) {
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(p) => String(p.id)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
      renderItem={({ item }) => <>{card(item)}</>}
    />
  );
}

const TRUST: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  href?: string;
}[] = [
  {
    icon: "shield-checkmark-outline",
    title: "100% оригинал",
    text: "только оригинальная парфюмерия",
    href: YOUTUBE,
  },
  { icon: "car-outline", title: "Доставка по Казахстану", text: "способ подберём под вас" },
  {
    icon: "logo-whatsapp",
    title: "Заказ — в WhatsApp",
    text: "подтвердим наличие, оплату и доставку",
    href: WHATSAPP,
  },
  {
    icon: "sparkles-outline",
    title: "Подберём аромат",
    text: "бесплатная консультация",
    href: whatsappAbout("Здравствуйте! Помогите подобрать аромат"),
  },
];

/** Why buy here: originals, delivery, the order in WhatsApp, advice. One row that scrolls. */
export function TrustRow() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      style={{ marginTop: 16 }}
    >
      {TRUST.map((t) => (
        <Pressable
          key={t.title}
          disabled={!t.href}
          accessibilityRole={t.href ? "link" : undefined}
          onPress={() => t.href && void Linking.openURL(t.href)}
          style={styles.trust}
        >
          <View style={styles.trustIcon}>
            <Ionicons name={t.icon} size={18} color={colors.velvet} />
          </View>
          <View>
            <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 13 }}>{t.title}</Txt>
            <Muted style={{ fontSize: 11 }}>{t.text}</Muted>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * A way into the catalog with its count and a picture: a section's own (`image`, set in
 * «Категории»), else a photo of its most popular product (a query of one product, sorted by
 * sales). Hidden while it has no products.
 */
function EntryTile({
  title,
  params,
  size,
  note,
  image: ownImage,
  accent = false,
  onPress,
}: {
  title: string;
  params: Params;
  /** A section's own picture (set in «Категории»), instead of its most popular product's. */
  image?: string | null;
  /** The tile's side in points: the grid works it out from the screen's width. */
  size: number;
  note?: (total: number) => string;
  /** The mother-of-pearl tile (testers), standing out among the white ones. */
  accent?: boolean;
  /** Instead of opening the collection with `params`. */
  onPress?: () => void;
}) {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    ...params,
    sort: "popular",
    page_size: 1,
  } as ProductFilters & Params);
  // A soft tile while it loads, so the grid doesn't jump.
  const box = { width: size, height: size };
  if (!data) return <View style={[styles.entry, box, styles.placeholder]} />;
  if (data.total === 0) return null;
  const image = assetUrl(ownImage || data.items[0]?.image_url);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={onPress ?? (() => openCollection(title, params))}
      style={({ pressed }) => [
        styles.entry,
        box,
        accent && { backgroundColor: colors.champagne },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={styles.entryTitle}>{title}</Text>
      <Text style={styles.entryNote}>
        {note
          ? note(data.total)
          : `${data.total} ${plural(data.total, "аромат", "аромата", "ароматов")}`}
      </Text>
      {image && (
        <View style={styles.entryPic}>
          <Image
            source={image}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            contentPosition="right bottom"
            accessibilityIgnoresInvertColors
          />
        </View>
      )}
    </Pressable>
  );
}

/**
 * «С чего начнём?»: for her, for him, unisex, testers, niche, then the catalog's other sections
 * (sets, make-up…) as they appear. Three in a row, on a velvet panel of their own.
 */
export function StartGrid() {
  const { width } = useWindowDimensions();
  const tree = useCategories().data;
  const sections = tree ? childrenOf(tree, null) : [];
  const perfume = sections.find((c) => c.kind === "perfume");
  const others = sections.filter((c) => c !== perfume);
  // Three tiles in a row on phones, more on tablets. The side is worked out here, not as a
  // percentage: a percentage of a wrapping row left a third of the row empty on Android.
  const cols = width >= 700 ? 6 : width >= 520 ? 4 : 3;
  // The screen less the panel's margins and padding on each side.
  const inner = Math.min(width, 1100) - 2 * 16 - 2 * 14;
  // Rounded down, and a point spare, so the last tile of a row never wraps.
  const size = Math.floor((inner - (cols - 1) * TILE_GAP - 1) / cols);
  return (
    <LinearGradient colors={[colors.deep, colors.velvet]} style={styles.start} testID="start-grid">
      <View style={styles.startHead}>
        <Title style={{ flex: 1, color: colors.pearl }}>С чего начнём?</Title>
        <Pressable accessibilityRole="link" onPress={() => router.push("/categories")} hitSlop={8}>
          <Txt style={[styles.more, { color: colors.champagne }]}>Все категории</Txt>
        </Pressable>
      </View>
      <View style={styles.grid}>
        <EntryTile size={size} title="Для неё" params={{ gender: "female" }} />
        <EntryTile size={size} title="Для него" params={{ gender: "male" }} />
        <EntryTile size={size} title="Унисекс" params={{ gender: "unisex" }} />
        <EntryTile
          size={size}
          title="Тестеры"
          params={{ tester: "true" }}
          note={() => "дешевле флакона"}
          accent
        />
        <EntryTile size={size} title="Ниша и люкс" params={{ top: "true" }} />
        {others.map((c) => (
          <EntryTile
            key={c.id}
            size={size}
            title={c.name}
            params={{ category_id: c.id }}
            note={(n) => `${n} ${plural(n, "товар", "товара", "товаров")}`}
            image={c.image_url}
            onPress={() => openCategory(tree ?? [], c)}
          />
        ))}
      </View>
    </LinearGradient>
  );
}

/** «Хиты продаж»: the most bought lately, with how many times; before any sales, «Популярное». */
export function Hits() {
  const { data } = useApi<Page<ProductListItem>>("/products", { sort: "popular", page_size: 12 });
  if (!data || data.total === 0) return null;
  const sales = data.items.some((p) => (p.sold ?? 0) > 0);
  const title = sales ? "Хиты продаж" : "Популярное";
  return (
    <Section
      title={title}
      hint={sales ? "Что чаще всего покупают у нас" : undefined}
      more={() => openCollection(title, { sort: "popular" })}
    >
      <Rail
        items={data.items}
        card={(p) => (
          <ProductCard
            product={p}
            width={RAIL_CARD}
            compact
            note={(p.sold ?? 0) >= 3 ? `Купили ${p.sold} раз` : undefined}
          />
        )}
      />
    </Section>
  );
}

/** «Тестеры»: the same perfume cheaper, the tester's price next to the bottle's. A velvet band. */
export function Testers() {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    tester: true,
    sort: "popular",
    page_size: 12,
  });
  if (!data || data.total === 0) return null;
  return (
    <LinearGradient colors={[colors.deep, colors.velvet]} style={styles.band}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Title style={{ color: colors.pearl }}>Тестеры — тот же аромат дешевле</Title>
          <Text style={styles.bandHint}>
            Оригинальный парфюм в простой упаковке: без крышки или коробки
          </Text>
        </View>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => openCollection("Тестеры", { tester: "true" })}
        >
          <Txt style={[styles.more, { color: colors.champagne }]}>Все</Txt>
        </Pressable>
      </View>
      <Rail
        items={data.items}
        card={(p) => <ProductCard product={p} width={RAIL_CARD} compact tester dark />}
      />
    </LinearGradient>
  );
}

/**
 * «Выбор Kyko»: the products the shop recommends, marked in the admin panel (the latest marked
 * first), as on the website. No block while none are.
 */
export function Choice() {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    is_new: true,
    sort: "new",
    page_size: 12,
  });
  if (!data?.items.length) return null;
  return (
    <Section
      title="Выбор Kyko"
      hint="Что мы советуем сами"
      more={() => openCollection("Выбор Kyko", { is_new: "true", sort: "new" })}
    >
      <Rail items={data.items} />
    </Section>
  );
}

const BUDGETS: { label: string; value: string; params: Params; dark?: boolean }[] = [
  { label: "до", value: "30 000 ₸", params: { max_price: 30000 } },
  { label: "до", value: "60 000 ₸", params: { max_price: 60000 } },
  { label: "до", value: "100 000 ₸", params: { max_price: 100000 } },
  { label: "от", value: "100 000 ₸", params: { min_price: 100000 }, dark: true },
];

function BudgetTile({ label, value, params, dark }: (typeof BUDGETS)[number]) {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    ...params,
    sort: "popular",
    page_size: 1,
  } as ProductFilters & Params);
  if (!data) return <View style={[styles.budget, styles.placeholder]} />;
  if (data.total === 0) return null;
  const image = assetUrl(data.items[0]?.image_url);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label} ${value}`}
      onPress={() => openCollection(`${label} ${value}`, params)}
      style={({ pressed }) => [
        styles.budget,
        dark && { backgroundColor: colors.velvet },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Eyebrow style={dark && { color: colors.onVelvetMuted }}>{label}</Eyebrow>
      <Text style={[styles.budgetValue, dark && { color: colors.white }]}>{value}</Text>
      <Text style={[styles.budgetCount, dark && { color: colors.champagne }]}>
        {data.total} {plural(data.total, "аромат", "аромата", "ароматов")} →
      </Text>
      {image && (
        <View style={[styles.budgetPic, dark && styles.budgetPicDark]}>
          <Image source={image} style={StyleSheet.absoluteFill} contentFit="contain" />
        </View>
      )}
    </Pressable>
  );
}

/** «Подарок по бюджету»: the catalog up to a price, and the premium shelf. */
export function Budget() {
  return (
    <Section title="Подарок по бюджету">
      <View style={styles.grid2}>
        {BUDGETS.map((b) => (
          <BudgetTile key={b.label + b.value} {...b} />
        ))}
      </View>
    </Section>
  );
}

/** Advice where people hesitate: the shop answers in WhatsApp, where orders are agreed too. */
export function Consult() {
  const telegram = CONTACTS.find((c) => c.kind === "telegram");
  return (
    <View style={styles.consult}>
      <Pearl size={56} style={styles.consultPearl} />
      <Eyebrow style={{ color: colors.onVelvetMuted }}>Консультация</Eyebrow>
      <Title style={{ color: colors.white, marginTop: 8, marginRight: 64 }}>
        Не знаете, что выбрать?
      </Title>
      <Txt style={{ color: colors.onVelvetMuted, marginTop: 10, lineHeight: 22 }}>
        Расскажите, какие ароматы нравятся и для кого подарок, — подберём несколько вариантов и
        пришлём фото и цены. Бесплатно.
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            void Linking.openURL(whatsappAbout("Здравствуйте! Помогите подобрать аромат"))
          }
          style={({ pressed }) => [styles.wa, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="logo-whatsapp" size={18} color={colors.velvet} />
          <Text style={[styles.actionText, { color: colors.velvet }]}>Подобрать в WhatsApp</Text>
        </Pressable>
        {telegram && (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(telegram.href)}
            style={({ pressed }) => [styles.tg, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="paper-plane-outline" size={17} color={colors.white} />
            <Text style={[styles.actionText, { color: colors.white }]}>Telegram</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** «Вы смотрели»: the products this phone opened, the latest first, at today's prices. */
export function Recent() {
  const ids = useRecentlyViewed();
  const { data } = useApi<Page<ProductListItem>>(ids.length ? "/products" : null, {
    id: ids,
    page_size: ids.length || 1,
  });
  if (!data || data.items.length === 0) return null;
  const items = ids
    .map((id) => data.items.find((p) => p.id === id))
    .filter((p): p is ProductListItem => !!p);
  return (
    <Section title="Вы смотрели">
      <Rail items={items} />
    </Section>
  );
}

/** The top houses (`is_top`, ticked in «Бренды») in one short line; the biggest when none are. */
export function BrandsLine({ brands }: { brands: Brand[] }) {
  const top = brands.filter((b) => b.is_top);
  const shown = (top.length ? top : brands)
    .slice()
    .sort((a, b) => b.product_count - a.product_count)
    .slice(0, 20);
  if (shown.length === 0) return null;
  return (
    <View style={styles.brandsLine}>
      <Title style={{ fontSize: 22, paddingLeft: 16 }}>Бренды</Title>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 10 }}
      >
        {shown.map((b) => (
          <Pressable
            key={b.id}
            accessibilityRole="link"
            accessibilityLabel={b.name}
            onPress={() => openCollection(b.name, { brand_id: b.id })}
            style={styles.brandChip}
          >
            <Text style={styles.brandName}>{b.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        onPress={() => router.push("/brands" as Href)}
        // Room between the line's last chip, cut at the edge, and the link.
        style={{ paddingLeft: 10, paddingRight: 16 }}
      >
        <Txt style={styles.more}>Все</Txt>
      </Pressable>
    </View>
  );
}

/**
 * For shops and resellers, at the bottom: wholesale prices come with the wholesale status. Guests
 * go to registration, retail customers straight to the request; wholesale customers don't see it.
 */
export function Wholesale() {
  const { user } = useAuth();
  if (user && user.role !== "retail") return null;
  return (
    <View style={styles.wholesale}>
      <Eyebrow>Для бизнеса</Eyebrow>
      <Title style={{ marginTop: 8 }}>Для магазинов и салонов</Title>
      <Muted style={{ fontSize: 14, marginTop: 6 }}>
        Оптовые цены — после регистрации и одобрения заявки
      </Muted>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          router.push(
            user ? "/wholesale" : { pathname: "/register", params: { next: "/wholesale" } },
          )
        }
        style={({ pressed }) => [styles.inkButton, pressed && { opacity: 0.85 }]}
      >
        <Text style={[styles.actionText, { color: colors.white }]}>Стать оптовым клиентом</Text>
      </Pressable>
    </View>
  );
}

const TILE_GAP = 8;
/** The width of a card in the home page's sideways rows. */
const RAIL_CARD = 150;

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.goldSoft },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  // «Все»: a small uppercase link, underlined like a printed reference.
  more: {
    ...type.label,
    color: colors.gold,
    textDecorationLine: "underline",
    paddingBottom: 4,
  },
  trust: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  trustIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  // «С чего начнём?»: a velvet panel with white tiles on it.
  start: {
    marginHorizontal: 16,
    marginTop: space.xxl,
    padding: 14,
    paddingTop: 18,
    borderRadius: radius.lg,
  },
  startHead: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  entry: {
    borderRadius: radius.md,
    backgroundColor: colors.white,
    padding: 10,
    overflow: "hidden",
  },
  entryTitle: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 20, color: colors.ink },
  entryNote: { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginTop: 2 },
  entryPic: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "58%",
    height: "52%",
    mixBlendMode: "multiply",
  },
  band: { marginTop: space.xxl, paddingVertical: 24 },
  bandHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.onVelvetMuted,
    marginTop: 4,
  },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP, paddingHorizontal: 16 },
  budget: {
    width: "48.5%",
    minHeight: 116,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: 14,
    overflow: "hidden",
  },
  budgetValue: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, lineHeight: 32 },
  budgetCount: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.gold, marginTop: 4 },
  budgetPic: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 64,
    height: 64,
    mixBlendMode: "multiply",
  },
  budgetPicDark: {
    mixBlendMode: "normal",
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    right: 0,
    bottom: 0,
    width: 56,
    height: 56,
    overflow: "hidden",
  },
  // Advice: cherry with the brand's pearl.
  consult: {
    marginHorizontal: 16,
    marginTop: space.xxl,
    padding: 22,
    borderRadius: radius.lg,
    backgroundColor: colors.velvet,
    overflow: "hidden",
  },
  consultPearl: { position: "absolute", top: 22, right: 22 },
  actionText: { ...type.label, fontSize: 11, letterSpacing: 1.2 },
  wa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.pearl,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    minHeight: 46,
  },
  tg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    minHeight: 46,
  },
  brandsLine: { flexDirection: "row", alignItems: "center", marginTop: space.xxl },
  brandChip: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  brandName: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
  wholesale: {
    marginHorizontal: 16,
    marginTop: space.xxl,
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  inkButton: {
    alignSelf: "flex-start",
    marginTop: 16,
    backgroundColor: colors.velvet,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    minHeight: 46,
    justifyContent: "center",
  },
});
