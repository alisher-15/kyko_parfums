import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AdminScreen, Block, Toggle, confirm } from "@/components/admin/kit";
import { Button, Chip, Field, Loader, Muted, Notice, Txt } from "@/components/ui";
import type {
  PricingSettings,
  RateInfo,
  TelegramCheck,
  TelegramLink,
  TelegramRecipient,
  TelegramState,
  TelegramTest,
} from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/queries";
import type { PricingMode } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

export default function SettingsScreen() {
  return (
    <AdminScreen title="Настройки" area={null}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pricing />
          <Rate />
          <Telegram />
        </ScrollView>
      </KeyboardAvoidingView>
    </AdminScreen>
  );
}

// ---------- Prices, thresholds, discounts ----------

function Pricing() {
  const settings = useApi<PricingSettings>("/admin/settings/pricing");
  // Lives here: the form starts over with fresh data after saving.
  const [saved, setSaved] = useState(false);
  if (settings.error && !settings.data)
    return <Notice tone="error">{settings.error.message}</Notice>;
  if (!settings.data) return <Loader />;
  return (
    <PricingForm
      key={settings.data.updated_at ?? "new"}
      initial={settings.data}
      saved={saved}
      onSaved={() => {
        setSaved(true);
        void settings.refetch();
      }}
    />
  );
}

function PricingForm({
  initial,
  saved,
  onSaved,
}: {
  initial: PricingSettings;
  saved: boolean;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    mode: initial.mode,
    wholesale_min_order_amount: String(initial.wholesale_min_order_amount),
    bulk_min_order_amount: String(initial.bulk_min_order_amount),
    wholesale_min_item_qty: String(initial.wholesale_min_item_qty),
    bulk_min_item_qty: String(initial.bulk_min_item_qty),
    max_store_discount_percent: String(initial.max_store_discount_percent),
    show_next_tier: initial.show_next_tier,
    next_tier_terms: initial.next_tier_terms ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (text: string) => setForm({ ...form, [key]: text });
  const num = (s: string, empty: number) => Number(s.replace(/\s/g, "").replace(",", ".") || empty);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/admin/settings/pricing", {
        method: "PUT",
        body: {
          mode: form.mode,
          wholesale_min_order_amount: num(form.wholesale_min_order_amount, 0),
          bulk_min_order_amount: num(form.bulk_min_order_amount, 0),
          wholesale_min_item_qty: num(form.wholesale_min_item_qty, 1),
          bulk_min_item_qty: num(form.bulk_min_item_qty, 1),
          max_store_discount_percent: num(form.max_store_discount_percent, 0),
          show_next_tier: form.show_next_tier,
          next_tier_terms: form.next_tier_terms.trim() || null,
        },
      });
      // Every price shown in the app may follow the new rules.
      void queryClient.invalidateQueries();
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block title="Цены, пороги и скидки">
      <Muted style={{ fontSize: 13 }}>
        Роль покупателя определяет лучшую доступную ему цену, а порог — когда она применяется. Если
        порог не достигнут, заказ считается по рознице.
      </Muted>
      <Mode
        value="order_total"
        current={form.mode}
        onSelect={(mode) => setForm({ ...form, mode })}
        title="По сумме заказа"
        text="Оптовая цена на весь заказ, если его сумма (по оптовым ценам) не меньше порога."
      />
      <Mode
        value="item_quantity"
        current={form.mode}
        onSelect={(mode) => setForm({ ...form, mode })}
        title="По количеству единиц"
        text="Оптовая цена на позицию, если её количество в заказе не меньше порога."
      />
      {form.mode === "order_total" ? (
        <>
          <Field
            label="Опт: минимальная сумма, ₸"
            hint="0 — без порога"
            keyboardType="numeric"
            value={form.wholesale_min_order_amount}
            onChangeText={set("wholesale_min_order_amount")}
          />
          <Field
            label="Крупный опт: минимальная сумма, ₸"
            keyboardType="numeric"
            value={form.bulk_min_order_amount}
            onChangeText={set("bulk_min_order_amount")}
          />
        </>
      ) : (
        <>
          <Field
            label="Опт: минимум штук одной позиции"
            hint="1 — без порога"
            keyboardType="number-pad"
            value={form.wholesale_min_item_qty}
            onChangeText={set("wholesale_min_item_qty")}
          />
          <Field
            label="Крупный опт: минимум штук одной позиции"
            keyboardType="number-pad"
            value={form.bulk_min_item_qty}
            onChangeText={set("bulk_min_item_qty")}
          />
        </>
      )}
      <Toggle
        label="Показывать оптовикам цену крупного опта"
        hint="«Ваша следующая цена» с кнопкой «Запросить крупный опт». Рознице и гостям оптовые цены не видны никогда."
        value={form.show_next_tier}
        onChange={(v) => setForm({ ...form, show_next_tier: v })}
      />
      <Field
        label="Условия перехода на крупный опт (видят оптовики)"
        placeholder="Например: от 300 000 ₸ закупок в месяц."
        multiline
        value={form.next_tier_terms}
        onChangeText={set("next_tier_terms")}
      />
      <Field
        label="Максимальная скидка в магазине, %"
        hint="Сколько кассир может дать на позицию"
        keyboardType="decimal-pad"
        value={form.max_store_discount_percent}
        onChangeText={set("max_store_discount_percent")}
        testID="settings-max-discount"
      />
      {error && <Notice tone="error">{error}</Notice>}
      {saved && !error && (
        <Notice tone="success">Настройки сохранены — новые правила уже действуют.</Notice>
      )}
      <Button
        title="Сохранить"
        loading={busy}
        onPress={() => void submit()}
        testID="settings-save"
      />
      {initial.updated_at && (
        <Muted style={{ fontSize: 12 }}>Изменено {dateTime(initial.updated_at)}</Muted>
      )}
    </Block>
  );
}

