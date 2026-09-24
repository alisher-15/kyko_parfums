import { ProductView } from "./product-view";

export default async function ProductPage(props: PageProps<"/products/[id]">) {
  const { id } = await props.params;
  return <ProductView id={Number(id)} />;
}
