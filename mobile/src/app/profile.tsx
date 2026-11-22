import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Button, EmptyState, Field, Muted, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function ProfileScreen() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    full_name: user?.full_name ?? "",
    phone: user?.phone ?? "",
    company_name: user?.company_name ?? "",
  });
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return <EmptyState icon="person-outline" title="Вы не вошли в аккаунт" />;

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setUser(
        await api<User>("/me", {
          method: "PATCH",
          body: {
            full_name: form.full_name.trim() || null,
            phone: form.phone.trim() || null,
            company_name: form.company_name.trim() || null,
          },
        }),
      );
      setMessage({ tone: "success", text: "Сохранено" });
    } catch (err) {
      setMessage({ tone: "error", text: errorText(err) });
    } finally {
      setBusy(false);
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
        <Muted>Эти данные подставляются в заказ, чтобы не вводить их каждый раз.</Muted>
        <Field label="Email" value={user.email} editable={false} hint="Email изменить нельзя" />
        <Field
          label="Имя и фамилия"
          value={form.full_name}
          onChangeText={set("full_name")}
          autoComplete="name"
        />
        <Field
          label="Телефон"
          value={form.phone}
          onChangeText={set("phone")}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="+7 ___ ___ __ __"
        />
        <Field label="Компания / ИП" value={form.company_name} onChangeText={set("company_name")} />
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <Button title="Сохранить" loading={busy} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
