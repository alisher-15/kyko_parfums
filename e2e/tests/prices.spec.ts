import { adminToken, api, createProduct, expect, loginAsAdmin, test } from "./support";

test.describe("Цены", () => {
  test("цена ниже себестоимости находится фильтром, а каждое изменение — в истории цен", async ({ page }) => {
    const admin = await adminToken();
    const { product, volume } = await createProduct(admin, [{ volume_ml: 50, stock: 1, retail_price: 10000 }]);
    // The cost turns out higher than the price: the shop would lose on every sale.
    await api("PATCH", `/admin/variants/${volume(50).id}`, admin, { cost_price: 12000 });

    await loginAsAdmin(page);
    await page.goto(`/admin/products?q=${encodeURIComponent(product.name)}`);
    await expect(page.getByRole("heading", { name: "Товары · 1" })).toBeVisible();
    await page.getByLabel("Проверка цен").selectOption({ label: "Цена ниже себестоимости" });
    await expect(page).toHaveURL(/price_check=below_cost/);
    await expect(page.getByRole("heading", { name: "Товары · 1" })).toBeVisible();
    await page.getByLabel("Проверка цен").selectOption({ label: "Наценка упала" });
    await expect(page.getByRole("heading", { name: "Товары · 0" })).toBeVisible();

    // The price goes up; the product card tells when, from what, to what and who did it.
    await api("PATCH", `/admin/variants/${volume(50).id}`, admin, { retail_price: 15000 });
    await page.goto(`/admin/products/${product.id}`);
    const history = page.locator(".card").filter({ has: page.getByRole("heading", { name: "История цен" }) });
    const rows = history.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Розница");
    await expect(rows.nth(0)).toContainText("10 000");
    await expect(rows.nth(0)).toContainText("15 000");
    await expect(rows.nth(0)).toContainText("Админка");
    await expect(rows.nth(1)).toContainText("Себестоимость");
    await expect(rows.nth(1)).toContainText("12 000");

    await page.goto(`/admin/products?q=${encodeURIComponent(product.name)}&price_check=below_cost`);
    await expect(page.getByRole("heading", { name: "Товары · 0" })).toBeVisible();
  });
});
