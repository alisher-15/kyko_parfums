import Ionicons from "@expo/vector-icons/Ionicons";
import { CameraView, useCameraPermissions, type BarcodeType } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Muted, Txt } from "@/components/ui";
import { colors, fonts, radius } from "@/theme";

/** What a scan did, shown right after it (as on the website, ScanResultCard.tsx). */
export interface ScanResult {
  ok: boolean;
  /** Product name, or what went wrong. */
  title: string;
  detail?: string;
  /** The quantity the scan changed, with −/+ to correct it. */
  quantity?: {
    label: string;
    value: number;
    min?: number;
    max?: number;
    /** Save a new quantity; resolves to the quantity actually saved. */
    set: (value: number) => Promise<number>;
  };
  /** Revert exactly what this scan did. */
  undo?: () => Promise<void>;
  /** A way out of a failed scan, e.g. attach an unknown barcode (closes the camera). */
  action?: { label: string; run: () => void };
  /** This scan finished the job (the last item of an order): the camera offers «Готово». */
  finished?: boolean;
}

// Keys of the Russian layout → the Latin keys: a hardware scanner "types" the code.
const RU_KEYS = "йцукенгшщзхъфывапролджэячсмитьбюё";
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";

/** A scanned code as sent to the server: no spaces, Latin even if typed in the Russian layout. */
export function normalizeScan(raw: string): string {
  return [...raw.replace(/\s+/g, "")]
    .map((ch) => {
      const i = RU_KEYS.indexOf(ch.toLowerCase());
      if (i < 0) return ch;
      return ch === ch.toLowerCase() ? EN_KEYS[i] : EN_KEYS[i].toUpperCase();
    })
    .join("");
}

const BARCODES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14"];
// The camera sees the same code many times a second: one read per code per this long.
const SAME_CODE_MS = 2500;

function feedback(ok: boolean) {
  if (Platform.OS === "web") return;
  void Haptics.notificationAsync(
    ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
  );
}

/**
 * A code field for a hardware scanner (it types the code and presses Enter) or typing by hand,
 * plus the phone camera. Scans are handled one after another; the last result stays under the
 * field (and on the camera screen) with −/+ and undo.
 */
export function ScanField({
  onScan,
  placeholder = "Штрихкод или артикул",
  cameraTitle,
  single = false,
  autoOpenCamera = false,
}: {
  onScan: (code: string) => Promise<ScanResult>;
  placeholder?: string;
  /** Shown at the top of the camera screen, e.g. «Приёмка № 12». */
  cameraTitle?: string;
  /** The camera closes after the first successful scan. */
  single?: boolean;
  autoOpenCamera?: boolean;
}) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [camera, setCamera] = useState(autoOpenCamera);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  const run = (raw: string): Promise<ScanResult> => {
    const code = normalizeScan(raw);
    const next = queue.current.then(async () => {
      let res: ScanResult;
      try {
        res = code ? await onScanRef.current(code) : { ok: false, title: "Пустой код" };
      } catch (e) {
        res = { ok: false, title: e instanceof Error ? e.message : String(e) };
      }
      feedback(res.ok);
      setResult(res);
      return res;
    });
    queue.current = next.catch(() => undefined);
    return next;
  };

  const submit = () => {
    const code = value;
    setValue("");
    if (code.trim()) void run(code);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={styles.field}>
          <Ionicons name="barcode-outline" size={20} color={colors.muted} />
          <TextInput
            testID="scan-input"
            value={value}
            onChangeText={setValue}
            onSubmitEditing={submit}
            placeholder={placeholder}
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            submitBehavior="submit"
            style={styles.input}
            accessibilityLabel={placeholder}
          />
          {!!value && (
            <Pressable accessibilityLabel="Найти" onPress={submit} hitSlop={8}>
              <Ionicons name="arrow-forward-circle" size={24} color={colors.ink} />
            </Pressable>
          )}
        </View>
        <Pressable
          testID="scan-camera"
          accessibilityRole="button"
          accessibilityLabel="Сканировать камерой"
          onPress={() => setCamera(true)}
          style={styles.cameraButton}
        >
          <Ionicons name="camera-outline" size={22} color={colors.white} />
        </Pressable>
      </View>
      {result && <ScanResultCard result={result} onAction={(a) => a.run()} />}
      <CameraScanner
        visible={camera}
        title={cameraTitle}
        result={result}
        onClose={() => setCamera(false)}
        onCode={async (code) => {
          const res = await run(code);
          if (single && res.ok) setCamera(false);
          return res;
        }}
        onAction={(a) => {
          setCamera(false);
          a.run();
        }}
      />
    </View>
  );
}

