import type { Metadata } from "next";
import { CustomerOrder } from "@/components/CustomerOrder";

export const metadata: Metadata = { title: "Заказ", robots: { index: false, follow: false } };

/** An order placed without an account, opened by its link (`?key=…`, from checkout or the email). */
export default async function GuestOrderPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  const { key, created } = await props.searchParams;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <CustomerOrder
        id={Number(id)}
        guestKey={typeof key === "string" ? key : ""}
        created={created === "1"}
      />
    </div>
  );
}
