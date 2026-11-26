"use client";

import { usePathname } from "next/navigation";
import { whatsappLink } from "@/lib/contacts";
import { absoluteUrl } from "@/lib/site";
import { WhatsAppIcon } from "./icons";

/**
 * WhatsApp on every page of the shop, in the corner: orders, payment and delivery are agreed
 * there. On a product page the first message carries the product's link. Not in the admin panel.
 */
export function WhatsAppButton() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  const text = pathname.startsWith("/products/")
    ? `Здравствуйте! Вопрос про этот аромат: ${absoluteUrl(pathname)}`
    : "Здравствуйте! У меня вопрос";
  return (
    <a
      href={whatsappLink(text)}
      target="_blank"
      rel="noopener"
      aria-label="Написать в WhatsApp"
      title="Написать в WhatsApp"
      className="whatsapp-float fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white text-[#1fa855] shadow-lg shadow-[#2a070e]/15 transition hover:scale-105 md:right-6 md:bottom-6 md:h-13 md:w-13"
    >
      <WhatsAppIcon width={28} height={28} />
    </a>
  );
}