function Mode({
  value,
  current,
  onSelect,
  title,
  text,
}: {
  value: PricingMode;
  current: PricingMode;
  onSelect: (mode: PricingMode) => void;
  title: string;
  text: string;
}) {
  const on = value === current;
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={on}
      onPress={() => onSelect(value)}
      style={[styles.mode, on && { borderColor: colors.gold, backgroundColor: colors.goldSoft }]}
    >
      <View style={[styles.radio, on && { borderColor: colors.gold }]}>
        {on && <View style={styles.radioDot} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontFamily: fonts.sansSemi }}>{title}</Txt>
        <Muted style={{ fontSize: 12 }}>{text}</Muted>
      </View>
    </Pressable>
  );
}

// ---------- Dollar rate ----------

const rateFormat = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const STEPS = [-10, -5, 5, 10];
const toNumber = (s: string): number => Number(s.replace(",", ".").trim());

type Message = { ok: boolean; text: string };

/**
 * The rate behind the ₸ / $ switch: the mig.kz rate plus the admin's shift of a few tenge. A rate
 * typed by hand only stands in while mig.kz has never answered.
 */
function Rate() {
  const rate = useApi<RateInfo>("/admin/currency");
  // Kept out here: the form starts over with the new rate, which would wipe the message.
  const [msg, setMsg] = useState<Message | null>(null);
  if (rate.error && !rate.data) return <Notice tone="error">{rate.error.message}</Notice>;
  if (!rate.data) return <Loader />;
  const r = rate.data;
  const key = [r.source_rate, r.adjustment, r.manual_rate, r.checked_at].join("|");
  return (
    <RateForm key={key} rate={r} onChanged={() => void rate.refetch()} msg={msg} setMsg={setMsg} />
  );
}

