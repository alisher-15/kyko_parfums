import { CountView } from "./count-view";

export default async function CountPage(props: PageProps<"/admin/inventory/[id]">) {
  const { id } = await props.params;
  return <CountView id={Number(id)} />;
}
