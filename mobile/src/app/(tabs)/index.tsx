import Ionicons from "@expo/vector-icons/Ionicons";
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductCard } from "@/components/product";
import { CurrencySwitch, PromotionRail } from "@/components/shop";
import { Chip, Eyebrow, Loader, Muted, Notice, Title, Txt } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { CONTACTS } from "@/lib/contacts";
import { useApi } from "@/lib/queries";
import type { Brand, Page, ProductListItem, PromotionPublic } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const promotions = useApi<PromotionPublic[]>("/promotions");
  const sale = useApi<Page<ProductListItem>>("/products", { on_sale: true, page_size: 12 });
  const marked = useApi<Page<ProductListItem>>("/products", {
    is_new: true,
    sort: "new",
    page_size: 12,
  });
  // While nothing is marked «Новинка», the latest added products (as on the website).
  const noneMarked = marked.data?.total === 0;
  const latest = useApi<Page<ProductListItem>>(noneMarked ? "/products" : null, {
    sort: "new",
    page_size: 12,
  });
  const brands = useApi<Brand[]>("/brands");
  const fresh = noneMarked ? latest : marked;

  const refreshing = promotions.isRefetching || fresh.isRefetching;
  const refresh = () => {
    void promotions.refetch();
    void sale.refetch();
    void marked.refetch();
    if (noneMarked) void latest.refetch();
    void brands.refetch();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.cream }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />
      }
    >
      <View style={styles.header}>
        <Txt style={styles.logo} accessibilityRole="header">
          Kyko <Txt style={[styles.logo, { color: colors.gold }]}>Parfums</Txt>
        </Txt>
        <CurrencySwitch />
      </View>

      <Pressable
        accessibilityRole="search"
        onPress={() => router.navigate("/catalog")}
        style={styles.search}
      >
        <Ionicons name="search" size={18} color={colors.muted} />
        <Muted>Поиск по аромату или бренду</Muted>
      </Pressable>

      {!!promotions.data?.length && (
        <View style={{ marginTop: 12 }}>
          <PromotionRail promotions={promotions.data} />
        </View>
      )}

      <WholesaleStrip />

      {!!sale.data?.total && (
        <Section
          title="Акции"
          more={{ pathname: "/collection", params: { on_sale: "true", title: "Акции" } }}
          moreLabel="Все акции"
        >
          <ProductRail items={sale.data.items} />
        </Section>
      )}

      <Section
        title="Новые поступления"
        more={
          noneMarked
            ? { pathname: "/collection", params: { sort: "new", title: "Новые поступления" } }
            : { pathname: "/collection", params: { is_new: "true", sort: "new", title: "Новинки" } }
        }
        moreLabel={noneMarked ? "Все товары" : "Все новинки"}
      >
        {fresh.error ? (
          <Notice tone="error" style={{ marginHorizontal: 16 }}>
            {`Не удалось загрузить товары: ${fresh.error.message}`}
          </Notice>
        ) : fresh.data ? (
          <ProductRail items={fresh.data.items} />
        ) : (
          <Loader />
        )}
      </Section>

      {!!brands.data?.length && (
        <Section title="Бренды" more="/brands" moreLabel="Все бренды">
          <View style={styles.brands}>
            {brands.data.slice(0, 16).map((b) => (
              <Chip
                key={b.id}
                label={`${b.name} · ${b.product_count}`}
                onPress={() =>
                  router.push({
                    pathname: "/collection",
                    params: { brand_id: b.id, title: b.name },
                  })
                }
              />
            ))}
          </View>
        </Section>
      )}

      <View style={styles.contacts}>
        <Eyebrow>Вопросы по аромату или заказу</Eyebrow>
        <Title style={{ fontSize: 24, marginTop: 4 }}>Напишите нам</Title>
        <View style={{ gap: 8, marginTop: 12 }}>
          {CONTACTS.map((c) => (
            <Pressable
              key={c.kind}
              accessibilityRole="link"
              onPress={() => Linking.openURL(c.href)}
              style={({ pressed }) => [styles.contact, pressed && { opacity: 0.7 }]}
            >
              <Ionicons
                name={
                  c.kind === "whatsapp"
                    ? "logo-whatsapp"
                    : c.kind === "telegram"
                      ? "paper-plane-outline"
                      : "logo-instagram"
                }
                size={20}
                color={colors.gold}
              />
              <Txt style={{ fontFamily: fonts.sansSemi }}>{c.title}</Txt>
              <Muted style={{ marginLeft: "auto" }}>{c.label}</Muted>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  more,
  moreLabel,
  children,
}: {
  title: string;
  more: Href;
  moreLabel: string;
  children: ReactNode;
}) {
  return (
    <View style={{ marginTop: 28 }}>
      <View style={styles.sectionHead}>
        <Title style={{ fontSize: 26 }}>{title}</Title>
        <Pressable accessibilityRole="link" onPress={() => router.push(more)} hitSlop={8}>
          <Txt style={styles.more}>{moreLabel} →</Txt>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function ProductRail({ items }: { items: ProductListItem[] }) {
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(p) => String(p.id)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      renderItem={({ item }) => <ProductCard product={item} width={172} />}
    />
  );
}

/**
 * One line for shops and resellers: wholesale prices come with the wholesale status. Guests go to
 * registration, retail customers straight to the request; wholesale customers don't see it.
 */
function WholesaleStrip() {
  const { user } = useAuth();
  if (user && user.role !== "retail") return null;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() =>
        router.push(user ? "/wholesale" : { pathname: "/register", params: { next: "/wholesale" } })
      }
      style={({ pressed }) => [styles.strip, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1 }}>
        <Txt style={{ color: colors.white, fontFamily: fonts.serifBold, fontSize: 20 }}>
          Для магазинов и салонов
        </Txt>
        <Txt style={{ color: "#d6d3d1", fontSize: 13, marginTop: 2 }}>
          Оптовые цены для бизнеса — оставьте заявку
        </Txt>
      </View>
      <Ionicons name="arrow-forward" size={20} color={colors.gold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  logo: { fontFamily: fonts.serifBold, fontSize: 30, lineHeight: 36 },
  search: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    height: 46,
  },
  strip: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  more: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.gold },
  brands: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  contacts: {
    marginHorizontal: 16,
    marginTop: 32,
    padding: 16,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.lg,
  },
  contact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