function RateForm({
  rate: r,
  onChanged,
  msg,
  setMsg,
}: {
  rate: RateInfo;
  onChanged: () => void;
  msg: Message | null;
  setMsg: (msg: Message | null) => void;
}) {
  const queryClient = useQueryClient();
  const [adjustment, setAdjustment] = useState(String(r.adjustment));
  const [manual, setManual] = useState(r.manual_rate === null ? "" : String(r.manual_rate));
  const [busy, setBusy] = useState(false);
  const fromMig = r.source_rate !== null;
  const adj = adjustment.trim() === "" ? 0 : toNumber(adjustment);
  const manualValue = fromMig || manual.trim() === "" ? null : toNumber(manual);
  const valid =
    Number.isFinite(adj) &&
    Math.abs(adj) <= 50 &&
    (manualValue === null || (Number.isFinite(manualValue) && manualValue > 0));
  const preview = r.source_rate !== null ? r.source_rate + adj : manualValue;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
      onChanged();
      // The shop's ₸ / $ switch reads the public rate.
      void queryClient.invalidateQueries({ queryKey: ["/currency"] });
    }
  };

  return (
    <Block title="Курс доллара">
      <Muted style={{ fontSize: 13 }}>
        Покупатели могут смотреть цены в долларах (₸ / $). Только для просмотра: заказ оформляется в
        тенге. Курс берётся с mig.kz раз в 3 часа, к нему прибавляется ваша поправка.
      </Muted>
      <View style={styles.now}>
        <Muted style={{ fontSize: 12 }}>Сейчас в магазине</Muted>
        <Txt style={{ fontFamily: fonts.sansBold, fontSize: 22 }}>
          {r.effective_rate !== null
            ? `1 $ = ${rateFormat.format(r.effective_rate)} ₸`
            : "курс не задан"}
        </Txt>
        <Muted style={{ fontSize: 12 }}>
          {r.source_rate !== null
            ? `mig.kz ${rateFormat.format(r.source_rate)} ₸ ${r.adjustment >= 0 ? "+" : "−"} ${rateFormat.format(Math.abs(r.adjustment))} ₸ поправка, получен ${r.source_updated_at ? dateTime(r.source_updated_at) : "—"}.`
            : r.manual_rate !== null
              ? "Указан вручную, пока mig.kz не ответил."
              : "С mig.kz курс ещё не получен. Без курса переключателя ₸ / $ нет."}
        </Muted>
      </View>
      <Button
        small
        kind="outline"
        icon="refresh"
        title="Обновить с mig.kz сейчас"
        disabled={busy}
        onPress={() =>
          void run(() => api("/admin/currency/refresh", { body: {} }), "Курс обновлён с mig.kz")
        }
      />
      {r.source_error && (
        <Notice tone="warn">
          Последнее обновление не удалось: {r.source_error}.{" "}
          {r.source_rate !== null
            ? "Пока используется последний полученный курс."
            : "Введите курс вручную ниже."}
        </Notice>
      )}
      <Field
        label="Поправка, ₸"
        hint="От −50 до +50. Прибавляется к курсу mig.kz при каждом обновлении."
        keyboardType="numbers-and-punctuation"
        value={adjustment}
        onChangeText={(t) => setAdjustment(t.replace(/[^\d.,-]/g, ""))}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {STEPS.map((s) => (
          <Chip
            key={s}
            label={s > 0 ? `+${s}` : `−${-s}`}
            onPress={() =>
              setAdjustment(String(Math.round(((Number.isFinite(adj) ? adj : 0) + s) * 100) / 100))
            }
          />
        ))}
        <Chip label="0" onPress={() => setAdjustment("0")} />
      </View>
      {!fromMig && (
        <Field
          label="Курс вручную, ₸"
          hint="Нужен, только пока mig.kz не дал ни одного курса. Как только mig.kz ответит, магазин перейдёт на его курс с поправкой."
          placeholder="например, 505"
          keyboardType="decimal-pad"
          value={manual}
          onChangeText={(t) => setManual(t.replace(/[^\d.,]/g, ""))}
        />
      )}
      <Txt style={{ fontSize: 14 }}>
        После сохранения:{" "}
        <Text style={{ fontFamily: fonts.sansBold }}>
          {preview !== null && valid ? `1 $ = ${rateFormat.format(preview)} ₸` : "—"}
        </Text>
      </Txt>
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
      <Button
        title="Сохранить курс"
        disabled={busy || !valid}
        onPress={() =>
          void run(
            () =>
              api("/admin/currency", {
                method: "PUT",
                body: { adjustment: adj, manual_rate: manualValue },
              }),
            "Курс сохранён",
          )
        }
      />
    </Block>
  );
}

