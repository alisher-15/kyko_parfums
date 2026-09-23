import type { OrderStatus } from "@/lib/types";
import { OrdersAdmin } from "./orders-admin";

export default async function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  const sp = await props.searchParams;
  return <OrdersAdmin initialStatus={typeof sp.status === "string" ? (sp.status as OrderStatus) : ""} />;
}
