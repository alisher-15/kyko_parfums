"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm text-muted sm:px-6 md:grid-cols-3">
        <div>
          <div className="font-serif text-xl font-bold text-ink">
            Kyko <span className="text-gold">Parfums</span>
          </div>
          <p className="mt-2 max-w-xs">
            Оригинальная парфюмерия и косметика. Розничные и оптовые продажи.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-ink">Покупателям</span>
          <Link href="/catalog">Каталог</Link>
          <Link href="/brands">Бренды</Link>
          <Link href="/account/orders">Мои заказы</Link>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-ink">Оптовым клиентам</span>
          <p>
            Для получения оптовых цен зарегистрируйтесь и отправьте заявку в{" "}
            <Link href="/account" className="text-gold underline">
              личном кабинете
            </Link>
            . Статус присваивает менеджер.
          </p>
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-stone-400">
        © {new Date().getFullYear()} Kyko Parfums. Оплата по факту или переводом — онлайн-оплата
        появится позже.
      </div>
    </footer>
  );
}
