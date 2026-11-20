import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CONTACTS } from "@/lib/contacts";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
  description: "Какие данные покупателей получает Kyko Parfum, зачем, кому их передаёт и как их удалить.",
};

/**
 * The shop's legal details. Fill them in before publishing the app: the App Store and Google
 * Play link to this page, and the law expects the operator of personal data to be named.
 */
const OPERATOR = {
  // e.g. "ИП Иванов Иван Иванович" or "ТОО «Kyko»"
  name: "",
  // БИН / ИИН
  bin: "",
  email: "",
};

const UPDATED = "20 ноября 2026 г.";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      <div className="space-y-3 leading-relaxed text-stone-700">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  const operator = OPERATOR.name
    ? `${OPERATOR.name}${OPERATOR.bin ? `, БИН/ИИН ${OPERATOR.bin}` : ""}`
    : null;
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="font-serif text-4xl font-bold">Политика конфиденциальности</h1>
        <p className="text-sm text-muted">Действует с {UPDATED}</p>
        <p className="leading-relaxed text-stone-700">
          Здесь описано, какие данные покупателей получает магазин Kyko Parfum на сайте и в
          мобильном приложении, зачем они нужны, кому передаются и как их изменить или удалить.
          Мы обрабатываем персональные данные в соответствии с Законом Республики Казахстан «О
          персональных данных и их защите».
        </p>
      </header>

      <Section title="Кто обрабатывает данные">
        <p>
          Магазин Kyko Parfum{operator ? ` (${operator})` : ""}. Вопросы о данных можно задать по
          контактам в конце страницы.
        </p>
      </Section>

      <Section title="Какие данные мы получаем">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Аккаунт:</b> email и пароль. Пароль хранится только в зашифрованном виде (хэш), его
            не видят даже сотрудники магазина. Имя и телефон — по желанию.
          </li>
          <li>
            <b>Заявка на оптовые цены:</b> название компании, телефон и комментарий.
          </li>
          <li>
            <b>Заказ:</b> имя, телефон, email, город и адрес доставки, комментарий, товары и сумма.
            Покупки в нашем магазине тоже могут быть привязаны к вашему аккаунту.
          </li>
          <li>
            <b>Технические данные:</b> журналы сервера с IP-адресом, временем и адресом запроса —
            чтобы защищаться от взлома и находить ошибки. Сообщения об ошибках приходят без ваших
            данных.
          </li>
          <li>
            <b>На вашем устройстве:</b> сайт хранит в браузере вход в аккаунт, корзину и выбранную
            валюту; приложение хранит вход в защищённом хранилище телефона, а корзину, избранное и
            валюту — в памяти приложения. Эти данные не уходят на сервер, пока вы не оформите
            заказ.
          </li>
          <li>
            <b>Статистика посещений:</b> если на сайте включены Яндекс Метрика или Google
            Analytics, они получают обезличенные сведения о просмотренных страницах каталога с
            помощью cookies. Личный кабинет и оформление заказа не отслеживаются, запись экрана
            выключена. В приложении такой статистики нет.
          </li>
        </ul>
        <p>Платёжных данных мы не получаем: онлайн-оплаты пока нет.</p>
      </Section>

      <Section title="Зачем">
        <ul className="list-disc space-y-2 pl-5">
          <li>принять, собрать и доставить заказ, связаться с вами по нему;</li>
          <li>показать цены вашего уровня и рассмотреть заявку на оптовые цены;</li>
          <li>отправлять письма о заказе и ссылку для восстановления пароля;</li>
          <li>защищать аккаунты (например, от подбора пароля);</li>
          <li>вести учёт продаж, как того требует закон.</li>
        </ul>
        <p>Рекламных рассылок без вашего согласия мы не отправляем.</p>
      </Section>

      <Section title="Кому передаём">
        <p>Мы не продаём и не передаём ваши данные для чужой рекламы. Их получают только:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            сотрудники магазина — через админ-панель и уведомления о новых заказах в Telegram (имя,
            телефон, адрес и состав заказа);
          </li>
          <li>курьер или служба доставки — только то, что нужно для доставки;</li>
          <li>
            хостинг, на котором работают сайт и база данных, и почтовый сервис, через который
            уходят письма, — для хранения и отправки, без права использовать данные для себя;
          </li>
          <li>государственные органы — только по требованию закона.</li>
        </ul>
      </Section>

      <Section title="Сколько храним">
        <p>
          Данные аккаунта — пока он существует. Когда вы удаляете аккаунт, email, имя, телефон,
          название компании и заявка на опт удаляются сразу. Заказы остаются: это документы о
          продажах, мы храним их со сведениями, указанными при оформлении, столько, сколько
          требует законодательство.
        </p>
      </Section>

      <Section title="Ваши права">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Узнать и исправить</b> свои данные — в{" "}
            <Link href="/account" className="text-gold underline">
              личном кабинете
            </Link>{" "}
            или в профиле приложения.
          </li>
          <li>
            <b>Удалить аккаунт</b> — в личном кабинете на сайте («Удалить аккаунт» под сменой
            пароля) или в приложении: Профиль → Удалить аккаунт. Понадобится пароль.
          </li>
          <li>
            <b>Задать вопрос или отозвать согласие</b> — написать нам по любому контакту ниже.
          </li>
        </ul>
      </Section>

      <Section title="Как защищаем">
        <p>
          Сайт и приложение работают только по защищённому соединению (HTTPS). Пароли хранятся в
          виде хэша, вход защищён от подбора, в приложении сессия хранится в защищённом хранилище
          телефона. Доступ к данным покупателей есть только у сотрудников магазина.
        </p>
      </Section>

      <Section title="Изменения">
        <p>
          Если мы изменим эту политику, новая редакция появится на этой странице с новой датой.
        </p>
      </Section>

      <Section title="Контакты">
        <ul className="space-y-1">
          {OPERATOR.email && (
            <li>
              Email:{" "}
              <a href={`mailto:${OPERATOR.email}`} className="text-gold underline">
                {OPERATOR.email}
              </a>
            </li>
          )}
          {CONTACTS.map((c) => (
            <li key={c.kind}>
              {c.kind === "whatsapp" ? "WhatsApp" : c.kind === "telegram" ? "Telegram" : "Instagram"}:{" "}
              <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-gold underline">
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </article>
  );
}
