import { OrderView } from "./order-view";

export default async function OrderPage(props: PageProps<"/account/orders/[id]">) {
  const { id } = await props.params;
  const { created } = await props.searchParams;
  return <OrderView id={Number(id)} created={created === "1"} />;
}
