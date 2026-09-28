import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { ProductsAdmin } from "./products-admin";

// The search, filters and page live in the URL and are read on the client (see ProductsAdmin).
export default function AdminProductsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProductsAdmin />
    </Suspense>
  );
}