// ---------- Telegram ----------

// While the links are open, the app looks for new «Старт» presses this often, this long.
const POLL_MS = 4000;
const POLL_FOR_MS = 5 * 60 * 1000;

type TgMessage = { kind: "ok" | "error" | "info"; text: string };

const addedMessage = (added: TelegramRecipient[]): TgMessage => ({
  kind: "ok",
  text: `Добавлено: ${added.map((r) => r.title).join(", ")}. Туда уже отправлено приветствие.`,
});

/** Who gets a Telegram message about each new online order. */
function Telegram() {
  const state = useApi<TelegramState>("/admin/telegram");
  return (
    <Block title="Уведомления в Telegram">
      <Muted style={{ fontSize: 13 }}>
        О каждом новом заказе с сайта и из приложения бот пишет в Telegram: что заказали, сумма,
        контакты и ссылка на заказ. Продажи в магазине не присылаются.
      </Muted>
      {state.error && !state.data ? (
        <Notice tone="error">{state.error.message}</Notice>
      ) : !state.data ? (
        <Loader />
      ) : state.data.enabled ? (
        <Recipients state={state.data} reload={() => void state.refetch()} />
      ) : (
        <View style={{ gap: 8 }}>
          <View style={styles.now}>
            <Txt style={{ fontFamily: fonts.sansSemi }}>Бот ещё не подключён</Txt>
          </View>
          <Muted style={{ fontSize: 13 }}>
            1. В Telegram откройте @BotFather, отправьте /newbot, задайте имя и адрес бота
            (кончается на bot). В ответ придёт токен.{"\n"}2. На сервере магазина добавьте
            переменную окружения TELEGRAM_BOT_TOKEN с этим токеном и перезапустите сайт.{"\n"}3.
            Вернитесь сюда и добавьте получателей.
          </Muted>
          <Muted style={{ fontSize: 12 }}>
            Токен даёт полный доступ к боту: не пересылайте его в чатах.
          </Muted>
        </View>
      )}
    </Block>
  );
}

