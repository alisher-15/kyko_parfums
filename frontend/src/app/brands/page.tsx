import type { Metadata } from "next";
import { BrandsView } from "./brands-view";

export const metadata: Metadata = { title: "Бренды" };

export default function BrandsPage() {
  return <BrandsView />;
}
