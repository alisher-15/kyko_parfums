import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { assetUrl } from "@/lib/config";
import { CONTACTS, YOUTUBE, whatsappAbout } from "@/lib/contacts";
import { plural } from "@/lib/format";
import { useApi, type ProductFilters } from "@/lib/queries";
import { useRecentlyViewed } from "@/lib/recent";
import type { Brand, Page, ProductListItem } from "@/lib/types";
import { colors, fonts, radius, space, type } from "@/theme";
import { ProductCard } from "./product";
import { Eyebrow, Muted, Pearl, Title, Txt } from "./ui";

// The home screen's blocks, as on the website (frontend/src/app/home-sections.tsx): trust,
// «С чего начнём?», «Хиты продаж», «Тестеры», «Выбор Kyko», «Подарок по бюджету», advice in
// WhatsApp, «Вы смотрели», the top brands in one line, and wholesale.

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
    <View style={{ marginTop: space.section }}>
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
  href?: string;
}[] = [
  { icon: "shield-checkmark-outline", title: "100% оригинал", href: YOUTUBE },
  { icon: "car-outline", title: "Доставка по Казахстану" },
  {
    icon: "chatbubble-ellipses-outline",
    title: "Подбор в WhatsApp",
    href: whatsappAbout("Здравствуйте! Помогите подобрать аромат"),
  },
];

/**
 * Why buy here, in one quiet line between hairlines: originals (the shop's YouTube), delivery,
 * advice in WhatsApp.
 */
export function TrustRow() {
  return (
    <View style={styles.trustLine}>
      {TRUST.map((t, i) => (
        <Pressable
          key={t.title}
          disabled={!t.href}
          accessibilityRole={t.href ? "link" : undefined}
          onPress={() => t.href && void Linking.openURL(t.href)}
          style={[styles.trust, i > 0 && styles.trustDivider]}
        >
          <Ionicons name={t.icon} size={20} color={colors.gold} />
          <Text style={styles.trustText}>{t.title}</Text>
        </Pressable>
      ))}
    </View>
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

/** «Тестеры»: the same perfume cheaper, the tester's price next to the bottle's. */
export function Testers() {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    tester: true,
    sort: "popular",
    page_size: 12,
  });
  if (!data || data.total === 0) return null;
  return (
    <Section
      title="Тестеры"
      hint="Тот же оригинальный аромат дешевле — в простой упаковке"
      more={() => openCollection("Тестеры", { tester: "true" })}
    >
      <Rail
        items={data.items}
        card={(p) => <ProductCard product={p} width={RAIL_CARD} compact tester />}
      />
    </Section>
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
        {data.total} {plural(data.total, "аромат", "аромата", "ароматов")}
      </Text>
      {image && (
        <View style={[styles.budgetPic, dark && styles.entryPicDark]}>
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
      <View style={styles.sectionHead}>
        <Title style={{ flex: 1 }}>Бренды</Title>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => router.push("/brands" as Href)}
        >
          <Txt style={styles.more}>Все</Txt>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 22, paddingHorizontal: 16 }}
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
        <Text style={[styles.actionText, { color: colors.ink }]}>Стать оптовым клиентом</Text>
      </Pressable>
    </View>
  );
}

const TILE_GAP = 10;
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
    marginBottom: 16,
  },
  // «Все»: a small uppercase link, underlined like a printed reference.
  more: {
    ...type.label,
    color: colors.gold,
    textDecorationLine: "underline",
    paddingBottom: 4,
  },
  trustLine: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  trust: { flex: 1, alignItems: "center", gap: 6, paddingHorizontal: 4 },
  trustDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
  trustText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    lineHeight: 14,
    textAlign: "center",
    color: colors.ink,
  },
  start: { marginHorizontal: 16, marginTop: space.section },
  startHead: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  entry: {
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: 12,
    overflow: "hidden",
  },
  entryTitle: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 21, color: colors.ink },
  entryNote: { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginTop: 3 },
  entryPic: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "58%",
    height: "52%",
    mixBlendMode: "multiply",
  },
  entryPicDark: {
    mixBlendMode: "normal",
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    width: "56%",
    height: "50%",
    overflow: "hidden",
  },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP, paddingHorizontal: 16 },
  budget: {
    width: "48.5%",
    minHeight: 120,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: 14,
    overflow: "hidden",
  },
  budgetValue: { fontFamily: fonts.serif, fontSize: 30, color: colors.ink, lineHeight: 34 },
  budgetCount: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.gold, marginTop: 4 },
  budgetPic: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 64,
    height: 64,
    mixBlendMode: "multiply",
  },
  // The page's one filled block: cherry with the brand's pearl.
  consult: {
    marginHorizontal: 16,
    marginTop: space.section,
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
  brandsLine: { marginTop: space.section },
  brandChip: { paddingVertical: 4 },
  brandName: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  wholesale: {
    marginHorizontal: 16,
    marginTop: space.section,
    paddingTop: space.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  inkButton: {
    alignSelf: "flex-start",
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    minHeight: 46,
    justifyContent: "center",
  },
});
