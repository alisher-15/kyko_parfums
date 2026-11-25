import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import {
  AdminScreen,
  ChipPicker,
  Pill,
  SearchBox,
  Segmented,
  Toggle,
} from "@/components/admin/kit";
import { Button, EmptyState, ErrorState, Field, Loader, Muted, Notice, Txt } from "@/components/ui";
import type { AdminUser } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, formatPhone, ROLE_LABELS } from "@/lib/format";
import { usePages } from "@/lib/queries";
import type { UserRole } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default function UsersAdminScreen() {
  return (
    <AdminScreen title="Пользователи" area={null}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Users />
      </KeyboardAvoidingView>
    </AdminScreen>
  );
}

function Users() {
  const params = useLocalSearchParams<{ role?: string; requests?: string; q?: string }>();
  const queryClient = useQueryClient();
  const [q, setQ] = useState(params.q ?? "");
  const [role, setRole] = useState<UserRole | "">((params.role as UserRole) ?? "");
  const [requests, setRequests] = useState(params.requests === "true");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const users = usePages<AdminUser>(
    "/admin/users",
    { q, role, wholesale_requested: requests || undefined },
    50,
  );
  const items = useMemo(() => users.data?.pages.flatMap((p) => p.items) ?? [], [users.data]);
  const total = users.data?.pages[0]?.total;
  const reload = () =>
    queryClient.invalidateQueries({
      predicate: (x) => x.queryKey[0] === "/admin/users" || x.queryKey[0] === "/admin/stats",
    });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ gap: 8, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ paddingHorizontal: 16, flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Найти клиента"
              testID="users-search"
            />
          </View>
          <Button
            small
            icon={creating ? "close" : "person-add-outline"}
            title={creating ? "Скрыть" : "Добавить"}
            onPress={() => setCreating(!creating)}
            style={{ minHeight: 46 }}
            testID="user-create-toggle"
          />
        </View>
        <Segmented
          value={requests ? "requests" : role}
          onChange={(v) => {
            setRequests(v === "requests");
            setRole(v === "requests" ? "" : (v as UserRole | ""));
          }}
          options={[
            {
              value: "",
              label: total !== undefined && !role && !requests ? `Все · ${total}` : "Все",
            },
            { value: "requests", label: "Заявки на опт" },
            ...ROLES.map((r) => ({
              value: r,
              label:
                r === role && total !== undefined ? `${ROLE_LABELS[r]} · ${total}` : ROLE_LABELS[r],
            })),
          ]}
        />
      </View>
      {users.error && !users.data ? (
        <ErrorState message={users.error.message} onRetry={() => void users.refetch()} />
      ) : !users.data ? (
        <Loader />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => String(u.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10, flexGrow: 1 }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (users.hasNextPage && !users.isFetchingNextPage) void users.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl
              refreshing={users.isRefetching && !users.isFetchingNextPage}
              onRefresh={() => void users.refetch()}
              tintColor={colors.gold}
            />
          }
          ListHeaderComponent={
            creating ? (
              <CreateUser
                onCreated={() => {
                  setCreating(false);
                  void reload();
                }}
              />
            ) : undefined
          }
          ListFooterComponent={users.isFetchingNextPage ? <Loader /> : undefined}
          ListEmptyComponent={<EmptyState icon="people-outline" title="Никого не нашлось" />}
          renderItem={({ item }) => (
            <UserCard
              user={item}
              open={open === item.id}
              onToggle={() => setOpen(open === item.id ? null : item.id)}
              onChanged={reload}
            />
          )}
        />
      )}
    </View>
  );
}

