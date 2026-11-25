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
  // The quote with the session it was made for: after a logout or a role change the previous
  // session's prices (a wholesale total) are never shown, not even for a moment.
  const [quoted, setQuoted] = useState<{ session: typeof sessionKey; quote: Quote } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
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
            setQuoted({ session: sessionKey, quote: q });
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
  }, [payload, ready, sessionKey, authLoading, attempt]);

  const quote = quoted?.session === sessionKey ? quoted.quote : null;
  return {
    quote,
    error,
    loading: loading || !ready || authLoading,
    /** Ask again after a failure. */
    retry: () => setAttempt((n) => n + 1),
  };
}
