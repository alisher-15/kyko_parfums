import { devices } from "@playwright/test";
import { api, expect, horizontalOverflow, loginAsAdmin, test } from "./support";

const phone = { ...devices["iPhone 13"] };

/** Text fields under 16px: iPhone Safari zooms the page into them when tapped and stays zoomed. */
function smallFields(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>("input, select, textarea")]
      .filter((el) => !["checkbox", "radio", "range", "file", "hidden"].includes(el.type))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.placeholder || el.name || el.type),
  );
}

/** Pages that scroll sideways or have fields that make the phone zoom in. */
async function overflowing(page: import("@playwright/test").Page, paths: string[]) {
  const wide: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const extra = await horizontalOverflow(page);
    if (extra > 0) wide.push(`${path} (+${extra}px)`);
    const small = await smallFields(page);
    if (small.length) wide.push(`${path}: поля мельче 16px (${small.join(", ")})`);
  }
  return wide;
}

test.describe("Телефон", () => {
  test("витрина без горизонтального скролла и увеличения на полях", async ({ openPage }) => {
    const coco = (await api("GET", "/products?q=coco")).items[0];
    const m = await openPage(phone);
    expect(await overflowing(m, ["/", "/catalog", `/products/${coco.id}`, "/cart", "/brands", "/login", "/register"])).toEqual(
      [],
    );
  });

  test("админка без горизонтального скролла и увеличения на полях", async ({ openPage }) => {
    const m = await openPage(phone);
    await loginAsAdmin(m);
    const paths = [
      "/admin",
      "/admin/orders",
      "/admin/products",
      "/admin/products/1",
      "/admin/promotions",
      "/admin/promotions/new",
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
