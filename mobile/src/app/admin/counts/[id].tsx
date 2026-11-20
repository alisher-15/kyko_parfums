import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { AdminScreen, Block, Pill, VariantSearch, confirm } from "@/components/admin/kit";
import { ScanField, type ScanResult } from "@/components/admin/scan";
import { UnknownBarcode } from "@/components/admin/unknown";
import { Button, ErrorState, Field, Loader, Muted, Notice, Txt } from "@/components/ui";
import type { CountLine, StockCount } from "@/lib/admin-types";
import { ApiError, api, errorText } from "@/lib/api";
import { dateTime, volumeLabel } from "@/lib/format";
import { useApi } from "@/lib/queries";
import { colors, fonts, radius } from "@/theme";

export default function CountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AdminScreen title={`Инвентаризация № ${id}`} area="stock">
      <CountView id={Number(id)} />
    </AdminScreen>
  );
}

function CountView({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const base = `/admin/counts/${id}`;
  const loaded = useApi<StockCount>(base);
  const [doc, setDoc] = useState<StockCount | null>(null);
  const latest = useRef<StockCount | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const count = doc ?? loaded.data;

  if (loaded.error && !count)
    return <ErrorState message={loaded.error.message} onRetry={() => void loaded.refetch()} />;
  if (!count) return <Loader />;
  const draft = count.status === "draft";

  const apply = (c: StockCount) => {
    latest.current = c;
    setDoc(c);
    queryClient.setQueryData([base, null], c);
    void queryClient.invalidateQueries({ queryKey: ["/admin/counts"] });
  };
  const run = async (fn: () => Promise<StockCount | void>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const c = await fn();
      if (c) apply(c);
      if (okText) setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const scan = async (code: string): Promise<ScanResult> => {
    const before = latest.current ?? count;
    let c: StockCount;
    try {
      c = await api<StockCount>(`${base}/scan`, { body: { code } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setUnknown(code);
        return {
          ok: false,
          title: `Штрихкод ${code} не найден`,
          detail: "Его нет в каталоге. Привяжите код к товару — в следующий раз он найдётся сам.",
          action: { label: "Привязать к товару", run: () => setUnknown(code) },
        };
      }
      throw e;
    }
    apply(c);
    setUnknown(null);
    const line = c.items.find((i) => i.id === c.touched_line_id);
    if (!line) return { ok: true, title: "Посчитано" };
    const lineUrl = `${base}/lines/${line.id}`;
    const existed = before.items.some((i) => i.id === line.id);
    const counted = line.counted - 1;
    return {
      ok: true,
      title: line.label,
      detail: line.expected !== null ? `В системе ${line.expected} шт.` : undefined,
      quantity: {
        label: "Посчитано, шт.",
        value: line.counted,
        min: 0,
        set: async (n) => {
          const updated = await api<StockCount>(lineUrl, { method: "PATCH", body: { counted: n } });
          apply(updated);
          return updated.items.find((i) => i.id === line.id)?.counted ?? n;
        },
      },
      undo: async () => {
        apply(
          await api<StockCount>(
            lineUrl,
            existed ? { method: "PATCH", body: { counted } } : { method: "DELETE" },
          ),
        );
      },
    };
  };

  const post = async () => {
    if (
      !(await confirm(
        "Провести инвентаризацию?",
        `Остатки ${count.items.length} поз. станут равны посчитанному.`,
        "Провести",
      ))
    ) {
      return;
    }
    await run(
      () => api<StockCount>(`${base}/post`, { method: "POST" }),
      "Инвентаризация проведена, остатки исправлены",
    );
    void queryClient.invalidateQueries({ queryKey: ["/admin/stats"] });
  };
  const remove = async () => {
    if (!(await confirm("Удалить эту инвентаризацию?", "Посчитанное пропадёт.", "Удалить"))) return;
    await run(async () => {
      await api(base, { method: "DELETE" });
      void queryClient.invalidateQueries({ queryKey: ["/admin/counts"] });
      router.back();
    });
  };

  const mismatches = count.items.filter((i) => i.expected !== null && i.counted !== i.expected);
  const diffColor =
    count.difference < 0 ? colors.danger : count.difference > 0 ? colors.ok : colors.ink;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pill tone={draft ? "gold" : "muted"} label={draft ? "Идёт пересчёт" : "Проведена"} />
        <NoteField key={`${count.id}-${draft}`} count={count} onSaved={apply} />
        {draft && (
          <Block title="Сканер">
            <ScanField onScan={scan} cameraTitle={`Инвентаризация № ${count.id}`} />
            <Muted style={{ fontSize: 12 }}>
              Один скан — одна штука. Несколько одинаковых проще посчитать кнопками −/+.
            </Muted>
          </Block>
        )}
        {unknown && draft && (
          <UnknownBarcode
            code={unknown}
            onCancel={() => setUnknown(null)}
            onAttached={(item) =>
              void run(
                async () => {
                  const c = await api<StockCount>(`${base}/scan`, { body: { code: unknown } });
                  setUnknown(null);
                  return c;
                },
                `Штрихкод привязан к «${item.brand_name} ${item.product_name}, ${volumeLabel(item.volume_ml, item.is_tester)}», посчитано +1`,
              )
            }
          />
        )}
        {draft && (
          <Block title="Без штрихкода или нет на полке">
            <VariantSearch
              onPick={(item) =>
                void run(
                  () =>
                    api<StockCount>(`${base}/lines`, {
                      body: { variant_id: item.variant_id, quantity: 0 },
                    }),
                  `Добавлено: ${item.brand_name} ${item.product_name}, ${volumeLabel(item.volume_ml, item.is_tester)} — укажите количество`,
                )
              }
            />
          </Block>
        )}
        {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}

        <Block title="Посчитано">
          <Muted style={{ fontSize: 13 }}>
            {count.items.length} поз. · расхождений {mismatches.length} · итого{" "}
            <Txt style={{ fontFamily: fonts.sansBold, fontSize: 13, color: diffColor }}>
              {count.difference > 0 ? `+${count.difference}` : count.difference} шт.
            </Txt>
          </Muted>
          {count.items.length === 0 ? (
            <Muted style={{ textAlign: "center", paddingVertical: 8 }}>
              Начните сканировать товар на полке.
            </Muted>
          ) : (
            count.items.map((line) => (
              <CountRow
                key={`${line.id}-${line.counted}`}
                line={line}
                draft={draft}
                highlight={line.id === count.touched_line_id}
                disabled={busy}
                onChange={(counted) =>
                  void run(() =>
                    api<StockCount>(`${base}/lines/${line.id}`, {
                      method: "PATCH",
                      body: { counted },
                    }),
                  )
                }
                onDelete={() =>
                  void run(() => api<StockCount>(`${base}/lines/${line.id}`, { method: "DELETE" }))
                }
              />
            ))
          )}
        </Block>

        {draft ? (
          <View style={{ gap: 10 }}>
            <Muted style={{ fontSize: 12 }}>
              «В системе» — сколько должно лежать на полке сейчас: свободный остаток плюс товар,
              отложенный под неотправленные заказы. Считайте и отложенное: после проведения остаток
              станет «посчитано минус отложенное». Проводите документ сразу после подсчёта.
            </Muted>
            <Button
              testID="count-post"
              title="Провести инвентаризацию"
              disabled={busy || count.items.length === 0}
              onPress={() => void post()}
            />
            <Button kind="danger" title="Удалить" disabled={busy} onPress={() => void remove()} />
          </View>
        ) : (
          <Muted style={{ fontSize: 13 }}>
            Проведена {count.posted_at ? dateTime(count.posted_at) : ""}
            {count.posted_by_email ? ` · ${count.posted_by_email}` : ""}. «В системе» — остаток до
            проведения.
          </Muted>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function NoteField({ count, onSaved }: { count: StockCount; onSaved: (c: StockCount) => void }) {
  const [note, setNote] = useState(count.note ?? "");
  const [busy, setBusy] = useState(false);
  if (count.status !== "draft") {
    return count.note ? <Txt style={{ fontSize: 14 }}>Комментарий: {count.note}</Txt> : null;
  }
  const save = async () => {
    setBusy(true);
    try {
      onSaved(
        await api<StockCount>(`/admin/counts/${count.id}`, { method: "PATCH", body: { note } }),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Block>
      <Field
        label="Комментарий"
        placeholder="Например: витрина, склад, полка 3"
        value={note}
        onChangeText={setNote}
      />
      {note !== (count.note ?? "") && (
        <Button
          small
          kind="outline"
          title="Сохранить"
          loading={busy}
          onPress={() => void save()}
          style={{ alignSelf: "flex-start" }}
        />
      )}
    </Block>
  );
}

function CountRow({
  line,
  draft,
  highlight,
  disabled,
  onChange,
  onDelete,
}: {
  line: CountLine;
  draft: boolean;
  highlight: boolean;
  disabled: boolean;
  onChange: (counted: number) => void;
  onDelete: () => void;
}) {
  const [value, setValue] = useState(String(line.counted));
  const commit = () => {
    const n = Number(value);
    if (value !== "" && Number.isInteger(n) && n >= 0 && n !== line.counted) onChange(n);
    else setValue(String(line.counted));
  };
  const diff = line.expected === null ? null : line.counted - line.expected;
  return (
    <View style={[styles.line, highlight && { backgroundColor: colors.okSoft }]}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>{line.label}</Txt>
          {line.sku && <Muted style={{ fontSize: 12 }}>{line.sku}</Muted>}
        </View>
        {draft && (
          <Pressable
            accessibilityLabel="Убрать строку"
            disabled={disabled}
            onPress={onDelete}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
      <View style={styles.controls}>
        <Muted style={{ fontSize: 13 }}>
          В системе: {line.expected ?? "—"}
          {line.reserved ? ` (в заказах ${line.reserved})` : ""}
        </Muted>
        {draft ? (
          <View style={styles.inline}>
            <Muted style={{ fontSize: 12 }}>Посчитано</Muted>
            <TextInput
              value={value}
              editable={!disabled}
              keyboardType="number-pad"
              onChangeText={(t) => setValue(t.replace(/\D/g, ""))}
              onBlur={commit}
              onSubmitEditing={commit}
              style={styles.input}
              accessibilityLabel="Посчитано"
            />
          </View>
        ) : (
          <Txt style={{ fontSize: 14 }}>
            Посчитано: <Txt style={{ fontFamily: fonts.sansBold }}>{line.counted}</Txt>
          </Txt>
        )}
        <Txt
          style={{
            marginLeft: "auto",
            fontFamily: fonts.sansBold,
            color:
              diff === null || diff === 0 ? colors.muted : diff < 0 ? colors.danger : colors.ok,
          }}
        >
          {diff === null ? "" : diff > 0 ? `+${diff}` : diff}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderRadius: radius.sm,
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: {
    width: 64,
    height: 40,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    textAlign: "right",
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
});
