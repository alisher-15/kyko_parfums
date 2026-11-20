import { CustomerOrder } from "@/components/CustomerOrder";

export default async function OrderPage(props: PageProps<"/account/orders/[id]">) {
  const { id } = await props.params;
  const { created } = await props.searchParams;
  return <CustomerOrder id={Number(id)} created={created === "1"} />;
}
