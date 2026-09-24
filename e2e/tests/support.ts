import { test as base, expect, type BrowserContextOptions, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export { expect };

export const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8000/api";
export const ADMIN = { email: "admin", password: "admin12345" };
export const DEMO_PASSWORD = "password123";
export const BACKEND_LOG = path.join(__dirname, "..", ".logs", "backend.log");

// API payloads are loosely typed: the tests check the fields they rely on.
export type Json = any;

// ---------- API ----------

export function call(method: string, apiPath: string, token?: string | null, body?: unknown) {
  return fetch(API + apiPath, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function api(method: string, apiPath: string, token?: string | null, body?: unknown): Promise<Json> {
  const res = await call(method, apiPath, token, body);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${apiPath} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

export async function tokenFor(email: string, password: string): Promise<string> {
  return (await api("POST", "/auth/login", null, { email, password })).access_token;
}

export const adminToken = () => tokenFor(ADMIN.email, ADMIN.password);

export function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
}

/** A new customer account, optionally promoted by the admin. */
export async function newCustomer(tag: string, role?: "wholesale" | "bulk_wholesale") {
  const email = uniqueEmail(tag);
  const password = "e2e-pass-1";
  const pair = await api("POST", "/auth/register", null, {
    email,
    password,
    full_name: "Тест Тестов",
    phone: "+7 701 000 00 00",
  });
  if (role) await api("PATCH", `/admin/users/${pair.user.id}`, await adminToken(), { role });
  return { email, password, id: pair.user.id as number, token: await tokenFor(email, password) };
}

/** A demo product with its volumes, found by name (admin view: stock, cost, barcodes). */
export async function product(admin: string, query: string): Promise<Json> {
  const found = await api("GET", `/admin/products?q=${encodeURIComponent(query)}`, admin);
  if (!found.items.length) throw new Error(`No product matches «${query}»`);
  return found.items[0];
}

export function volume(p: Json, ml: number): Json {
  const v = p.variants.find((x: Json) => x.volume_ml === ml);
  if (!v) throw new Error(`${p.name} has no ${ml} ml volume`);
  return v;
}

/**
 * Tests share one database: top a volume up so that earlier tests cannot run it dry.
 * `variant` must be freshly loaded (see `product`). Returns the stock it has now.
 */
export async function ensureStock(admin: string, variant: Json, atLeast: number): Promise<number> {
  if (variant.stock >= atLeast) return variant.stock;
  await api("PATCH", `/admin/variants/${variant.id}`, admin, { stock: atLeast, stock_note: "e2e: пополнение" });
  return atLeast;
}

export async function placeOrder(token: string, items: { variant_id: number; quantity: number }[]): Promise<Json> {
  return api("POST", "/orders", token, {
    contact_name: "Анна",
    contact_phone: "+7 700 000 00 00",
    delivery_city: "Алматы",
    delivery_address: "пр. Абая, 1",
    items,
  });
}

/** Wait for the backend log to mention something (the reset link of a given email, for example). */
export async function fromBackendLog(pattern: RegExp, timeoutMs = 10_000): Promise<RegExpMatchArray> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const log = fs.existsSync(BACKEND_LOG) ? fs.readFileSync(BACKEND_LOG, "utf8") : "";
    const match = log.match(pattern);
    if (match) return match;
    if (Date.now() > until) throw new Error(`${pattern} not found in ${BACKEND_LOG}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ---------- Browser ----------

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.fill("input[autocomplete=username]", email);
  await page.fill("input[type=password]", password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export const loginAsAdmin = (page: Page) => login(page, ADMIN.email, ADMIN.password);

/** Pixels the page scrolls sideways (0 when it fits the screen). */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Distinct product links on the page: a card may link its photo and its title. */
export async function productLinks(page: Page): Promise<number> {
  const hrefs = await page.locator("a[href^='/products/']").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  return new Set(hrefs).size;
}

// 4xx answers are part of normal flows (wrong password, unknown barcode): the page shows them.
const EXPECTED_CONSOLE = /status of 4\d\d/;

function watchErrors(page: Page, errors: string[]) {
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !EXPECTED_CONSOLE.test(m.text())) errors.push(`${page.url()}: ${m.text()}`);
  });
}

type Fixtures = {
  /** JS errors seen in any page of the test; the test fails if there are any. */
  pageErrors: string[];
  /** Another browser (a second user, a phone): a new context with its own storage. */
  openPage: (options?: BrowserContextOptions) => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({}, use) => {
      const errors: string[] = [];
      await use(errors);
      expect(errors, "JavaScript errors in the browser").toEqual([]);
    },
    { auto: true },
  ],
  page: async ({ page, pageErrors }, use) => {
    watchErrors(page, pageErrors);
    await use(page);
  },
  openPage: async ({ browser, baseURL, pageErrors }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await use(async (options = {}) => {
      const context = await browser.newContext({ baseURL, locale: "ru-RU", ...options });
      contexts.push(context);
      const page = await context.newPage();
      watchErrors(page, pageErrors);
      return page;
    });
    for (const context of contexts) await context.close();
  },
});
