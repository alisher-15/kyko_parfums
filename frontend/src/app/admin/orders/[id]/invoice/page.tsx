import { InvoiceView } from "./invoice-view";

export default async function OrderInvoicePage(props: PageProps<"/admin/orders/[id]/invoice">) {
  const { id } = await props.params;
  return <InvoiceView id={Number(id)} />;
}
