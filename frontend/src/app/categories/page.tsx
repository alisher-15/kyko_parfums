import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { CategoriesView } from "./categories-view";

export const metadata: Metadata = { title: "Категории" };

export default function CategoriesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CategoriesView />
    </Suspense>
  );
}
