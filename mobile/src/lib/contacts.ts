/** How customers reach the shop (the same as the website's footer, frontend/src/lib/contacts.ts). */
export const CONTACTS = [
  {
    kind: "whatsapp",
    title: "WhatsApp",
    label: "+7 747 484 81 94",
    href: "https://wa.me/77474848194",
  },
  { kind: "telegram", title: "Telegram", label: "@KYK0_parfum", href: "https://t.me/KYK0_parfum" },
  {
    kind: "instagram",
    title: "Instagram",
    label: "@kyk0_parfum",
    href: "https://www.instagram.com/kyk0_parfum",
  },
] as const;

/** A WhatsApp link that opens a chat with a ready message, e.g. about a product. */
export function whatsappAbout(text: string): string {
  return `${CONTACTS[0].href}?text=${encodeURIComponent(text)}`;
}