function Recipients({ state, reload }: { state: TelegramState; reload: () => void }) {
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<TgMessage | null>(null);
  // A new function every render: kept in a ref so the polling below doesn't restart.
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  // While the links are shown, whoever presses «Старт» shows up in the list by itself.
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + POLL_FOR_MS;
    const tick = async () => {
      try {
        const r = await api<TelegramCheck>("/admin/telegram/check", { body: {} });
        if (stopped) return;
        if (r.added.length) {
          setMsg(addedMessage(r.added));
          reloadRef.current();
        }
      } catch (e) {
        if (stopped) return;
        setMsg({ kind: "error", text: errorText(e) });
        setPolling(false);
        return;
      }
      if (Date.now() > deadline) setPolling(false);
      else timer = setTimeout(() => void tick(), POLL_MS);
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [polling]);

  const run = async (fn: () => Promise<TgMessage | null>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const check = () =>
    run(async () => {
      const r = await api<TelegramCheck>("/admin/telegram/check", { body: {} });
      if (!r.added.length) {
        return {
          kind: "info",
          text: "Новых нажатий «Старт» пока нет. Откройте ссылку, нажмите «Старт» и проверьте ещё раз.",
        };
      }
      reload();
      return addedMessage(r.added);
    });

  const remove = async (r: TelegramRecipient) => {
    if (
      !(await confirm(
        `Убрать «${r.title}»?`,
        "Сообщения о заказах туда больше не придут.",
        "Убрать",
      ))
    )
      return;
    await run(async () => {
      await api(`/admin/telegram/recipients/${r.id}`, { method: "DELETE" });
      reload();
      return { kind: "ok", text: `«${r.title}» больше не получает уведомления.` };
    });
  };

  return (
    <View style={{ gap: 12 }}>
      {state.bot_username && (
        <Txt style={{ fontSize: 14 }}>
          Бот:{" "}
          <Text
            style={{ color: colors.goldDark, fontFamily: fonts.sansSemi }}
            onPress={() => void Linking.openURL(`https://t.me/${state.bot_username}`)}
          >
            @{state.bot_username}
          </Text>
        </Txt>
      )}
      {state.error && (
        <Notice tone="error">
          Telegram не отвечает: {state.error}. Если так и остаётся, проверьте TELEGRAM_BOT_TOKEN на
          сервере.
        </Notice>
      )}
      <Txt style={{ fontFamily: fonts.sansSemi }}>Получают уведомления</Txt>
      {state.recipients.length ? (
        state.recipients.map((r) => (
          <View key={r.id} style={styles.recipient}>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: fonts.sansMedium }} numberOfLines={1}>
                {r.title}
              </Txt>
              <Muted style={{ fontSize: 12 }}>добавлен {dateTime(r.created_at)}</Muted>
            </View>
            <Button
              small
              kind="outline"
              title="Убрать"
              disabled={busy}
              onPress={() => void remove(r)}
            />
          </View>
        ))
      ) : (
        <View style={styles.now}>
          <Txt style={{ fontSize: 14 }}>
            Пока никто не получает уведомления. Добавьте себя или группу менеджеров.
          </Txt>
        </View>
      )}

      {link && (
        <View style={styles.link}>
          <Txt style={{ fontSize: 13 }}>
            Откройте ссылку там, где есть Telegram, и нажмите «Старт». Ссылку можно переслать
            сотруднику. Она действует {link.valid_hours} ч.
          </Txt>
          <LinkRow
            title="Человеку"
            hint="Сообщения придут в его чат с ботом."
            url={link.private_url}
          />
          <LinkRow
            title="В группу"
            hint="Выберите группу: бот добавится в неё, и заказы увидят все её участники."
            url={link.group_url}
          />
          <Muted style={{ fontSize: 12 }}>
            {polling
              ? "Ждём нажатия «Старт»: новый получатель появится в списке сам."
              : "Уже нажали «Старт»? Нажмите «Проверить»."}
          </Muted>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              small
              kind="outline"
              title="Проверить"
              disabled={busy}
              onPress={() => void check()}
            />
            <Button
              small
              kind="ghost"
              title="Закрыть"
              onPress={() => {
                setLink(null);
                setPolling(false);
              }}
            />
          </View>
        </View>
      )}

      {msg && (
        <Notice tone={msg.kind === "ok" ? "success" : msg.kind === "error" ? "error" : "info"}>
          {msg.text}
        </Notice>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {!link && (
          <Button
            title="Добавить получателя"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                setLink(await api<TelegramLink>("/admin/telegram/link", { body: {} }));
                setPolling(true);
                return null;
              })
            }
          />
        )}
        <Button
          kind="outline"
          title="Тестовое сообщение"
          disabled={busy || !state.recipients.length}
          onPress={() =>
            void run(async () => {
              const r = await api<TelegramTest>("/admin/telegram/test", { body: {} });
              if (r.failed.length) {
                return {
                  kind: "error",
                  text: `Не дошло: ${r.failed.join(", ")}. Скорее всего, бота заблокировали или удалили из группы: уберите получателя и добавьте заново.`,
                };
              }
              return { kind: "ok", text: "Тестовое сообщение отправлено, проверьте Telegram." };
            })
          }
        />
      </View>
    </View>
  );
}

function LinkRow({ title, hint, url }: { title: string; hint: string; url: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt style={{ fontFamily: fonts.sansSemi }}>{title}</Txt>
      <Muted style={{ fontSize: 12 }}>{hint}</Muted>
      <Text selectable style={styles.url} numberOfLines={2}>
        {url}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          small
          kind="gold"
          icon="paper-plane-outline"
          title="Открыть"
          onPress={() => void Linking.openURL(url)}
        />
        <Button
          small
          kind="outline"
          icon="share-outline"
          title="Переслать"
          onPress={() => void Share.share(Platform.OS === "ios" ? { url } : { message: url })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mode: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold },
  now: { backgroundColor: colors.cream, borderRadius: radius.md, padding: 12, gap: 4 },
  recipient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 10,
  },
  link: {
    gap: 10,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.cream,
    borderRadius: radius.md,
    padding: 12,
  },
  url: {
    fontSize: 12,
    color: colors.ink,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 8,
  },
});
