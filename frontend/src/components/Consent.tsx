import Link from "next/link";

/**
 * The checkbox a form can't be sent without: consent to the processing of personal data (the
 * Law of Kazakhstan «О персональных данных и их защите»), and on checkout the offer too.
 * The documents open in a new tab, so the form keeps what was typed.
 */
export function Consent({ offer = false }: { offer?: boolean }) {
  const doc = (href: string, text: string) => (
    <Link href={href} target="_blank" className="text-gold underline">
      {text}
    </Link>
  );
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" required className="mt-0.5 accent-gold" />
      <span>
        {offer && <>Принимаю условия {doc("/offer", "публичной оферты")} и даю </>}
        {!offer && <>Даю </>}
        согласие на обработку моих персональных данных в соответствии с{" "}
        {doc("/privacy", "политикой конфиденциальности")}
      </span>
    </label>
  );
}
