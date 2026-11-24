"use client";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { CreativeMaker } from "@/components/admin/CreativeMaker";

/** Banners and stories from the shop's templates, with the catalog's own bottles. */
export default function CreativesPage() {
  return (
    <div className="max-w-6xl space-y-4">
      <AdminHeader title="Баннеры и сторис" />
      <p className="max-w-3xl text-sm text-muted">
        Картинка по шаблону магазина: заголовок, плашка со скидкой, дата и до трёх настоящих флаконов
        из каталога. Баннер 1200×800 подходит для карточки акции на главной, сторис 1080×1920 — для
        Instagram и статуса в WhatsApp. Скачайте JPG или поставьте баннер в акцию прямо из её формы
        («Сделать по шаблону»).
      </p>
      <div className="card p-5">
        <CreativeMaker />
      </div>
    </div>
  );
}
