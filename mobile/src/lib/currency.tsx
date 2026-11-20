import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { tenge } from "./format";
import { useApi } from "./queries";
import { prefs } from "./storage";
import type { CurrencyInfo } from "./types";

/**
 * Prices are stored and charged in tenge. The customer may look at them in dollars (₸ / $ on the
 * home screen and in the profile), converted at the shop's rate, for viewing only. Orders always
 * show tenge, like the website's account pages.
 */
export type Currency = "KZT" | "USD";

const KEY = "kyko.currency";
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

interface CurrencyState {
  currency: Currency;
  /** Tenge per dollar; null while the shop has no rate (then everything stays in tenge). */
  rate: number | null;
  setCurrency: (currency: Currency) => void;
  /** A price in the chosen currency. Takes tenge. */
  money: (value: number | null | undefined) => string;
}

const CurrencyContext = createContext<CurrencyState | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Currency>("KZT");
  const { data } = useApi<CurrencyInfo>("/currency", undefined, { staleTime: 15 * 60_000 });
  const rate = data?.usd_rate ?? null;
  const currency: Currency = stored === "USD" && rate ? "USD" : "KZT";

  useEffect(() => {
    prefs.get<Currency>(KEY, "KZT").then((c) => setStored(c === "USD" ? "USD" : "KZT"));
  }, []);

  const setCurrency = useCallback((next: Currency) => {
    setStored(next);
    void prefs.set(KEY, next);
  }, []);

  const value = useMemo<CurrencyState>(
    () => ({
      currency,
      rate,
      setCurrency,
      money: (v) =>
        currency === "USD" && rate && v !== null && v !== undefined
          ? dollars.format(v / rate)
          : tenge(v),
    }),
    [currency, rate, setCurrency],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyState {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside <CurrencyProvider>");
  return ctx;
}
