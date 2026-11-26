/** How customers reach the shop: shown in the footer. */
export const CONTACTS = [
  { kind: "whatsapp", label: "+7 747 484 81 94", href: "https://wa.me/77474848194" },
  { kind: "telegram", label: "@KYK0_parfum", href: "https://t.me/KYK0_parfum" },
  { kind: "instagram", label: "@kyk0_parfum", href: "https://www.instagram.com/kyk0_parfum" },
] as const;

const WHATSAPP = CONTACTS[0].href;

/** A WhatsApp chat with the shop, with the first message typed in when `text` is given. */
export function whatsappLink(text?: string): string {
  return text ? `${WHATSAPP}?text=${encodeURIComponent(text)}` : WHATSAPP;
}

/** The shop's YouTube channel: how originals are checked and unboxed («100% оригинал»). */
export const YOUTUBE = "https://www.youtube.com/channel/UCdWg_wKqm7KHlkq_sIsr3Vw";
