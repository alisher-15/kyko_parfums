import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api, type Query } from "./api";
import { useAuth } from "./auth";
import type { CartItem } from "./cart";
import type { Page, ProductListItem, ProductSort, Quote } from "./types";

/**
 * A GET request through React Query. It waits until the saved session is read, so the first
 * response already has the customer's prices; `path = null` skips the request.
 */
export function useApi<T>(
  path: string | null,
  query?: Query,
  options?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn">,
) {
  const { ready } = useAuth();
  const { enabled = true, ...rest } = options ?? {};
  return useQuery<T>({
    ...rest,
    queryKey: [path, query ?? null],
    queryFn: () => api<T>(path as string, { query }),
    enabled: ready && path !== null && enabled === true,
  });
}

export interface ProductFilters {
  q?: string;
  brand_id?: number[];
  gender?: string[];
  category?: string[];
  type?: string[];
  min_price?: number;
  max_price?: number;
  is_new?: boolean;
  on_sale?: boolean;
  promotion_id?: number;
  sort?: ProductSort;
}

const PAGE_SIZE = 24;

/** The catalog, page after page as the customer scrolls. */
export function useProducts(filters: ProductFilters) {
  const { ready } = useAuth();
  return useInfiniteQuery({
    queryKey: ["/products", "infinite", filters],
    queryFn: ({ pageParam }) =>
      api<Page<ProductListItem>>("/products", {
        query: { ...filters, page: pageParam, page_size: PAGE_SIZE },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}

/** The server's prices for the cart: tiers, promotions, hints and the total. */
export function useQuote(items: CartItem[]) {
  const { ready } = useAuth();
  const body = items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity }));
  return useQuery({
    queryKey: ["/cart/quote", body],
    queryFn: () => api<Quote>("/cart/quote", { body: { items: body } }),
    enabled: ready && body.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** An admin list (orders, users, products, receipts…), page after page as staff scroll. */
export function usePages<T>(path: string, query: Query = {}, pageSize = 30) {
  const { ready } = useAuth();
  return useInfiniteQuery({
    queryKey: [path, "pages", query],
    queryFn: ({ pageParam }) =>
      api<Page<T>>(path, { query: { ...query, page: pageParam, page_size: pageSize } }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}
