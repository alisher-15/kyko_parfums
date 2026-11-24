import { useSyncExternalStore } from "react";
import { prefs } from "./storage";

// «Вы смотрели» on the home screen, as on the website (frontend/src/lib/recent.ts): the products
// this phone opened, the latest first. Only ids are kept, so prices always come fresh from the
// server for the customer's role.

const KEY = "kyko.recent";
const LIMIT = 12;

let ids: number[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Reads the saved list once; everything that changes it waits for that first. */
function load(): Promise<void> {
  loading ??= prefs.get<number[]>(KEY, []).then((saved) => {
    ids = Array.isArray(saved) ? saved.filter((n) => Number.isInteger(n) && n > 0) : [];
    emit();
  });
  return loading;
}

export function rememberViewed(id: number) {
  void load().then(() => {
    ids = [id, ...ids.filter((x) => x !== id)].slice(0, LIMIT);
    void prefs.set(KEY, ids);
    emit();
  });
}

function subscribe(onChange: () => void) {
  void load();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The ids, the latest viewed first. */
export function useRecentlyViewed(): number[] {
  return useSyncExternalStore(
    subscribe,
    () => ids,
    () => ids,
  );
}
