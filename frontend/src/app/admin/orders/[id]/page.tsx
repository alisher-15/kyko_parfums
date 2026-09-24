import { OrderAdmin } from "./order-admin";

export default async function AdminOrderPage(props: PageProps<"/admin/orders/[id]">) {
  const { id } = await props.params;
  return <OrderAdmin id={Number(id)} />;
}
