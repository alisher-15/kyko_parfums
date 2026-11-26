import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { CatalogView } from "@/components/catalog";
import type { ProductFilters } from "@/lib/queries";
import type { ProductSort } from "@/lib/types";

/**
 * Part of the catalog opened from somewhere else: a home screen block («Хиты продаж», «Тестеры»,
 * «Выбор Kyko», «Для неё», a budget…), a section, a brand or a promotion banner. Search, filters and sort work on top of it.
 */
export default function CollectionScreen() {
  const params = useLocalSearchParams<{
    title?: string;
    brand_id?: string;
    category_id?: string;
    /** A scent family («Цветочные»), from the home page's «Аромат по настроению». */
    family?: string;
    promotion_id?: string;
    on_sale?: string;
    is_new?: string;
    tester?: string;
    top?: string;
    gender?: string;
    min_price?: string;
    max_price?: string;
    sort?: string;
  }>();

  const fixed = useMemo<ProductFilters>(() => {
    const f: ProductFilters = {};
    const brand = Number(params.brand_id);
    if (Number.isInteger(brand) && brand > 0) f.brand_id = [brand];
    const category = Number(params.category_id);
    if (Number.isInteger(category) && category > 0) f.category_id = category;
    if (params.family) f.category = [params.family];
    const promotion = Number(params.promotion_id);
    if (Number.isInteger(promotion) && promotion > 0) f.promotion_id = promotion;
    if (params.on_sale === "true") f.on_sale = true;
    if (params.is_new === "true") f.is_new = true;
    if (params.tester === "true") f.tester = true;
    if (params.top === "true") f.top = true;
    if (params.gender) f.gender = [params.gender];
    const min = Number(params.min_price);
    if (params.min_price && Number.isFinite(min)) f.min_price = min;
    const max = Number(params.max_price);
    if (params.max_price && Number.isFinite(max)) f.max_price = max;
    if (params.sort) f.sort = params.sort as ProductSort;
    return f;
  }, [
    params.brand_id,
    params.category_id,
    params.family,
    params.promotion_id,
    params.on_sale,
    params.is_new,
    params.tester,
    params.top,
    params.gender,
    params.min_price,
    params.max_price,
    params.sort,
  ]);

  return (
    <>
      <Stack.Screen options={{ title: params.title || "Каталог" }} />
      <CatalogView fixed={fixed} />
    </>
  );
}
