"use client";

import { useSyncExternalStore } from "react";

/**
 * The admin product list keeps its search, filters and page in the URL
 * (/admin/products?no_photo=true&page=2). The last one shown is remembered for this tab, so a
 * product's «← К списку товаров» (and deleting it) lead back to the same filtered page.
 */
export const PRODUCTS_LIST = "/admin/products";
const KEY = "kyko.admin.products-list";

export function rememberProductsList(href: string): void {
  try {
    window.sessionStorage.setItem(KEY, href);
  } catch {
    // storage unavailable: the link leads to the whole list
  }
}

function read(): string {
  try {
    const href = window.sessionStorage.getItem(KEY);
    // Only the list page itself: the value goes into a link and router.replace.
    return href && /^\/admin\/products(\?[^#]*)?$/.test(href) ? href : PRODUCTS_LIST;
  } catch {
    return PRODUCTS_LIST;
  }
}

const subscribe = () => () => {};

/** Where «back to the list» leads: the list as it was last shown, or the whole list. */
export function useProductsListHref(): string {
  return useSyncExternalStore(subscribe, read, () => PRODUCTS_LIST);
}
