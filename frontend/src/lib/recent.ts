"use client";

import { useSyncExternalStore } from "react";

// «Вы смотрели» on the home page: the products this browser opened, the latest first. Only ids
// are kept, so prices always come fresh from the server for the viewer's role.

const KEY = "kyko.recent";
const LIMIT = 12;
const EVENT = "kyko-recent";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberViewed(id: number) {
  const ids = [id, ...parse(read()).filter((x) => x !== id)].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, ids.join(","));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Private mode or storage off: the home page simply has no «Вы смотрели».
  }
}

function parse(raw: string): number[] {
  return raw
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The ids, the latest viewed first; empty on the server and before the browser is read. */
export function useRecentlyViewed(): number[] {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  return parse(raw);
}
