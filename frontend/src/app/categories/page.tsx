import type { Metadata } from "next";
import { CategoriesView } from "./categories-view";

export const metadata: Metadata = { title: "Категории" };

export default function CategoriesPage() {
  return <CategoriesView />;
}
