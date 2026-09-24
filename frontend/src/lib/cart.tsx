"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const CART_KEY = "kyko.cart";

/** The cart lives in the browser; prices are always recalculated by the server (/cart/quote). */
export interface CartItem {
  variantId: number;
  quantity: number;
  // Snapshot for rendering the cart before the quote arrives.
  productId: number;
  productName: string;
  brandName: string;
  volumeMl: number;
  imageUrl: string | null;
}

interface CartState {
  items: CartItem[];
  count: number;
  /** False during server render / hydration, when localStorage is not readable yet. */
  ready: boolean;
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: number, quantity: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
}

// ---------- localStorage-backed store ----------

const EMPTY: CartItem[] = [];
const listeners = new Set<() => void>();
let cache: CartItem[] | null = null;

function load(): CartItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CART_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((i) => i && i.variantId && i.quantity > 0) : [];
  } catch {
    return [];
  }
}

function getSnapshot(): CartItem[] {
  cache ??= load();
  return cache;
}

function write(items: CartItem[]): void {
  cache = items;
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // storage unavailable — the cart still works for this page view
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Other tabs.
  const onStorage = (e: StorageEvent) => {
    if (e.key === CART_KEY) {
      cache = load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const noopSubscribe = () => () => {};

// ---------- React API ----------

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const add = useCallback<CartState["add"]>((item, quantity = 1) => {
    const prev = getSnapshot();
    const existing = prev.find((i) => i.variantId === item.variantId);
    write(
      existing
        ? prev.map((i) =>
            i.variantId === item.variantId ? { ...i, quantity: i.quantity + quantity } : i,
          )
        : [...prev, { ...item, quantity }],
    );
  }, []);

  const setQuantity = useCallback((variantId: number, quantity: number) => {
    const prev = getSnapshot();
    write(
      quantity <= 0
        ? prev.filter((i) => i.variantId !== variantId)
        : prev.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)),
    );
  }, []);

  const remove = useCallback((variantId: number) => {
    write(getSnapshot().filter((i) => i.variantId !== variantId));
  }, []);

  const clear = useCallback(() => write([]), []);

  const value = useMemo<CartState>(
    () => ({
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      ready,
      add,
      setQuantity,
      remove,
      clear,
    }),
    [items, ready, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
