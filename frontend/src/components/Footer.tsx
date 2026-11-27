"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { InstagramIcon, TelegramIcon, WhatsAppIcon } from "@/components/icons";
import { CONTACTS } from "@/lib/contacts";
import { photo } from "@/lib/images";

const CONTACT_ICONS = { whatsapp: WhatsAppIcon, telegram: TelegramIcon, instagram: InstagramIcon };
const CONTACT_NAMES = { whatsapp: "WhatsApp", telegram: "Telegram", instagram: "Instagram" };

export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    // The jewel box's velvet, as the header.
    <footer className="velvet mt-16 text-pearl">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm text-nacre-muted sm:px-6 md:grid-cols-4">
        <div>
          <img {...photo("/logo-pearl-light.png", 105)} alt="Kyko" width={105} height={28} className="h-7 w-auto" />
          <p className="mt-2 max-w-xs">
            Оригинальная парфюмерия и косметика. Розничные и оптовые продажи.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-pearl">Покупателям</span>
          <Link href="/catalog">Каталог</Link>
          <Link href="/categories">Категории</Link>
          <Link href="/brands">Бренды</Link>
          <Link href="/account/orders">Мои заказы</Link>
          <Link href="/offer">Публичная оферта</Link>
          <Link href="/privacy">Политика конфиденциальности</Link>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-pearl">Оптовым клиентам</span>
          <p>
            Для получения оптовых цен зарегистрируйтесь и отправьте заявку в{" "}
            <Link href="/account" className="text-nacre underline">
              личном кабинете
            </Link>
            . Статус присваивает менеджер.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-pearl">Связаться с нами</span>
          {CONTACTS.map((c) => {
            const ContactIcon = CONTACT_ICONS[c.kind];
            return (
              <a
                key={c.kind}
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${CONTACT_NAMES[c.kind]}: ${c.label}`}
                className="flex items-center gap-2 hover:text-white"
              >
                <ContactIcon className="shrink-0 text-nacre" />
                {c.label}
              </a>
            );
          })}
        </div>
      </div>
      <div className="border-t border-white/15 py-4 text-center text-xs text-nacre-muted">
        {/* The page is built once: in a new year the client's year differs from the built one. */}
        © <span suppressHydrationWarning>{new Date().getFullYear()}</span> Kyko. Оплата по факту или переводом — онлайн-оплата
        появится позже.
      </div>
    </footer>
  );
}
