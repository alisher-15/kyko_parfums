"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";

// Counter ids, set when the site is built (Render passes env vars to the Docker build).
// Anything but the expected shape is ignored.
const YM_ID = /^\d+$/.test(process.env.NEXT_PUBLIC_YM_ID ?? "") ? Number(process.env.NEXT_PUBLIC_YM_ID) : null;
const GA_ID = /^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_ID ?? "") ? process.env.NEXT_PUBLIC_GA_ID! : null;

// Pages that are nobody else's business: costs, customers' data, reset links.
const PRIVATE = /^\/(admin|account|checkout|reset-password)(\/|$)/;

type Queue = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
declare global {
  interface Window {
    ym?: Queue;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Metrica's queue, set up the way its snippet does; tag.js reads it when it loads. */
function ym(...args: unknown[]) {
  if (!window.ym) {
    const queue: Queue = (...a: unknown[]) => void (queue.a ??= []).push(a);
    queue.l = Date.now();
    window.ym = queue;
    // Webvisor (screen recording) stays off.
    queue(YM_ID, "init", { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true });
  }
  window.ym(...args);
}

/** gtag's dataLayer, configured before the first event (page views are sent by hand). */
function gtag(...args: unknown[]) {
  if (!window.gtag) {
    window.dataLayer ??= [];
    window.gtag = function () {
      // gtag.js reads arguments objects, not arrays.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { send_page_view: false });
  }
  window.gtag(...args);
}

/**
 * Yandex Metrica and Google Analytics 4, when their ids are set. A page view is sent on each
 * navigation, never for the admin panel, the account or checkout.
 */
export function Analytics() {
  const pathname = usePathname();
  // The page a visitor came from inside the site: the referrer of the next page view.
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || PRIVATE.test(pathname)) return;
    const url = window.location.href;
    const referrer = previous.current ?? document.referrer;
    previous.current = url;
    if (YM_ID) ym(YM_ID, "hit", url, { title: document.title, referer: referrer });
    if (GA_ID) gtag("event", "page_view", { page_location: url, page_referrer: referrer, page_title: document.title });
  }, [pathname]);

  return (
    <>
      {YM_ID && <Script src="https://mc.yandex.ru/metrika/tag.js" strategy="afterInteractive" />}
      {GA_ID && <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />}
    </>
  );
}
