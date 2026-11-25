import Ionicons from "@expo/vector-icons/Ionicons";
import { Children, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors, fonts, radius } from "@/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

// ---------- Text ----------

/** Text in the UI font. Custom fonts have one family per weight, so pass a family, not fontWeight. */
export function Txt({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.text, style]} />;
}

export function Title({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.title, style]} />;
}

/** Brand names and small caps labels: "CHANEL", "ОБЪЁМ". */
export function Eyebrow({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.eyebrow, style]} />;
}

export function Muted({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.text, styles.muted, style]} />;
}

// ---------- Buttons ----------

type ButtonKind = "primary" | "gold" | "outline" | "danger" | "ghost";

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  loading,
  icon,
  small,
  style,
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** When the title alone («↑») says too little to a screen reader. */
  accessibilityLabel?: string;
}) {
  const k = buttonKinds[kind];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: k.bg, borderColor: k.border },
        pressed && !off && { opacity: 0.85 },
        off && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={k.fg} size="small" />
      ) : (
        icon && <Ionicons name={icon} size={small ? 16 : 18} color={k.fg} />
      )}
      <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: k.fg }]}>
        {title}
      </Text>
    </Pressable>
  );
}

const buttonKinds: Record<ButtonKind, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.ink, fg: colors.white, border: colors.ink },
  gold: { bg: colors.gold, fg: colors.white, border: colors.gold },
  outline: { bg: colors.white, fg: colors.ink, border: colors.line },
  danger: { bg: colors.white, fg: colors.danger, border: colors.dangerLine },
  ghost: { bg: "transparent", fg: colors.gold, border: "transparent" },
};

/** A round icon button (favorites, share, close). */
export function IconButton({
  name,
  onPress,
  label,
  color = colors.ink,
  size = 22,
  style,
  testID,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }, style]}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

// ---------- Small pieces ----------

export function Chip({
  label,
  active,
  onPress,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <Text style={[styles.chipText, active && { color: colors.white }]} numberOfLines={1}>
      {label}
    </Text>
  );
  const chipStyle = [styles.chip, active && styles.chipActive, style];
  if (!onPress) return <View style={chipStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [...chipStyle, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  );
}

export function Badge({
  label,
  tone = "gold",
  small = false,
}: {
  label: string;
  tone?: "gold" | "ink";
  small?: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        small && { paddingHorizontal: 6, paddingVertical: 1 },
        { backgroundColor: tone === "gold" ? colors.gold : colors.ink },
      ]}
    >
      <Text style={[styles.badgeText, small && { fontSize: 10 }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

type NoticeTone = "error" | "success" | "warn" | "info";

export function Notice({
  children,
  tone = "info",
  style,
}: {
  children: ReactNode;
  tone?: NoticeTone;
  style?: StyleProp<ViewStyle>;
}) {
  const t = noticeTones[tone];
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={[styles.notice, { backgroundColor: t.bg, borderColor: t.border }, style]}
    >
      {Children.toArray(children).every((c) => typeof c === "string" || typeof c === "number") ? (
        <Text style={[styles.noticeText, { color: t.fg }]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

const noticeTones: Record<NoticeTone, { bg: string; fg: string; border: string }> = {
  error: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerLine },
  success: { bg: colors.okSoft, fg: colors.ok, border: "#a7f3d0" },
  warn: { bg: colors.warnSoft, fg: "#78350f", border: colors.warnLine },
  info: { bg: colors.white, fg: colors.muted, border: colors.line },
};

export function Loader({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.loader, style]}>
      <ActivityIndicator color={colors.gold} />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.gold} />
      </View>
      <Title style={styles.emptyTitle}>{title}</Title>
      {text && <Muted style={styles.emptyText}>{text}</Muted>}
      {action && <View style={{ marginTop: 18, alignSelf: "stretch" }}>{action}</View>}
    </View>
  );
}

/** An error with a way to try again. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Не удалось загрузить"
      text={message}
      action={onRetry && <Button title="Попробовать ещё раз" kind="outline" onPress={onRetry} />}
    />
  );
}

// ---------- Forms ----------

export function Field({
  label,
  hint,
  style,
  inputStyle,
  ...input
}: TextInputProps & {
  label: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, input.multiline && styles.inputMultiline, inputStyle]}
      />
      {hint && <Muted style={{ fontSize: 12 }}>{hint}</Muted>}
    </View>
  );
}

/** A row of the profile menu. */
export function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  danger,
  testID,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.cream }]}
    >
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.gold} />
      <View style={{ flex: 1 }}>
        <Txt style={[styles.menuTitle, danger && { color: colors.danger }]}>{title}</Txt>
        {subtitle && <Muted style={{ fontSize: 12 }}>{subtitle}</Muted>}
      </View>
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  text: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21, color: colors.ink },
  muted: { color: colors.muted },
  title: { fontFamily: fonts.serifBold, fontSize: 28, lineHeight: 32, color: colors.ink },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.gold,
  },
  button: {
    minHeight: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonSmall: { minHeight: 38, paddingHorizontal: 14 },
  buttonText: { fontFamily: fonts.sansSemi, fontSize: 15 },
  buttonTextSmall: { fontSize: 13 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  badgeText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  notice: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  noticeText: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  loader: { padding: 32, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingHorizontal: 32, paddingVertical: 48 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 26, textAlign: "center" },
  emptyText: { textAlign: "center", marginTop: 6 },
  label: {
    fontFamily: fonts.sansSemi,
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.muted,
  },
  input: {
    // 16px: smaller text makes iOS zoom into the field (web build).
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.field,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuTitle: { fontFamily: fonts.sansSemi, fontSize: 15 },
});
