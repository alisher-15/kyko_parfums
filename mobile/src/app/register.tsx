import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Button, Field, Muted, Notice, Title, Txt } from "@/components/ui";
import { errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { afterAuth } from "@/lib/navigation";
import { colors, fonts } from "@/theme";

export default function RegisterScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { register } = useAuth();
  const [form, setForm] = useState({ email: "", password: "", full_name: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await register({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim() || null,
        phone: form.phone.trim() || null,
      });
      afterAuth(next);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Title>Новый аккаунт</Title>
        <Muted>
          {next === "/wholesale"
            ? "Сначала аккаунт — затем заявка на оптовые цены, это одна минута."
            : "История заказов, их статусы и оптовые цены для бизнеса."}
        </Muted>
        <Field
          testID="register-email"
          label="Email"
          value={form.email}
          onChangeText={set("email")}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <Field
          testID="register-password"
          label="Пароль"
          hint="Не короче 8 символов"
          value={form.password}
          onChangeText={set("password")}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Field
          label="Имя (необязательно)"
          value={form.full_name}
          onChangeText={set("full_name")}
          autoComplete="name"
        />
        <Field
          label="Телефон (необязательно)"
          value={form.phone}
          onChangeText={set("phone")}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="+7 ___ ___ __ __"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button
          testID="register-submit"
          title="Зарегистрироваться"
          loading={busy}
          disabled={!form.email.trim() || form.password.length < 8}
          onPress={submit}
        />
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          <Muted>Уже есть аккаунт?</Muted>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.replace({ pathname: "/login", params: next ? { next } : {} })}
          >
            <Txt style={{ color: colors.gold, fontFamily: fonts.sansSemi }}>Войти</Txt>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
