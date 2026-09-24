import { ProductEdit } from "./product-edit";

export default async function EditProductPage(props: PageProps<"/admin/products/[id]">) {
  const { id } = await props.params;
  return <ProductEdit id={Number(id)} />;
}
