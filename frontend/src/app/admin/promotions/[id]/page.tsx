import { PromotionEdit } from "./promotion-edit";

export default async function EditPromotionPage(props: PageProps<"/admin/promotions/[id]">) {
  const { id } = await props.params;
  return <PromotionEdit id={Number(id)} />;
}
