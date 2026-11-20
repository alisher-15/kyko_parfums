import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Consent, QuoteHints, TengeNote } from "@/components/shop";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Loader,
  Muted,
  Notice,
  Title,
  Txt,
} from "@/components/ui";
import { ApiError, api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useCurrency } from "@/lib/currency";
import { volumeLabel } from "@/lib/format";
import { useQuote } from "@/lib/queries";
import type { Order } from "@/lib/types";
import { colors, fonts } from "@/theme";

export default function CheckoutScreen() {
  const { user } = useAuth();
  const { items, clear, ready } = useCart();
  const quote = useQuote(items);
  const { money } = useCurrency();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    contact_name: user?.full_name ?? "",
    contact_phone: user?.phone ?? "",
    // A login like "admin" is not a deliverable address: don't prefill it into the email field.
    contact_email: user?.email.includes("@") ? user.email : "",
    delivery_city: "",
    delivery_address: "",
    comment: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [consent, setConsent] = useState(false);

  if (!user) {
    return (
      <EmptyState
        icon="person-outline"
        title="Войдите, чтобы оформить заказ"
        action={
          <Button
            title="Войти"
            onPress={() => router.replace({ pathname: "/login", params: { next: "/checkout" } })}
          />
        }
      />
    );
  }
  if (!ready) return <Loader />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon="bag-outline"
        title="Корзина пуста"
        action={<Button title="В каталог" onPress={() => router.navigate("/catalog")} />}
      />
    );
  }

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const missing =
    !form.contact_name.trim() ||
    form.contact_phone.trim().length < 3 ||
    !form.delivery_city.trim() ||
    !form.delivery_address.trim();
  const q = quote.data;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const order = await api<Order>("/orders", {
        body: {
          contact_name: form.contact_name.trim(),
          contact_phone: form.contact_phone.trim(),
          contact_email: form.contact_email.trim() || null,
          delivery_city: form.delivery_city.trim(),
          delivery_address: form.delivery_address.trim(),
          comment: form.comment.trim() || null,
          items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
        },
      });
      clear();
      void queryClient.invalidateQueries({ queryKey: ["/orders"] });
      router.dismissAll();
      router.push({ pathname: "/orders/[id]", params: { id: order.id, created: "1" } });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? `${err.message}. Вернитесь в корзину и проверьте количество.`
          : errorText(err),
      );
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Title style={styles.h2}>Контакты</Title>
        <Field
          label="Имя и фамилия"
          value={form.contact_name}
          onChangeText={set("contact_name")}
          autoComplete="name"
          textContentType="name"
        />
        <Field
          label="Телефон"
          value={form.contact_phone}
          onChangeText={set("contact_phone")}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="+7 ___ ___ __ __"
        />
        <Field
          label="Email (необязательно)"
          value={form.contact_email}
          onChangeText={set("contact_email")}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <Title style={[styles.h2, { marginTop: 8 }]}>Доставка</Title>
        <Field
          label="Город"
          value={form.delivery_city}
          onChangeText={set("delivery_city")}
          placeholder="Например, Алматы"
        />
        <Field
          label="Адрес"
          value={form.delivery_address}
          onChangeText={set("delivery_address")}
          placeholder="Улица, дом, квартира / офис"
          autoComplete="street-address"
        />
        <Field
          label="Комментарий к заказу"
          value={form.comment}
          onChangeText={set("comment")}
          multiline
        />

        <Notice>
          Онлайн-оплаты пока нет: после оформления менеджер свяжется с вами, подтвердит наличие и
          срок доставки. Оплата — по факту получения или переводом.
        </Notice>

        {q && <QuoteHints quote={q} />}

        <Card style={{ gap: 8 }}>
          <Title style={{ fontSize: 22 }}>Ваш заказ</Title>
          {q?.lines.map((l) => (
            <View
              key={l.variant_id}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}
            >
              <Txt style={{ flex: 1, fontSize: 14 }}>
                {l.brand_name} {l.product_name}, {volumeLabel(l.volume_ml, l.is_tester)} ×{" "}
                {l.quantity}
              </Txt>
              <Txt style={{ fontSize: 14, fontFamily: fonts.sansSemi }}>{money(l.line_total)}</Txt>
            </View>
          ))}
          {!!q?.savings && q.savings > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt style={{ fontSize: 14, color: colors.ok }}>Выгода</Txt>
              <Txt style={{ fontSize: 14, color: colors.ok }}>−{money(q.savings)}</Txt>
            </View>
          )}
          <View style={styles.total}>
            <Txt style={styles.totalText}>Итого</Txt>
            <Txt style={styles.totalText}>{money(q?.total)}</Txt>
          </View>
          <TengeNote total={q?.total} />
        </Card>

        <Consent offer checked={consent} onChange={setConsent} />
        {error && <Notice tone="error">{error}</Notice>}
        {q && !q.can_checkout && (
          <Notice tone="error">В корзине есть недоступные позиции — исправьте корзину.</Notice>
        )}
        <Button
          testID="place-order"
          title={submitting ? "Оформляем…" : `Подтвердить заказ${q ? ` на ${money(q.total)}` : ""}`}
          loading={submitting}
          disabled={missing || !consent || quote.isFetching || !q?.can_checkout}
          onPress={submit}
        />
        {(missing || !consent) && (
          <Muted style={{ textAlign: "center", fontSize: 13 }}>
            {missing ? "Заполните имя, телефон, город и адрес" : "Отметьте согласие выше"}
          </Muted>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  h2: { fontSize: 24 },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  totalText: { fontFamily: fonts.sansBold, fontSize: 18 },
});
