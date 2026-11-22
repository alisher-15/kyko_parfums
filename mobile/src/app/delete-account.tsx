import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Button, EmptyState, Field, Muted, Notice, Txt } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, fonts } from "@/theme";

const WHAT_HAPPENS = [
  "Email, имя, телефон и название компании удаляются с сервера магазина.",
  "Войти в аккаунт будет нельзя — ни в приложении, ни на сайте.",
  "Заявка на оптовые цены отменяется.",
  "Заказы остаются в учёте магазина: это документы о продажах.",
  "Позже можно зарегистрироваться заново с тем же email — это будет новый аккаунт.",
];

/** Required by the App Store for apps with sign-up (guideline 5.1.1(v)). */
export default function DeleteAccountScreen() {
  const { user, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <EmptyState
        icon="checkmark-circle-outline"
        title="Аккаунт удалён"
        text="Спасибо, что были с нами. Каталог и корзина работают и без аккаунта."
        action={<Button title="На главную" onPress={() => router.dismissTo("/")} />}
      />
    );
  }
  if (!user) {
    return <EmptyState icon="person-outline" title="Вы не вошли в аккаунт" />;
  }

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/me/delete", { body: { password } });
      await logout();
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (Platform.OS === "web") {
      void remove();
      return;
    }
    Alert.alert("Удалить аккаунт навсегда?", "Восстановить его будет нельзя.", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => void remove() },
    ]);
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
        <Muted>{user.email}</Muted>
        <View style={{ gap: 10 }}>
          {WHAT_HAPPENS.map((t) => (
            <View key={t} style={{ flexDirection: "row", gap: 10 }}>
              <Ionicons name="ellipse" size={6} color={colors.gold} style={{ marginTop: 8 }} />
              <Txt style={{ flex: 1, fontSize: 14 }}>{t}</Txt>
            </View>
          ))}
        </View>
        <Field
          testID="delete-password"
          label="Пароль для подтверждения"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button
          testID="delete-account"
          kind="danger"
          title="Удалить аккаунт навсегда"
          loading={busy}
          disabled={!password}
          onPress={confirm}
        />
        <Txt style={{ fontSize: 12, color: colors.muted, fontFamily: fonts.sans }}>
          Если передумали — просто закройте этот экран.
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
