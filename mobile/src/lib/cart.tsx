import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { prefs } from "./storage";

const CART_KEY = "kyko.cart";

/** The cart lives on the phone; prices are always recalculated by the server (/cart/quote). */
export interface CartItem {
  variantId: number;
  quantity: number;
  // Snapshot for showing the cart before the quote arrives.
  productId: number;
  productName: string;
  brandName: string;
  volumeMl: number;
  isTester: boolean;
  imageUrl: string | null;
}

interface CartState {
  items: CartItem[];
  count: number;
  /** False until the saved cart has been read. */
  ready: boolean;
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: number, quantity: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  // The latest items, so quick taps in a row don't work on a stale copy.
  const current = useRef<CartItem[]>([]);

  useEffect(() => {
    prefs.get<CartItem[]>(CART_KEY, []).then((saved) => {
      const valid = Array.isArray(saved)
        ? saved.filter((i) => i && i.variantId && i.quantity > 0)
        : [];
      current.current = valid;
      setItems(valid);
      setReady(true);
    });
  }, []);

  const write = useCallback((next: CartItem[]) => {
    current.current = next;
    setItems(next);
    void prefs.set(CART_KEY, next);
  }, []);

  const add = useCallback<CartState["add"]>(
    (item, quantity = 1) => {
      const prev = current.current;
      const existing = prev.find((i) => i.variantId === item.variantId);
      write(
        existing
          ? prev.map((i) =>
              i.variantId === item.variantId ? { ...i, quantity: i.quantity + quantity } : i,
            )
          : [...prev, { ...item, quantity }],
      );
    },
    [write],
  );

  const setQuantity = useCallback(
    (variantId: number, quantity: number) => {
      const prev = current.current;
      write(
        quantity <= 0
          ? prev.filter((i) => i.variantId !== variantId)
          : prev.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)),
      );
    },
    [write],
  );

  const remove = useCallback(
    (variantId: number) => write(current.current.filter((i) => i.variantId !== variantId)),
    [write],
  );

  const clear = useCallback(() => write([]), [write]);

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
