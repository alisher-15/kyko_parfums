import { ReceiptView } from "./receipt-view";

export default async function ReceiptPage(props: PageProps<"/admin/receipts/[id]">) {
  const { id } = await props.params;
  return <ReceiptView id={Number(id)} />;
}
