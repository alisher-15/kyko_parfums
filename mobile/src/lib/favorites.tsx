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

const FAVORITES_KEY = "kyko.favorites";

/** Products the customer marked with a heart, newest first. Kept on the phone only. */
interface FavoritesState {
  ids: number[];
  has: (productId: number) => boolean;
  toggle: (productId: number) => void;
  remove: (productId: number) => void;
}

const FavoritesContext = createContext<FavoritesState | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>([]);
  const current = useRef<number[]>([]);

  useEffect(() => {
    prefs.get<number[]>(FAVORITES_KEY, []).then((saved) => {
      const valid = Array.isArray(saved) ? saved.filter((n) => Number.isInteger(n)) : [];
      current.current = valid;
      setIds(valid);
    });
  }, []);

  const write = useCallback((next: number[]) => {
    current.current = next;
    setIds(next);
    void prefs.set(FAVORITES_KEY, next);
  }, []);

  const toggle = useCallback(
    (productId: number) => {
      const prev = current.current;
      write(prev.includes(productId) ? prev.filter((i) => i !== productId) : [productId, ...prev]);
    },
    [write],
  );

  const remove = useCallback(
    (productId: number) => write(current.current.filter((i) => i !== productId)),
    [write],
  );

  const value = useMemo<FavoritesState>(() => {
    const set = new Set(ids);
    return { ids, has: (id) => set.has(id), toggle, remove };
  }, [ids, toggle, remove]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesState {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used inside <FavoritesProvider>");
  return ctx;
}