export function ScanResultCard({
  result,
  dark = false,
  onAction,
}: {
  result: ScanResult;
  dark?: boolean;
  onAction?: (action: NonNullable<ScanResult["action"]>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState(result.quantity?.value ?? 0);
  const [undone, setUndone] = useState(false);
  // A new scan starts the card over (React's «adjust state on a prop change»).
  const [shown, setShown] = useState(result);
  if (shown !== result) {
    setShown(result);
    setQty(result.quantity?.value ?? 0);
    setUndone(false);
  }

  const q = result.quantity;
  const fg = dark ? "#f5f5f4" : colors.ink;
  const change = async (next: number) => {
    if (!q || busy) return;
    setBusy(true);
    try {
      setQty(await q.set(next));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.result,
        result.ok ? styles.resultOk : styles.resultBad,
        dark && { backgroundColor: result.ok ? "rgba(4,120,87,0.35)" : "rgba(185,28,28,0.35)" },
      ]}
      accessibilityLiveRegion="polite"
    >
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <Ionicons
          name={result.ok ? "checkmark-circle" : "alert-circle"}
          size={20}
          color={result.ok ? (dark ? "#6ee7b7" : colors.ok) : dark ? "#fca5a5" : colors.danger}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.resultTitle, { color: fg }]} testID="scan-result">
            {undone ? `Отменено: ${result.title}` : result.title}
          </Text>
          {!!result.detail && (
            <Text style={{ color: dark ? "#d6d3d1" : colors.muted, fontSize: 13 }}>
              {result.detail}
            </Text>
          )}
        </View>
      </View>
      {q && !undone && (
        <View style={styles.qtyRow}>
          <Text style={{ color: dark ? "#d6d3d1" : colors.muted, fontSize: 13 }}>{q.label}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              accessibilityLabel="Меньше"
              disabled={busy || qty <= (q.min ?? 0)}
              onPress={() => void change(qty - 1)}
              style={[styles.qtyButton, qty <= (q.min ?? 0) && { opacity: 0.4 }]}
            >
              <Ionicons name="remove" size={18} color={fg} />
            </Pressable>
            <Text style={[styles.qty, { color: fg }]}>{qty}</Text>
            <Pressable
              accessibilityLabel="Больше"
              disabled={busy || (q.max !== undefined && qty >= q.max)}
              onPress={() => void change(qty + 1)}
              style={styles.qtyButton}
            >
              <Ionicons name="add" size={18} color={fg} />
            </Pressable>
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {result.undo && !undone && (
          <Button
            small
            kind="outline"
            title="Отменить скан"
            onPress={async () => {
              await result.undo?.();
              setUndone(true);
            }}
          />
        )}
        {result.action && (
          <Button
            small
            kind="gold"
            title={result.action.label}
            onPress={() => onAction?.(result.action!)}
          />
        )}
      </View>
    </View>
  );
}

/** Full-screen camera reading barcodes; the result of each scan shows at the bottom. */
export function CameraScanner({
  visible,
  title,
  result,
  onCode,
  onClose,
  onAction,
}: {
  visible: boolean;
  title?: string;
  result: ScanResult | null;
  onCode: (code: string) => Promise<ScanResult>;
  onClose: () => void;
  onAction: (action: NonNullable<ScanResult["action"]>) => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) void request();
  }, [visible, permission, request]);

  const onScanned = ({ data }: { data: string }) => {
    const now = Date.now();
    if (busy.current) return;
    if (last.current && last.current.code === data && now - last.current.at < SAME_CODE_MS) return;
    last.current = { code: data, at: now };
    busy.current = true;
    void onCode(data).finally(() => {
      busy.current = false;
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.cameraScreen}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: BARCODES }}
            onBarcodeScanned={onScanned}
          />
        ) : (
          <View style={styles.noCamera}>
            <Txt style={{ color: "#f5f5f4", textAlign: "center" }}>
              {permission && !permission.canAskAgain
                ? "Доступ к камере выключен. Включите его в настройках телефона."
                : "Нужен доступ к камере, чтобы сканировать штрихкоды."}
            </Txt>
            {permission?.canAskAgain !== false && (
              <Button kind="gold" title="Разрешить камеру" onPress={() => void request()} />
            )}
          </View>
        )}
        <View style={[styles.cameraTop, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.cameraTitle} numberOfLines={1}>
            {title ?? "Сканер"}
          </Text>
          <Pressable
            testID="scan-close"
            accessibilityRole="button"
            accessibilityLabel="Закрыть камеру"
            onPress={onClose}
            style={styles.close}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.frame} pointerEvents="none" />
        <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 12 }]}>
          {result ? (
            <ScanResultCard result={result} dark onAction={onAction} />
          ) : (
            <Muted style={{ color: "#d6d3d1", textAlign: "center" }}>
              Наведите камеру на штрихкод
            </Muted>
          )}
          {result?.finished && <Button kind="gold" title="Готово" onPress={onClose} />}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 48,
  },
  input: { flex: 1, fontFamily: fonts.sans, fontSize: 16, color: colors.ink, height: "100%" },
  cameraButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  result: { borderRadius: radius.md, borderWidth: 1, padding: 12, gap: 10 },
  resultOk: { backgroundColor: colors.okSoft, borderColor: "#a7f3d0" },
  resultBad: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine },
  resultTitle: { fontFamily: fonts.sansSemi, fontSize: 15 },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qtyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(120,113,108,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  qty: { fontFamily: fonts.sansBold, fontSize: 18, minWidth: 28, textAlign: "center" },
  cameraScreen: { flex: 1, backgroundColor: "#000" },
  noCamera: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  cameraTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  cameraTitle: { flex: 1, color: "#fff", fontFamily: fonts.sansSemi, fontSize: 16 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  frame: {
    position: "absolute",
    left: "12%",
    right: "12%",
    top: "32%",
    height: "18%",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: radius.md,
  },
  cameraBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
});