function UserCard({
  user: u,
  open,
  onToggle,
  onChanged,
}: {
  user: AdminUser;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const { user: me } = useAuth();
  const self = u.id === me?.id;
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", body });
      await onChanged();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, u.wholesale_requested && { borderColor: colors.gold }]}>
      <Pressable
        accessibilityRole="button"
        testID={`user-${u.id}`}
        onPress={onToggle}
        style={{ gap: 4 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 15, flex: 1 }} numberOfLines={1}>
            {u.email}
          </Txt>
          <Pill label={ROLE_LABELS[u.role]} tone={u.role === "retail" ? "muted" : "gold"} />
        </View>
        <Muted style={{ fontSize: 12 }}>
          {[u.full_name, u.company_name, u.phone].filter(Boolean).join(" · ") || "—"}
        </Muted>
        <Muted style={{ fontSize: 12 }}>
          Заказов: {u.orders_count} · с {dateTime(u.created_at)}
        </Muted>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {u.wholesale_requested && (
            <Pill label={`Заявка: ${ROLE_LABELS[u.requested_role ?? "wholesale"]}`} tone="warn" />
          )}
          {!u.is_active && <Pill label="Заблокирован" tone="danger" />}
        </View>
        {u.wholesale_requested && u.upgrade_request_note && (
          <Muted style={{ fontSize: 12 }}>«{u.upgrade_request_note}»</Muted>
        )}
      </Pressable>
      {open && (
        <View style={{ gap: 12, marginTop: 12 }}>
          {self ? (
            <Muted style={{ fontSize: 13 }}>Свою роль и доступ поменять нельзя.</Muted>
          ) : (
            <>
              {u.wholesale_requested && (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button
                    small
                    kind="gold"
                    style={{ flex: 1 }}
                    title={`Дать «${ROLE_LABELS[u.requested_role ?? "wholesale"]}»`}
                    disabled={busy}
                    onPress={() => void patch({ role: u.requested_role ?? "wholesale" })}
                  />
                  <Button
                    small
                    kind="outline"
                    title="Отклонить"
                    disabled={busy}
                    onPress={() => void patch({ wholesale_requested: false })}
                  />
                </View>
              )}
              <ChipPicker
                label="Роль"
                value={u.role}
                options={ROLE_OPTIONS}
                onChange={(r) => r && r !== u.role && void patch({ role: r })}
              />
              <Toggle
                label="Доступ"
                hint={u.is_active ? "Активен" : "Заблокирован: не может войти"}
                value={u.is_active}
                onChange={(v) => void patch({ is_active: v })}
              />
            </>
          )}
          {msg && <Notice tone="error">{msg}</Notice>}
        </View>
      )}
    </View>
  );
}

function CreateUser({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    role: "wholesale" as UserRole,
    full_name: "",
    phone: "",
    company_name: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (text: string) => setForm({ ...form, [key]: text });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/admin/users", {
        body: {
          ...form,
          email: form.email.trim(),
          full_name: form.full_name.trim() || null,
          phone: form.phone.trim() || null,
          company_name: form.company_name.trim() || null,
        },
      });
      onCreated();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { gap: 12, marginBottom: 6 }]}>
      <Txt style={{ fontFamily: fonts.sansBold, fontSize: 16 }}>Новый пользователь</Txt>
      <Field
        label="Email"
        value={form.email}
        onChangeText={set("email")}
        keyboardType="email-address"
        autoCapitalize="none"
        testID="user-email"
      />
      <Field
        label="Пароль"
        hint="Минимум 8 символов"
        value={form.password}
        onChangeText={set("password")}
        autoCapitalize="none"
        testID="user-password"
      />
      <ChipPicker
        label="Роль"
        value={form.role}
        options={ROLE_OPTIONS}
        onChange={(r) => r && setForm({ ...form, role: r })}
      />
      <Field label="Имя" value={form.full_name} onChangeText={set("full_name")} />
      <Field
        label="Телефон"
        value={form.phone}
        onChangeText={(t) => set("phone")(formatPhone(t))}
        keyboardType="phone-pad"
      />
      <Field label="Компания" value={form.company_name} onChangeText={set("company_name")} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        title="Создать"
        testID="user-create"
        loading={busy}
        disabled={!form.email.trim() || form.password.length < 8}
        onPress={() => void submit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
  },
});
