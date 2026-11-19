import { useQueries } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { FlatList, useWindowDimensions } from "react-native";
import { ProductCard } from "@/components/product";
import { Button, EmptyState, Loader } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFavorites } from "@/lib/favorites";
import type { ProductDetail } from "@/lib/types";

/** Products marked with a heart, with today's prices for this customer. */
export default function FavoritesScreen() {
  const { ids, remove } = useFavorites();
  const { ready } = useAuth();
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const cardWidth = (Math.min(width, 1200) - 32 - 12 * (columns - 1)) / columns;

  const results = useQueries({
    queries: ids.map((id) => ({
      // The same key as the product screen, so both share one cached answer.
      queryKey: [`/products/${id}`, null],
      queryFn: () => api<ProductDetail>(`/products/${id}`),
      enabled: ready,
    })),
  });

  // A product removed from the catalog leaves the list by itself.
  const goneIds = results
    .map((r, i) => (r.error instanceof ApiError && r.error.status === 404 ? ids[i] : null))
    .filter((id): id is number => id !== null)
    .join(",");
  useEffect(() => {
    if (goneIds) goneIds.split(",").forEach((id) => remove(Number(id)));
  }, [goneIds, remove]);

  if (ids.length === 0) {
    return (
      <EmptyState
        icon="heart-outline"
        title="Пока пусто"
        text="Нажмите на сердечко у аромата, чтобы вернуться к нему позже."
        action={<Button title="Перейти в каталог" onPress={() => router.navigate("/catalog")} />}
      />
    );
  }

  const products = results.map((r) => r.data).filter((p): p is ProductDetail => !!p);
  const loading = results.some((r) => r.isPending);

  return (
    <FlatList
      key={columns}
      data={products}
      numColumns={columns}
      keyExtractor={(p) => String(p.id)}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
      ListFooterComponent={loading ? <Loader /> : undefined}
    />
  );
}
