import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { CatalogView } from "./catalog-view";

export const metadata: Metadata = { title: "Каталог" };

export default function CatalogPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CatalogView />
    </Suspense>
  );
}
