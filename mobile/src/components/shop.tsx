import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { assetUrl } from "@/lib/config";
import { useCurrency } from "@/lib/currency";
import {
  ROLE_LABELS,
  STATUS_LABELS,
  dayMonth,
  percentOff,
  plural,
  tenge,
  volumeLabel,
} from "@/lib/format";
import type { OrderStatus, PromotionPublic, Quote, User } from "@/lib/types";
import { colors, fonts, radius, statusColors } from "@/theme";
import { Button, Field, Muted, Notice, Txt } from "./ui";

// ---------- Promotions ----------

/**
 * Banners of the running promotions, 8:3 like on the website (one 2400×900 picture fits every
 * screen). A finished banner (image_only) is shown whole; otherwise the app writes the discount,
 * the dates and the title over the picture. They turn by themselves every 5 seconds.
 */
export function PromotionCarousel({ promotions }: { promotions: PromotionPublic[] }) {
  const { width } = useWindowDimensions();
  const slideWidth = Math.min(width, 720) - 32;
  const height = Math.round((slideWidth * 3) / 8);
  const list = useRef<FlatList<PromotionPublic>>(null);
  const [index, setIndex] = useState(0);
  const touched = useRef(false);

  useEffect(() => {
    if (promotions.length < 2) return;
    const timer = setInterval(() => {
      if (touched.current) return;
      setIndex((i) => {
        const next = (i + 1) % promotions.length;
        list.current?.scrollToOffset({ offset: next * (slideWidth + 12), animated: true });
        return next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [promotions.length, slideWidth]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (slideWidth + 12));
    if (i !== index && i >= 0 && i < promotions.length) setIndex(i);
  };

  return (
    <View>
      <FlatList
        ref={list}
        data={promotions}
        horizontal
        keyExtractor={(p) => String(p.id)}
        showsHorizontalScrollIndicator={false}
        snapToInterval={slideWidth + 12}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onScrollBeginDrag={() => (touched.current = true)}
        renderItem={({ item }) => (
          <PromotionSlide promotion={item} width={slideWidth} height={height} />
        )}
      />
      {promotions.length > 1 && (
        <View style={styles.dots} accessibilityElementsHidden>
          {promotions.map((p, i) => (
            <View key={p.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

function PromotionSlide({
  promotion: p,
  width,
  height,
}: {
  promotion: PromotionPublic;
  width: number;
  height: number;
}) {
  const src = assetUrl(p.image_url);
  const open = () =>
    router.push({ pathname: "/collection", params: { promotion_id: p.id, title: p.title } });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={p.title}
      onPress={open}
      style={[styles.slide, { width, height }]}
    >
      {src && (
        <Image
          source={src}
          style={StyleSheet.absoluteFill}
          contentFit={p.image_only ? "contain" : "cover"}
        />
      )}
      {!p.image_only && (
        <>
          <View style={styles.slideShade} />
          <View style={styles.slideText}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              {p.discount_percent !== null && (
                <View style={styles.slideBadge}>
                  <Text style={styles.slideBadgeText}>{percentOff(p.discount_percent)}</Text>
                </View>
              )}
              {p.ends_on && <Text style={styles.slideDates}>до {dayMonth(p.ends_on)}</Text>}
            </View>
            <Text style={styles.slideTitle} numberOfLines={2}>
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
            onChangeText={setPhone}
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
  bold: { fontFamily: fonts.sansBold },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { width: 18, backgroundColor: colors.gold },
  slide: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.ink },
  slideShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.38)" },
  slideText: { position: "absolute", left: 14, right: 14, bottom: 12, gap: 4 },
  slideBadge: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  slideBadgeText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.white },
  slideDates: { fontFamily: fonts.sansMedium, fontSize: 12, color: "#e7e5e4" },
  slideTitle: { fontFamily: fonts.serifBold, fontSize: 24, lineHeight: 26, color: colors.white },
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
});
