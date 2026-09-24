import { devices } from "@playwright/test";
import { api, expect, horizontalOverflow, loginAsAdmin, test } from "./support";

const phone = { ...devices["iPhone 13"] };

async function overflowing(page: import("@playwright/test").Page, paths: string[]) {
  const wide: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const extra = await horizontalOverflow(page);
    if (extra > 0) wide.push(`${path} (+${extra}px)`);
  }
  return wide;
}

test.describe("Телефон", () => {
  test("витрина без горизонтального скролла", async ({ openPage }) => {
    const coco = (await api("GET", "/products?q=coco")).items[0];
    const m = await openPage(phone);
    expect(await overflowing(m, ["/", "/catalog", `/products/${coco.id}`, "/cart", "/brands", "/login", "/register"])).toEqual(
      [],
    );
  });

  test("админка без горизонтального скролла", async ({ openPage }) => {
    const m = await openPage(phone);
    await loginAsAdmin(m);
    const paths = [
      "/admin",
      "/admin/orders",
      "/admin/products",
      "/admin/products/1",
      "/admin/users",
      "/admin/pos",
      "/admin/receipts",
      "/admin/inventory",
      "/admin/import",
      "/admin/settings",
    ];
    expect(await overflowing(m, paths)).toEqual([]);
  });
});
