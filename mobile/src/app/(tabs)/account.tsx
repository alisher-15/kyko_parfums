import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import {
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { CurrencySwitch } from "@/components/shop";
import { Button, Card, Divider, Eyebrow, MenuRow, Muted, Title, Txt } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { PRIVACY_URL } from "@/lib/config";
import { CONTACTS } from "@/lib/contacts";
import { useCurrency } from "@/lib/currency";
import { ROLE_LABELS, longDate, tenge } from "@/lib/format";
import { useApi } from "@/lib/queries";
import type { PricingRules, User } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

export default function AccountScreen() {
  const { user, logout, reload } = useAuth();
  const { rate } = useCurrency();

  const confirmLogout = () => {
    if (Platform.OS === "web") {
      void logout();
      return;
    }
    Alert.alert("Выйти из аккаунта?", undefined, [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: () => void logout() },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={
        user ? (
          <RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.gold} />
        ) : undefined
      }
    >
      {user ? <StatusCard user={user} /> : <GuestCard />}

      {user && (
        <Card style={styles.menu}>
          <MenuRow
            icon="receipt-outline"
            title="Мои заказы"
            onPress={() => router.push("/orders")}
            testID="menu-orders"
          />
          <Divider style={{ marginLeft: 50 }} />
          <MenuRow
            icon="person-circle-outline"
            title="Личные данные"
            subtitle={
              [user.full_name, user.phone].filter(Boolean).join(" · ") || "Имя, телефон, компания"
            }
            onPress={() => router.push("/profile")}
          />
          {(user.role === "retail" || user.role === "wholesale") && (
            <>
              <Divider style={{ marginLeft: 50 }} />
              <MenuRow
                icon="briefcase-outline"
                title={user.role === "retail" ? "Оптовые цены" : "Крупный опт"}
                subtitle={user.wholesale_requested ? "Заявка отправлена" : "Оставить заявку"}
                onPress={() => router.push("/wholesale")}
              />
            </>
          )}
          <Divider style={{ marginLeft: 50 }} />
          <MenuRow
            icon="key-outline"
            title="Сменить пароль"
            onPress={() => router.push("/change-password")}
          />
        </Card>
      )}

      {!!rate && (
        <Card style={styles.currency}>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontFamily: fonts.sansSemi }}>Валюта цен</Txt>
            <Muted style={{ fontSize: 12 }}>
              Оплата всегда в тенге · 1 $ = {Number(rate.toFixed(2))} ₸
            </Muted>
          </View>
          <CurrencySwitch />
        </Card>
      )}

      <Card style={styles.menu}>
        <MenuRow
          icon="pricetags-outline"
          title="Все бренды"
          onPress={() => router.push("/brands")}
        />
        {CONTACTS.map((c) => (
          <View key={c.kind}>
            <Divider style={{ marginLeft: 50 }} />
            <MenuRow
              icon={
                c.kind === "whatsapp"
                  ? "logo-whatsapp"
                  : c.kind === "telegram"
                    ? "paper-plane-outline"
                    : "logo-instagram"
              }
              title={c.title}
              subtitle={c.label}
              onPress={() => Linking.openURL(c.href)}
            />
          </View>
        ))}
        <Divider style={{ marginLeft: 50 }} />
        <MenuRow
          icon="shield-checkmark-outline"
          title="Политика конфиденциальности"
          onPress={() => Linking.openURL(PRIVACY_URL)}
        />
      </Card>

      {user && (
        <Card style={styles.menu}>
          <MenuRow
            icon="log-out-outline"
            title="Выйти"
            danger
            onPress={confirmLogout}
            testID="logout"
          />
          <Divider style={{ marginLeft: 50 }} />
          <MenuRow
            icon="trash-outline"
            title="Удалить аккаунт"
            danger
            onPress={() => router.push("/delete-account")}
            testID="menu-delete-account"
          />
        </Card>
      )}
    </ScrollView>
  );
}

function GuestCard() {
  return (
    <Card style={{ gap: 12, padding: 20 }}>
      <View style={styles.avatar}>
        <Ionicons name="person-outline" size={26} color={colors.gold} />
      </View>
      <Title>Войдите в аккаунт</Title>
      <Muted>
        Чтобы оформлять заказы, видеть их статус и получить оптовые цены для магазина или салона.
      </Muted>
      <Button title="Войти" onPress={() => router.push("/login")} testID="account-login" />
      <Button kind="outline" title="Зарегистрироваться" onPress={() => router.push("/register")} />
    </Card>
  );
}

function StatusCard({ user }: { user: User }) {
  const { data: rules } = useApi<PricingRules>("/pricing/rules");
  const isWholesale = user.role === "wholesale" || user.role === "bulk_wholesale";
  const thresholds =
    rules &&
    (rules.mode === "order_total"
      ? !!(rules.wholesale_min_order_amount || rules.bulk_min_order_amount)
      : (rules.wholesale_min_item_qty ?? 1) > 1 || (rules.bulk_min_item_qty ?? 1) > 1);

  return (
    <Card style={{ gap: 4, padding: 20 }}>
      <Eyebrow>Ваш статус</Eyebrow>
      <Title style={{ fontSize: 32, lineHeight: 36 }} testID="account-role">
        {ROLE_LABELS[user.role]}
      </Title>
      <Muted style={{ fontSize: 13 }}>
        {user.email} · с {longDate(user.created_at)}
      </Muted>
      {isWholesale && rules && (
        <View style={styles.terms}>
          <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>Ваши условия</Txt>
          {!thresholds ? (
            <Muted style={{ fontSize: 13 }}>
              {user.role === "bulk_wholesale" ? "Цены крупного опта" : "Оптовые цены"} действуют на
              любой заказ.
            </Muted>
          ) : rules.mode === "order_total" ? (
            <>
              <Muted style={{ fontSize: 13 }}>
                Оптовые цены — при заказе от {tenge(rules.wholesale_min_order_amount)}
              </Muted>
              {rules.bulk_min_order_amount !== null && (
                <Muted style={{ fontSize: 13 }}>
                  Цены крупного опта — при заказе от {tenge(rules.bulk_min_order_amount)}
                </Muted>
              )}
              <Muted style={{ fontSize: 13 }}>
                Ниже порога заказ считается по розничным ценам.
              </Muted>
            </>
          ) : (
            <>
              <Muted style={{ fontSize: 13 }}>
                Оптовые цены — от {rules.wholesale_min_item_qty} шт. одной позиции
              </Muted>
              {rules.bulk_min_item_qty !== null && (
                <Muted style={{ fontSize: 13 }}>
                  Крупный опт — от {rules.bulk_min_item_qty} шт. одной позиции
                </Muted>
              )}
              <Muted style={{ fontSize: 13 }}>
                Ниже порога заказ считается по розничным ценам.
              </Muted>
            </>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  menu: { padding: 0, overflow: "hidden" },
  currency: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  terms: {
    marginTop: 12,
    backgroundColor: colors.cream,
    borderRadius: radius.md,
    padding: 12,
    gap: 4,
  },
});
