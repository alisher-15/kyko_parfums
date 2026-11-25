import { useState } from "react";
import { ScrollView } from "react-native";
import { Button, Field, Muted, Notice, Title } from "@/components/ui";
import { api, errorText } from "@/lib/api";

/** The server emails a link; the new password is set on the website, which the link opens. */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    // The keyboard's Go can fire while a request is on its way, or with the field empty.
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ detail: string }>("/auth/forgot-password", {
        body: { email: email.trim() },
      });
      setSent(res.detail);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Title>Восстановление пароля</Title>
      <Muted>Пришлём на почту ссылку, по которой можно задать новый пароль.</Muted>
      {sent ? (
        <Notice tone="success">{sent}</Notice>
      ) : (
        <>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoFocus
            onSubmitEditing={submit}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button
            title="Отправить ссылку"
            loading={busy}
            disabled={!email.trim()}
            onPress={submit}
          />
        </>
      )}
    </ScrollView>
  );
}
