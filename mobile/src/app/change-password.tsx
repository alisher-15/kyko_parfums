import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Button, Field, Muted, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TokenPair } from "@/lib/types";

/** The server ends the other sessions and hands this one new tokens. */
export default function ChangePasswordScreen() {
  const { setSession } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await setSession(
        await api<TokenPair>("/me/change-password", {
          body: { current_password: current, new_password: next },
        }),
      );
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Notice tone="success">
          Пароль изменён. На других устройствах нужно будет войти заново.
        </Notice>
        <Button title="Готово" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Muted>После смены пароля на других устройствах нужно будет войти заново.</Muted>
        <Field
          label="Текущий пароль"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
        />
        <Field
          label="Новый пароль"
          hint="Не короче 8 символов"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoComplete="new-password"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button
          title="Сменить пароль"
          loading={busy}
          disabled={!current || next.length < 8}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
