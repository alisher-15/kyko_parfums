import { router } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { UpgradeForm } from "@/components/shop";
import { Button, Card, Eyebrow, Muted, Title, Txt } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/queries";
import type { PricingRules } from "@/lib/types";
import { fonts } from "@/theme";

/** The request for the next price level: retail -> wholesale, wholesale -> bulk. */
export default function WholesaleScreen() {
  const { user } = useAuth();
  const { data: rules } = useApi<PricingRules>("/pricing/rules");

  if (!user) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Intro />
        <Button
          title="Зарегистрироваться"
          onPress={() => router.replace({ pathname: "/register", params: { next: "/wholesale" } })}
        />
        <Button
          kind="outline"
          title="У меня есть аккаунт"
          onPress={() => router.replace({ pathname: "/login", params: { next: "/wholesale" } })}
        />
      </ScrollView>
    );
  }

  const bulk = user.role === "wholesale";
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {bulk ? (
          <View style={{ gap: 6 }}>
            <Eyebrow>Крупный опт</Eyebrow>
            <Title>Ещё ниже цены для больших закупок</Title>
            <Muted>
              {rules?.next_tier_terms || "Условия перехода на крупный опт уточнит менеджер."}
            </Muted>
          </View>
        ) : (
          <Intro />
        )}
        <Card>
          <UpgradeForm />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Intro() {
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow>Для магазинов и салонов</Eyebrow>
      <Title>Оптовые цены для бизнеса</Title>
      <Muted>
        Оставьте данные компании — после проверки менеджер присвоит оптовый статус, и цены в
        каталоге и корзине обновятся сами.
      </Muted>
      <View style={{ gap: 4, marginTop: 4 }}>
        {[
          "Оптовые цены на весь каталог",
          "Крупный опт — ещё ниже, для больших закупок",
          "Заказы, статусы и история в приложении",
        ].map((t) => (
          <Txt key={t} style={{ fontSize: 14 }}>
            <Txt style={{ fontFamily: fonts.sansBold }}>· </Txt>
            {t}
          </Txt>
        ))}
      </View>
    </View>
  );
}
