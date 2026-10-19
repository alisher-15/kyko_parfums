"use client";

import { useEffect } from "react";

/**
 * Sends the page's uncaught errors to the shop's server (POST /api/client-errors: the log and
 * Sentry), a few per page at most, so a broken page is known before customers write about it.
 * Only the path is sent, never the query (a reset link carries its token there).
 */
export function ErrorReporter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const sent = new Set<string>();
    const report = (message: string, stack?: string) => {
      if (!message || sent.size >= 5 || sent.has(message)) return;
      sent.add(message);
      const body = JSON.stringify({
        message: message.slice(0, 1000),
        stack: stack?.slice(0, 8000),
        url: window.location.pathname.slice(0, 1000),
      });
      try {
        navigator.sendBeacon?.("/api/client-errors", new Blob([body], { type: "application/json" }));
      } catch {
        // reporting must never break the page
      }
    };
    const onError = (e: ErrorEvent) =>
      report(e.message, e.error instanceof Error ? e.error.stack : undefined);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      if (r instanceof Error) report(`${r.name}: ${r.message}`, r.stack);
      else report(String(r));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
