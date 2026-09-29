"use client";

import { useEffect, useState } from "react";
import { ErrorBox, Spinner, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type {
  TelegramCheck,
  TelegramLink,
  TelegramRecipient,
  TelegramState,
  TelegramTest,
} from "@/lib/types";
import { useApi } from "@/lib/use-api";

// While the links are open, the page itself looks for new «Старт» presses this often, this long.
const POLL_MS = 4000;
const POLL_FOR_MS = 5 * 60 * 1000;

type Message = { kind: "ok" | "error" | "info"; text: string };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const addedMessage = (added: TelegramRecipient[]): Message => ({
  kind: "ok",
  text: `Добавлено: ${added.map((r) => r.title).join(", ")}. Туда уже отправлено приветствие.`,
});

/**
 * Who gets a Telegram message about each new order on the site. The bot is made in @BotFather and
 * its token is set on the server once; the people and groups that get the messages are managed
 * here, so changing them needs no one but the admin.
 */
export function TelegramCard() {
  const { data, error, reload } = useApi<TelegramState>("/admin/telegram");
  return (
    <section className="card max-w-3xl space-y-4 p-5" aria-label="Уведомления в Telegram">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Уведомления в Telegram</h2>
        <p className="mt-1 text-sm text-muted">
          О каждом новом заказе с сайта бот пишет в Telegram: что заказали, сумма, контакты
          покупателя и ссылка на заказ в админке. Продажи в магазине не присылаются.
        </p>
      </div>
      {error ? (
        <ErrorBox>{error.message}</ErrorBox>
      ) : !data ? (
        <Spinner />
      ) : data.enabled ? (
        <Recipients state={data} reload={reload} />
      ) : (
        <Setup />
      )}
    </section>
  );
}

function Setup() {
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-xl bg-cream p-4 font-semibold">Бот ещё не подключён</div>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          В Telegram откройте <b>@BotFather</b>, отправьте <code>/newbot</code>, задайте имя
          (например, «Kyko Parfum заказы») и адрес бота, который кончается на bot. В ответ придёт
          токен: длинная строка с двоеточием.
        </li>
        <li>
          На Render в сервисе сайта откройте Environment, добавьте переменную{" "}
          <code>TELEGRAM_BOT_TOKEN</code> со значением токена и сохраните. Сайт перезапустится за
          пару минут.
        </li>
        <li>Обновите эту страницу и добавьте получателей.</li>
      </ol>
      <p className="text-muted">
        Токен даёт полный доступ к боту: не пересылайте его в чатах и не публикуйте.
      </p>
    </div>
  );
}

function Recipients({ state, reload }: { state: TelegramState; reload: () => void }) {
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Message | null>(null);

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
          reload();
        }
      } catch (e) {
        if (stopped) return;
        setMsg({ kind: "error", text: errorText(e) });
        setPolling(false);
        return;
      }
      if (Date.now() > deadline) setPolling(false);
      else timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [polling, reload]);

  const run = async (fn: () => Promise<Message | null>) => {
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

  const addRecipient = () =>
    run(async () => {
      setLink(await api<TelegramLink>("/admin/telegram/link", { body: {} }));
      setPolling(true);
      return null;
    });

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

  const sendTest = () =>
    run(async () => {
      const r = await api<TelegramTest>("/admin/telegram/test", { body: {} });
      if (r.failed.length) {
        return {
          kind: "error",
          text: `Не дошло: ${r.failed.join(", ")}. Скорее всего, бота заблокировали или удалили из группы: уберите получателя и добавьте заново.`,
        };
      }
      return { kind: "ok", text: "Тестовое сообщение отправлено, проверьте Telegram." };
    });

  const remove = (r: TelegramRecipient) => {
    if (!confirm(`Убрать «${r.title}»? Сообщения о заказах туда больше не придут.`)) return;
    return run(async () => {
      await api(`/admin/telegram/recipients/${r.id}`, { method: "DELETE" });
      reload();
      return { kind: "ok", text: `«${r.title}» больше не получает уведомления.` };
    });
  };

  return (
    <div className="space-y-4">
      {state.bot_username && (
        <div className="text-sm">
          Бот:{" "}
          <a
            href={`https://t.me/${state.bot_username}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-gold hover:underline"
          >
            @{state.bot_username}
          </a>
        </div>
      )}
      {state.error && (
        <ErrorBox>
          Telegram не отвечает: {state.error}. Если так и остаётся, проверьте переменную
          TELEGRAM_BOT_TOKEN на Render.
        </ErrorBox>
      )}

      <div>
        <div className="mb-2 text-sm font-semibold">Получают уведомления</div>
        {state.recipients.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {state.recipients.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="text-xs text-muted">добавлен {dateTime(r.created_at)}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm shrink-0"
                  disabled={busy}
                  onClick={() => remove(r)}
                >
                  Убрать
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl bg-cream p-4 text-sm">
            Пока никто не получает уведомления. Добавьте себя или группу менеджеров.
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          Сменился менеджер или телефон? Добавьте нового получателя и уберите старого, на сервере
          ничего менять не нужно.
        </p>
      </div>

      {link && (
        <div className="space-y-4 rounded-xl border border-gold/40 bg-cream p-4 text-sm">
          <p>
            Откройте ссылку там, где есть Telegram (на телефоне достаточно нажать на неё), и нажмите
            «Старт». Ссылку можно переслать сотруднику. Она действует {link.valid_hours}&nbsp;ч.
          </p>
          <LinkRow
            title="Человеку"
            hint="Сообщения придут в его чат с ботом."
            url={link.private_url}
          />
          <LinkRow
            title="В группу"
            hint="Выберите группу в Telegram: бот добавится в неё, и заказы увидят все её участники."
            url={link.group_url}
          />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted">
              {polling
                ? "Ждём нажатия «Старт»: новый получатель появится в списке сам."
                : "Уже нажали «Старт»? Нажмите «Проверить»."}
            </span>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={check}>
              Проверить
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setLink(null);
                setPolling(false);
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {msg &&
        (msg.kind === "ok" ? (
          <SuccessBox>{msg.text}</SuccessBox>
        ) : msg.kind === "error" ? (
          <ErrorBox>{msg.text}</ErrorBox>
        ) : (
          <p className="text-sm text-muted">{msg.text}</p>
        ))}

      <div className="flex flex-wrap gap-2">
        {!link && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={addRecipient}>
            Добавить получателя
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy || !state.recipients.length}
          onClick={sendTest}
        >
          Отправить тестовое сообщение
        </button>
      </div>
    </div>
  );
}

function LinkRow({ title, hint, url }: { title: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (an old browser, a page without https): the link is in the field to copy.
    }
  };
  return (
    <div>
      <div className="font-semibold">{title}</div>
      <div className="mb-1.5 text-xs text-muted">{hint}</div>
      <div className="flex flex-wrap gap-2">
        <input
          className="input w-full min-w-0 font-mono text-xs sm:w-auto sm:flex-1"
          readOnly
          value={url}
          aria-label={`Ссылка: ${title.toLowerCase()}`}
          onFocus={(e) => e.target.select()}
        />
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
          Открыть
        </a>
        <button type="button" className="btn btn-outline btn-sm" onClick={copy}>
          {copied ? "Скопировано" : "Скопировать"}
        </button>
      </div>
    </div>
  );
}
