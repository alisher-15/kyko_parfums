import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Button, Field, Muted, Notice, Title, Txt } from "@/components/ui";
import { errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { afterAuth } from "@/lib/navigation";
import { colors, fonts } from "@/theme";

export default function LoginScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The keyboard's Go and the button can both fire: one login only, and not with empty fields.
  const sending = useRef(false);

  const submit = async () => {
    if (sending.current || !email.trim() || !password) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      afterAuth(next);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
      sending.current = false;
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
        <Title>С возвращением</Title>
        <Muted>Войдите, чтобы оформлять заказы и видеть свои цены.</Muted>
        <Field
          testID="login-email"
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="username"
          autoFocus
        />
        <Field
          testID="login-password"
          label="Пароль"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button
          testID="login-submit"
          title="Войти"
          loading={busy}
          disabled={!email.trim() || !password}
          onPress={submit}
        />
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/forgot-password")}
          hitSlop={6}
        >
          <Txt style={{ color: colors.gold, fontFamily: fonts.sansSemi, textAlign: "center" }}>
            Забыли пароль?
          </Txt>
        </Pressable>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 }}>
          <Muted>Нет аккаунта?</Muted>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.replace({ pathname: "/register", params: next ? { next } : {} })}
          >
            <Txt style={{ color: colors.gold, fontFamily: fonts.sansSemi }}>Зарегистрироваться</Txt>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
