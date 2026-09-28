"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { money as tenge } from "./format";
import type { CurrencyInfo } from "./types";
import { useApi } from "./use-api";

/**
 * Prices are stored and charged in tenge. The visitor may look at them in dollars (a switch in
 * the header, remembered in the browser): converted at the shop's rate, for viewing only.
 * Orders, the account and the admin panel always show tenge.
 */
export type Currency = "KZT" | "USD";

const KEY = "kyko.currency";
const listeners = new Set<() => void>();

function read(): Currency {
  try {
    return window.localStorage.getItem(KEY) === "USD" ? "USD" : "KZT";
  } catch {
    return "KZT";
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

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
  const stored = useSyncExternalStore(subscribe, read, () => "KZT" as Currency);
  const { data } = useApi<CurrencyInfo>("/currency");
  const rate = data?.usd_rate ?? null;
  const currency: Currency = stored === "USD" && rate ? "USD" : "KZT";

  const setCurrency = useCallback((next: Currency) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // storage unavailable: the switch still works until the page is reloaded
    }
    listeners.forEach((l) => l());
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

/** ₸ / $ in the header. Hidden while the shop has no rate. */
export function CurrencySwitch({ className = "" }: { className?: string }) {
  const { currency, rate, setCurrency } = useCurrency();
  if (!rate) return null;
  return (
    <div
      role="group"
      aria-label="Валюта"
      title={`Курс: 1 $ = ${Number(rate.toFixed(2))} ₸`}
      className={`inline-flex rounded-full border border-line bg-white p-0.5 text-sm font-semibold ${className}`}
    >
      {(["KZT", "USD"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCurrency(c)}
          aria-pressed={currency === c}
          aria-label={c === "KZT" ? "Цены в тенге" : "Цены в долларах"}
          className={`h-7 w-8 rounded-full transition ${
            currency === c ? "bg-ink text-white" : "text-stone-600 hover:text-ink"
          }`}
        >
          {c === "KZT" ? "₸" : "$"}
        </button>
      ))}
    </div>
  );
}

/** In dollars: what is charged is tenge, and at which rate the dollars were counted. */
export function TengeNote({ total }: { total: number | null | undefined }) {
  const { currency, rate } = useCurrency();
  if (currency !== "USD" || !rate || total === null || total === undefined) return null;
  return (
    <p className="mt-2 text-xs text-muted">
      Оплата в тенге: <b className="text-ink">{tenge(total)}</b> · курс 1 $ ={" "}
      {Number(rate.toFixed(2))} ₸
    </p>
  );
}
