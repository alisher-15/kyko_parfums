import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { childrenOf, useCategories } from "@/lib/categories";
import { assetUrl } from "@/lib/config";
import { CONTACTS, WHATSAPP, whatsappAbout } from "@/lib/contacts";
import { plural } from "@/lib/format";
import { useApi, type ProductFilters } from "@/lib/queries";
import { useRecentlyViewed } from "@/lib/recent";
import type { Brand, Page, ProductListItem } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";
import { ProductCard } from "./product";
import { Muted, Title, Txt } from "./ui";

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
    <View style={{ marginTop: 26 }}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Title style={{ fontSize: 22 }}>{title}</Title>
          {!!hint && <Muted style={{ fontSize: 12, marginTop: 1 }}>{hint}</Muted>}
        </View>
        {more && (
          <Pressable accessibilityRole="link" onPress={more} hitSlop={8}>
            <Txt style={styles.more}>{moreLabel} →</Txt>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function Rail({
  items,
  card = (p) => <ProductCard product={p} width={128} compact />,
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
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
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
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      style={{ marginTop: 12 }}
    >
      {TRUST.map((t) => (
        <Pressable
          key={t.title}
          disabled={!t.href}
          accessibilityRole={t.href ? "link" : undefined}
          onPress={() => t.href && void Linking.openURL(t.href)}
          style={styles.trust}
        >
          <Ionicons name={t.icon} size={22} color={colors.gold} />
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
 * A way into the catalog with its count and a photo of its most popular product (a query of one
 * product, sorted by sales). Hidden while it has no products.
 */
function EntryTile({
  title,
  params,
  note,
  dark = false,
}: {
  title: string;
  params: Params;
  note?: (total: number) => string;
  dark?: boolean;
}) {
  const { data } = useApi<Page<ProductListItem>>("/products", {
    ...params,
    sort: "popular",
    page_size: 1,
  } as ProductFilters & Params);
  if (!data || data.total === 0) return null;
  const image = assetUrl(data.items[0]?.image_url);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={() => openCollection(title, params)}
      style={({ pressed }) => [
        styles.entry,
        dark && { backgroundColor: colors.ink },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Txt style={[styles.entryTitle, dark && { color: colors.white }]}>{title}</Txt>
      <Text style={[styles.entryNote, dark && { color: "#d6d3d1" }]}>
        {note
          ? note(data.total)
          : `${data.total} ${plural(data.total, "аромат", "аромата", "ароматов")}`}
      </Text>
      {image && (
        <View style={[styles.entryPic, dark && styles.entryPicDark]}>
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
 * (sets, make-up…) as they appear. Three in a row.
 */
export function StartGrid() {
  const tree = useCategories().data;
  const sections = tree ? childrenOf(tree, null) : [];
  const perfume = sections.find((c) => c.kind === "perfume");
  const others = sections.filter((c) => c !== perfume);
  return (
    <Section
      title="С чего начнём?"
      more={() => router.push("/categories")}
      moreLabel="Все категории"
    >
      <View style={styles.grid}>
        <EntryTile title="Для неё" params={{ gender: "female" }} />
        <EntryTile title="Для него" params={{ gender: "male" }} />
        <EntryTile title="Унисекс" params={{ gender: "unisex" }} />
        <EntryTile
          title="Тестеры"
          params={{ tester: "true" }}
          note={() => "дешевле флакона"}
          dark
        />
        <EntryTile title="Ниша и люкс" params={{ top: "true" }} />
        {others.map((c) => (
          <EntryTile
            key={c.id}
            title={c.name}
            params={{ category_id: c.id }}
            note={(n) => `${n} ${plural(n, "товар", "товара", "товаров")}`}
          />
        ))}
      </View>
    </Section>
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
            width={128}
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
    <View style={styles.band}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Title style={{ fontSize: 22, color: colors.white }}>
            Тестеры — тот же аромат дешевле
          </Title>
          <Text style={{ color: "#d6d3d1", fontSize: 12, fontFamily: fonts.sans, marginTop: 2 }}>
            Оригинальный парфюм в простой упаковке: без крышки или коробки
          </Text>
        </View>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => openCollection("Тестеры", { tester: "true" })}
        >
          <Txt style={[styles.more, { color: "#e9dccb" }]}>Все →</Txt>
        </Pressable>
      </View>
      <Rail
        items={data.items}
        card={(p) => <ProductCard product={p} width={128} compact tester />}
      />
    </View>
  );
}

/** «Выбор Kyko»: the products marked in the admin panel; while none are, the latest added. */
export function Choice() {
  const marked = useApi<Page<ProductListItem>>("/products", {
    is_new: true,
    sort: "new",
    page_size: 12,
  });
  const noneMarked = marked.data?.total === 0;
  const latest = useApi<Page<ProductListItem>>(noneMarked ? "/products" : null, {
    sort: "new",
    page_size: 12,
  });
  const shown = noneMarked ? latest : marked;
  if (!shown.data?.items.length) return null;
  const title = noneMarked ? "Новые поступления" : "Выбор Kyko";
  return (
    <Section
      title={title}
      hint={noneMarked ? undefined : "Что мы советуем сами"}
      more={() =>
        openCollection(title, noneMarked ? { sort: "new" } : { is_new: "true", sort: "new" })
      }
    >
      <Rail items={shown.data.items} />
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
  if (!data || data.total === 0) return null;
  const image = assetUrl(data.items[0]?.image_url);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label} ${value}`}
      onPress={() => openCollection(`${label} ${value}`, params)}
      style={({ pressed }) => [
        styles.budget,
        dark && { backgroundColor: colors.ink, borderColor: colors.ink },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Muted style={[{ fontSize: 11 }, dark && { color: "#d6d3d1" }]}>{label}</Muted>
      <Text style={[styles.budgetValue, dark && { color: colors.white }]}>{value}</Text>
      <Text style={[styles.budgetCount, dark && { color: "#e9dccb" }]}>
        {data.total} {plural(data.total, "аромат", "аромата", "ароматов")} →
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
      <Title style={{ fontSize: 26 }}>Не знаете, что выбрать?</Title>
      <Txt style={{ color: "#57534e", marginTop: 6, lineHeight: 20 }}>
        Расскажите, какие ароматы нравятся и для кого подарок, — подберём несколько вариантов и
        пришлём фото и цены. Бесплатно.
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            void Linking.openURL(whatsappAbout("Здравствуйте! Помогите подобрать аромат"))
          }
          style={({ pressed }) => [styles.wa, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="logo-whatsapp" size={18} color={colors.white} />
          <Txt style={{ color: colors.white, fontFamily: fonts.sansSemi }}>
            Подобрать в WhatsApp
          </Txt>
        </Pressable>
        {telegram && (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(telegram.href)}
            style={({ pressed }) => [styles.tg, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="paper-plane-outline" size={17} color={colors.ink} />
            <Txt style={{ fontFamily: fonts.sansSemi }}>Telegram</Txt>
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
      <Title style={{ fontSize: 18, paddingLeft: 16 }}>Бренды</Title>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 8 }}
      >
        {shown.map((b) => (
          <Pressable
            key={b.id}
            accessibilityRole="link"
            accessibilityLabel={b.name}
            onPress={() => openCollection(b.name, { brand_id: b.id })}
            style={styles.brandChip}
          >
            <Txt style={{ fontSize: 12 }}>{b.name}</Txt>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        onPress={() => router.push("/brands" as Href)}
        style={{ paddingRight: 16 }}
      >
        <Txt style={styles.more}>Все →</Txt>
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
      <Title style={{ fontSize: 22 }}>Для магазинов и салонов</Title>
      <Muted style={{ fontSize: 13, marginTop: 2 }}>
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
        <Txt style={{ color: colors.white, fontFamily: fonts.sansSemi }}>
          Стать оптовым клиентом →
        </Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  more: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.gold },
  trust: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  entry: {
    width: "31.6%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: "#f5f5f4",
    padding: 10,
    overflow: "hidden",
  },
  entryTitle: { fontFamily: fonts.sansSemi, fontSize: 13, lineHeight: 16 },
  entryNote: { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginTop: 1 },
  entryPic: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "70%",
    height: "62%",
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
  band: { backgroundColor: colors.ink, marginTop: 26, paddingVertical: 20 },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  budget: {
    width: "48.5%",
    minHeight: 108,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
    overflow: "hidden",
  },
  budgetValue: { fontFamily: fonts.serifBold, fontSize: 24, color: colors.ink, lineHeight: 28 },
  budgetCount: { fontFamily: fonts.sansSemi, fontSize: 12, color: colors.goldDark, marginTop: 6 },
  budgetPic: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 64,
    height: 64,
    mixBlendMode: "multiply",
  },
  consult: {
    marginHorizontal: 16,
    marginTop: 26,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.goldSoft,
  },
  wa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1f9d55",
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  tg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  brandsLine: { flexDirection: "row", alignItems: "center", marginTop: 26 },
  brandChip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  wholesale: {
    marginHorizontal: 16,
    marginTop: 26,
    padding: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  inkButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
});
