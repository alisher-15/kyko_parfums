import { adminToken, api, createProduct, expect, loginAsAdmin, test, volume } from "./support";

/** Cost plus markup, rounded up to hundreds (as the backend does). */
const priced = (cost: number, markup: number) => Math.ceil((cost * (100 + markup)) / 10000) * 100;

test("наценки: надбавка бренда, проверка и пересчёт цен одного бренда", async ({ page }) => {
  const admin = await adminToken();
  const { product, volume: vol } = await createProduct(admin, [
    { volume_ml: 50, stock: 0, retail_price: 1000 },
    { volume_ml: 100, stock: 0, retail_price: 2000 },
  ]);
  const brand = product.brand.name;
  await api("PATCH", `/admin/variants/${vol(50).id}`, admin, { cost_price: 10000 });
  // Priced by hand: recalculation leaves it alone.
  await api("PATCH", `/admin/variants/${vol(100).id}`, admin, { cost_price: 20000, price_locked: true });
  const { base } = await api("GET", "/admin/markups", admin);

  await loginAsAdmin(page);
  await page.goto("/admin/markups");
  await page.getByPlaceholder("Найти бренд").fill(brand);
  const row = page.locator("tr", { hasText: brand });
  await page.getByLabel(`${brand}: Розница`).selectOption("10");
  await expect(row.getByText(`= ${base.retail + 10}%`)).toBeVisible();
  await row.getByRole("button", { name: "Сохранить" }).click();
  await expect
    .poll(async () => (await api("GET", "/admin/markups", admin)).brands.find((b: { name: string }) => b.name === brand)?.retail)
    .toBe(10);
  // The page has reloaded the markups (the row is saved): only now pick the brand to check.
  await expect(row.getByRole("button", { name: "Сохранить" })).toBeDisabled();

  await page.getByLabel("Какие товары").selectOption({ label: brand });
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByText(/Изменятся цены у 1 объёмов/)).toBeVisible();
  await expect(page.getByText(/«Цена вручную» 1/)).toBeVisible();
  await expect(page.getByRole("link", { name: `${brand} ${product.name}, 50 мл` })).toBeVisible();
  // Checking changes nothing.
  expect(volume(await api("GET", `/admin/products/${product.id}`, admin), 50).retail_price).toBe(1000);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByText("Цены обновлены у 1 объёмов.")).toBeVisible();
  const after = await api("GET", `/admin/products/${product.id}`, admin);
  expect(volume(after, 50)).toMatchObject({
    retail_price: priced(10000, base.retail + 10),
    wholesale_price: priced(10000, base.wholesale),
    bulk_price: priced(10000, base.bulk),
  });
  expect(volume(after, 100).retail_price).toBe(2000);
  // The storefront sells at the new price.
  const pub = await api("GET", `/products/${product.id}`);
  expect(pub.variants[0].price).toBe(priced(10000, base.retail + 10));
});

test("наценки: цена, изменённая руками, получает «Цена вручную»", async ({ page }) => {
  const admin = await adminToken();
  const { product, volume: vol } = await createProduct(admin, [{ volume_ml: 50, stock: 0, retail_price: 30000 }]);
  await loginAsAdmin(page);
  await page.goto(`/admin/products/${product.id}`);
  // On narrow screens every field of a volume has its own label.
  await page.setViewportSize({ width: 1200, height: 860 });
  const locked = page.getByLabel("Цена вручную").filter({ visible: true }).first();
  await expect(locked).not.toBeChecked();
  await page.getByLabel(/^Розница/).filter({ visible: true }).first().fill("31000");
  await expect(locked).toBeChecked();
  await page.getByRole("button", { name: "Сохранить", exact: true }).first().click();
  await expect
    .poll(async () => volume(await api("GET", `/admin/products/${product.id}`, admin), 50).price_locked)
    .toBe(true);
  expect(volume(await api("GET", `/admin/products/${product.id}`, admin), 50).retail_price).toBe(31000);
  expect(vol(50).price_locked).toBe(false);
});
