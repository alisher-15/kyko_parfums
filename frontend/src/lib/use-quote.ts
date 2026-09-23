"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { useAuth } from "./auth";
import { useCart } from "./cart";
import type { Quote } from "./types";

/** Server-side pricing of the local cart for the current user's role (debounced). */
export function useQuote() {
  const { items, ready } = useCart();
  const { sessionKey, loading: authLoading } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const payload = JSON.stringify(
    items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
  );

  useEffect(() => {
    if (!ready || authLoading) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      api<Quote>("/cart/quote", { body: { items: JSON.parse(payload) } })
        .then((q) => {
          if (!cancelled) {
            setQuote(q);
            setError(null);
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof ApiError ? e.message : String(e));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [payload, ready, sessionKey, authLoading]);

  return { quote, error, loading: loading || !ready || authLoading };
}
