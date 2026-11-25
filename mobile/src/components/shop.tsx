import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { OFFER_URL, PRIVACY_URL, assetUrl } from "@/lib/config";
import { useCurrency } from "@/lib/currency";
import {
  dayMonth,
  formatPhone,
  percentOff,
  plural,
  ROLE_LABELS,
  STATUS_LABELS,
  tenge,
  volumeLabel,
} from "@/lib/format";
import type { OrderStatus, PromotionPublic, Quote, User } from "@/lib/types";
import { colors, fonts, radius, statusColors } from "@/theme";
import { Button, Field, Muted, Notice, Txt } from "./ui";

// ---------- Cart ----------

/**
 * The cart's bag with how many items are in it, to go to the cart from a product: in the
 * product screen's header and next to «В корзину» once something is added.
 */
export function CartButton({ boxed = false }: { boxed?: boolean }) {
  const { count } = useCart();
  return (
    <Pressable
      testID={boxed ? "product-cart-box" : "product-cart"}
      accessibilityRole="link"
      accessibilityLabel={count ? `Корзина, товаров: ${count}` : "Корзина"}
      hitSlop={8}
      onPress={() => router.navigate("/cart")}
      style={({ pressed }) => [
        boxed ? styles.cartBox : styles.cartIcon,
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons name={count ? "bag" : "bag-outline"} size={22} color={colors.ink} />
      {count > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{count > 99 ? "99+" : count}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------- Promotions ----------

/** Cards in view: two and a bit on phones, three on tablets, four on wide screens (as the site). */
function railShare(width: number): number {
  if (width >= 768) return 0.25;
  if (width >= 640) return 0.31;
  return 0.44;
}

/**
 * The promotions running today as a sideways row of 3:2 cards at the top of the home page, like
 * the website (one 1200×800 picture fills a card). Each opens its products in the catalog.
 */
export function PromotionRail({ promotions }: { promotions: PromotionPublic[] }) {
  const { width } = useWindowDimensions();
  const inner = Math.min(width, 1100) - 32;
  const gap = 12;
  const share = railShare(width);
  const cardWidth = Math.floor(share === 0.25 ? (inner - 3 * gap) / 4 : inner * share);
  return (
    <FlatList
      data={promotions}
      horizontal
      accessibilityLabel="Баннеры акций"
      keyExtractor={(p) => String(p.id)}
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + gap}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: 16, gap }}
      renderItem={({ item }) => <PromotionCard promotion={item} width={cardWidth} />}
    />
  );
}

/**
 * One card, 3:2. A finished banner (its text is on the picture) is shown whole, with a blurred
 * copy of itself around a picture of other proportions. Otherwise the picture fills the card and
 * the app writes the discount, the end date and the title over it (or over a dark background).
 */
function PromotionCard({ promotion: p, width }: { promotion: PromotionPublic; width: number }) {
  const src = assetUrl(p.image_url);
  const open = () =>
    router.push({ pathname: "/collection", params: { promotion_id: p.id, title: p.title } });
  const whole = p.image_only && !!src;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={p.title}
      testID={`promotion-card-${p.id}`}
      onPress={open}
      style={({ pressed }) => [
        styles.card,
        { width, height: Math.round((width * 2) / 3) },
        pressed && { opacity: 0.85 },
      ]}
    >
      {whole ? (
        <>
          <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={24} />
          <Image source={src} style={StyleSheet.absoluteFill} contentFit="contain" />
        </>
      ) : (
        <>
          {src && <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" />}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.75)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardText}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {p.discount_percent !== null && (
                <View style={styles.cardBadge}>
                  <Text style={styles.cardBadgeText}>{percentOff(p.discount_percent)}</Text>
                </View>
              )}
              {p.ends_on && <Text style={styles.cardDates}>до {dayMonth(p.ends_on)}</Text>}
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {p.title}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

// ---------- Cart ----------

const TIER_NAMES = { retail: "розничной", wholesale: "оптовой", bulk: "крупнооптовой" } as const;

/** Tells a wholesale customer what is missing to unlock a better price tier. */
export function QuoteHints({ quote }: { quote: Quote }) {
  const { money } = useCurrency();
  if (quote.hints.length === 0) return null;
  const names = new Map(
    quote.lines.map((l) => [
      l.variant_id,
      `${l.product_name}, ${volumeLabel(l.volume_ml, l.is_tester)}`,
    ]),
  );
  return (
    <Notice tone="warn">
      <View style={{ gap: 6 }}>
        {quote.hints.map((h, i) => (
          <Txt key={i} style={{ fontSize: 14, color: "#78350f" }}>
            {h.missing_amount !== null ? (
              <>
                Добавьте товаров ещё на <Txt style={styles.bold}>{money(h.missing_amount)}</Txt>,
                чтобы весь заказ был пересчитан по {TIER_NAMES[h.tier]} цене.
              </>
            ) : (
              <>
                {names.get(h.variant_id ?? 0)}: ещё <Txt style={styles.bold}>{h.missing_qty}</Txt>{" "}
                {plural(h.missing_qty ?? 0, "штука", "штуки", "штук")} — и позиция пойдёт по{" "}
                {TIER_NAMES[h.tier]} цене.
              </>
            )}
          </Txt>
        ))}
      </View>
    </Notice>
  );
}

/** In dollars: what is charged is tenge, and at which rate the dollars were counted. */
export function TengeNote({ total }: { total: number | null | undefined }) {
  const { currency, rate } = useCurrency();
  if (currency !== "USD" || !rate || total === null || total === undefined) return null;
  return (
    <Muted style={{ fontSize: 12, marginTop: 6 }}>
      Оплата в тенге: <Txt style={[styles.bold, { fontSize: 12 }]}>{tenge(total)}</Txt> · курс 1 $ ={" "}
      {Number(rate.toFixed(2))} ₸
    </Muted>
  );
}

// ---------- Currency ----------

/** ₸ / $. Hidden while the shop has no dollar rate. */
export function CurrencySwitch() {
  const { currency, rate, setCurrency } = useCurrency();
  if (!rate) return null;
  return (
    <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel="Валюта">
      {(["KZT", "USD"] as const).map((c) => (
        <Pressable
          key={c}
          accessibilityRole="radio"
          accessibilityState={{ checked: currency === c }}
          accessibilityLabel={c === "KZT" ? "Цены в тенге" : "Цены в долларах"}
          onPress={() => setCurrency(c)}
          style={[styles.switchItem, currency === c && styles.switchActive]}
        >
          <Text style={[styles.switchText, currency === c && { color: colors.white }]}>
            {c === "KZT" ? "₸" : "$"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- Orders ----------

export function StatusBadge({ status }: { status: OrderStatus }) {
  const c = statusColors[status];
  return (
    <View style={[styles.status, { backgroundColor: c.bg, borderColor: c.line }]}>
      <Text style={[styles.statusText, { color: c.fg }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

// ---------- Wholesale ----------

/** "Ask for the next price level": retail -> wholesale, wholesale -> bulk (as on the website). */
export function UpgradeForm({ onDone }: { onDone?: (user: User) => void }) {
  const { user, setUser } = useAuth();
  const [company, setCompany] = useState(user?.company_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const target =
    user.role === "retail" ? "wholesale" : user.role === "wholesale" ? "bulk_wholesale" : null;
  if (!target) {
    return <Notice tone="success">У вас уже максимальный уровень цен.</Notice>;
  }
  if (user.wholesale_requested) {
    return (
      <Notice tone="success">
        {`Заявка на «${ROLE_LABELS[user.requested_role ?? target]}» отправлена. Менеджер свяжется с вами; новые цены появятся автоматически.`}
      </Notice>
    );
  }

  const needsCompany = target === "wholesale";
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<User>("/me/upgrade-request", {
        body: {
          company_name: company.trim() || null,
          phone: phone.trim() || null,
          note: note.trim() || null,
        },
      });
      setUser(updated);
      onDone?.(updated);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      {needsCompany && (
        <>
          <Field
            label="Компания / ИП"
            value={company}
            onChangeText={setCompany}
            autoCapitalize="words"
          />
          <Field
            label="Телефон для связи"
            value={phone}
            onChangeText={(t) => setPhone(formatPhone(t))}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="+7 ___ ___ __ __"
          />
        </>
      )}
      <Field
        label={
          needsCompany
            ? "Комментарий (необязательно)"
            : "Объём закупок, комментарий (необязательно)"
        }
        placeholder={
          needsCompany ? "Магазин, салон, маркетплейс…" : "Например: 200 флаконов в месяц"
        }
        value={note}
        onChangeText={setNote}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        kind="gold"
        title={needsCompany ? "Запросить оптовые цены" : "Запросить крупный опт"}
        loading={busy}
        disabled={needsCompany && (!company.trim() || !phone.trim())}
        onPress={submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cartIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  cartBox: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { fontFamily: fonts.sansBold, fontSize: 10, color: colors.white },
  bold: { fontFamily: fonts.sansBold },
  card: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.ink },
  cardText: { position: "absolute", left: 10, right: 10, bottom: 10, gap: 4 },
  cardBadge: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  cardBadgeText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white },
  cardDates: { fontFamily: fonts.sansMedium, fontSize: 11, color: "#e7e5e4" },
  cardTitle: { fontFamily: fonts.serifBold, fontSize: 15, lineHeight: 17, color: colors.white },
  switch: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    padding: 2,
  },
  switchItem: {
    width: 34,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  switchActive: { backgroundColor: colors.ink },
  switchText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.muted },
  status: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  statusText: { fontFamily: fonts.sansBold, fontSize: 12 },
  consent: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
});

// ---------- Consent ----------

/**
 * The box a form can't be sent without, as on the website (components/Consent.tsx): consent to
 * the processing of personal data (the Law of Kazakhstan «О персональных данных и их защите»),
 * and on checkout the public offer too. The documents open on the website.
 */
export function Consent({
  checked,
  onChange,
  offer = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  offer?: boolean;
}) {
  const doc = (url: string, text: string) => (
    <Txt
      accessibilityRole="link"
      onPress={() => Linking.openURL(url)}
      style={{ fontSize: 13, color: colors.gold, fontFamily: fonts.sansSemi }}
    >
      {text}
    </Txt>
  );
  return (
    <Pressable
      testID="consent"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.consent}
    >
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={22}
        color={checked ? colors.ink : colors.muted}
      />
      <Txt style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>
        {offer ? <>Принимаю условия {doc(OFFER_URL, "публичной оферты")} и даю </> : <>Даю </>}
        согласие на обработку моих персональных данных в соответствии с{" "}
        {doc(PRIVACY_URL, "политикой конфиденциальности")}
      </Txt>
    </Pressable>
  );
}
