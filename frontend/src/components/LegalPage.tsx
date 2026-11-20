import type { ReactNode } from "react";
import { LEGAL_EDITION, SELLER } from "@/lib/legal";

/** A value of the seller's details, or a highlighted gap while it isn't filled in. */
export function Detail({ value, missing }: { value: string; missing: string }) {
  return value ? <>{value}</> : <mark className="bg-amber-100 px-1">[{missing}]</mark>;
}

export function SellerDetails() {
  return (
    <ul className="list-none space-y-1 pl-0">
      <li>
        Продавец: <Detail value={SELLER.name} missing="наименование ИП или ТОО" />
      </li>
      <li>
        ИИН/БИН: <Detail value={SELLER.idNumber} missing="ИИН или БИН" />
      </li>
      <li>
        Адрес: <Detail value={SELLER.address} missing="юридический адрес" />
      </li>
      <li>
        Email: <Detail value={SELLER.email} missing="email" />, телефон:{" "}
        <Detail value={SELLER.phone} missing="телефон" />
      </li>
    </ul>
  );
}

/** A document page: the title, its edition, and the text in readable widths. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="font-serif text-4xl font-bold">{title}</h1>
      <p className="text-sm text-muted">Редакция от {LEGAL_EDITION}</p>
      {children}
    </article>
  );
}
