import { tenge } from "./format";

/**
 * Writing to an order's customer from the admin panel: WhatsApp with a ready message, or a call.
 * Kazakhstan numbers in any form («8 701…», «+7 701…», «701…») become 7XXXXXXXXXX. The same on
 * the website and in the app.
 */
export function phoneDigits(phone: string | null | undefined): string | null {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** A chat with the customer, the message typed in. */
export function customerChat(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export interface OrderForMessage {
  id: number;
  contact_name: string | null;
  net_total: number;
  delivery_city: string | null;
  delivery_address: string | null;
}

/** Ready messages for the usual moments of an order; the owner edits them in WhatsApp. */
export function orderMessages(o: OrderForMessage): { label: string; text: string }[] {
  const name = o.contact_name?.trim().split(/\s+/)[0];
  const hello = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
  const where = [o.delivery_city, o.delivery_address].filter(Boolean).join(", ");
  return [
    {
      label: "Заказ принят",
      text: `${hello} Это Kyko. Получили ваш заказ № ${o.id} на ${tenge(o.net_total)}. Подтверждаем наличие и срок — скоро напишем.`,
    },
    {
      label: "Заказ собран",
      text: `${hello} Ваш заказ № ${o.id} собран.${where ? ` Доставим по адресу: ${where}.` : ""} Когда вам удобно его получить?`,
    },
    {
      label: "Заказ отправлен",
      text: `${hello} Ваш заказ № ${o.id} передан в доставку. Если будут вопросы — пишите сюда.`,
    },
    { label: "Свой текст", text: `${hello} Это Kyko, по вашему заказу № ${o.id}.` },
  ];
}
