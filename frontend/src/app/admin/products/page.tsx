import { ProductsAdmin } from "./products-admin";

export default async function AdminProductsPage(props: PageProps<"/admin/products">) {
  const sp = await props.searchParams;
  return (
    <ProductsAdmin
      initialNoVariants={sp.no_variants === "true"}
      initialBrandId={typeof sp.brand_id === "string" ? sp.brand_id : ""}
    />
  );
}
