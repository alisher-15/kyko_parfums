import { expect, login, newCustomer, test } from "./support";

const menu = (page: import("@playwright/test").Page) => page.locator("aside nav");

test.describe("Сотрудники", () => {
  test("кассир: касса и заказы, без себестоимости, товаров и цифр", async ({ page }) => {
    const cashier = await newCustomer("cashier", "cashier");
    await login(page, cashier.email, cashier.password);
    // A member of staff starts on their own first page.
    await page.waitForURL("**/admin/pos");
    await expect(menu(page).getByRole("link")).toHaveText(["Продажа в магазине", "Заказы и продажи"]);
    await expect(page.getByRole("heading", { name: "Продажа в магазине" })).toBeVisible();
    await expect(page.getByText("Показать себестоимость")).toHaveCount(0);

    await page.goto("/admin/products");
    await expect(page.getByText("Нет доступа к этому разделу.")).toBeVisible();
    await page.goto("/admin");
    await page.waitForURL("**/admin/pos");
    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: /Заказы/ }).first()).toBeVisible();
  });

  test("склад: приёмка, инвентаризация и заказы", async ({ page }) => {
    const worker = await newCustomer("warehouse", "warehouse");
    await login(page, worker.email, worker.password);
    await page.waitForURL("**/admin/orders");
    await expect(menu(page).getByRole("link")).toHaveText(["Заказы и продажи", "Приёмка", "Инвентаризация"]);
    await page.goto("/admin/receipts");
    await expect(page.getByRole("heading", { name: /Приёмка/ }).first()).toBeVisible();
    await page.goto("/admin/pos");
    await expect(page.getByText("Нет доступа к этому разделу.")).toBeVisible();
  });
});
