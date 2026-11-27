import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTabBarInset } from "@/components/tab-stack";
import { EmptyState, Eyebrow, Muted, Title, Txt } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/format";
import { ADMIN_SECTIONS, isStaff, may } from "@/lib/staff";
import { colors, fonts, radius } from "@/theme";

/** The shop's admin for staff: the sections their role opens (as in the website's menu). */
export default function AdminHome() {
  const tabInset = useTabBarInset();
  const { user } = useAuth();
  if (!user || !isStaff(user.role)) {
    return <EmptyState icon="lock-closed-outline" title="Только для сотрудников магазина" />;
  }
  const sections = ADMIN_SECTIONS.filter((s) => may(user.role, s.area));
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 16 + tabInset, gap: 16 }}
      scrollIndicatorInsets={{ bottom: tabInset }}
    >
      <View style={{ gap: 2 }}>
        <Eyebrow>{ROLE_LABELS[user.role]}</Eyebrow>
        <Title>Управление магазином</Title>
        <Muted style={{ fontSize: 13 }}>{user.email}</Muted>
      </View>
      <View style={styles.grid}>
        {sections.map((s) => (
          <Pressable
            key={s.href}
            testID={`admin-${s.href.split("/").pop()}`}
            accessibilityRole="button"
            onPress={() => router.push(s.href)}
            style={({ pressed }) => [styles.tile, pressed && { backgroundColor: colors.goldSoft }]}
          >
            <View style={styles.icon}>
              <Ionicons name={s.icon} size={22} color={colors.gold} />
            </View>
            <Txt style={styles.title}>{s.title}</Txt>
            <Muted style={{ fontSize: 12, lineHeight: 16 }}>{s.hint}</Muted>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 14,
    gap: 6,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.sansSemi, fontSize: 15 },
});
