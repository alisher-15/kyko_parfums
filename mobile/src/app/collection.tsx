import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { CatalogView } from "@/components/catalog";
import type { ProductFilters } from "@/lib/queries";
import type { ProductSort } from "@/lib/types";

/**
 * Part of the catalog opened from somewhere else: a section tile, a brand, a promotion banner,
 * «Акции» or «Новинки» on the home screen. Search, filters and sort work on top of it.
 */
export default function CollectionScreen() {
  const params = useLocalSearchParams<{
    title?: string;
    brand_id?: string;
    category_id?: string;
    promotion_id?: string;
    on_sale?: string;
    is_new?: string;
    sort?: string;
  }>();

  const fixed = useMemo<ProductFilters>(() => {
    const f: ProductFilters = {};
    const brand = Number(params.brand_id);
    if (Number.isInteger(brand) && brand > 0) f.brand_id = [brand];
    const category = Number(params.category_id);
    if (Number.isInteger(category) && category > 0) f.category_id = category;
    const promotion = Number(params.promotion_id);
    if (Number.isInteger(promotion) && promotion > 0) f.promotion_id = promotion;
    if (params.on_sale === "true") f.on_sale = true;
    if (params.is_new === "true") f.is_new = true;
    if (params.sort) f.sort = params.sort as ProductSort;
    return f;
  }, [
    params.brand_id,
    params.category_id,
    params.promotion_id,
    params.on_sale,
    params.is_new,
    params.sort,
  ]);

  return (
    <>
      <Stack.Screen options={{ title: params.title || "Каталог" }} />
      <CatalogView fixed={fixed} />
    </>
  );
}
