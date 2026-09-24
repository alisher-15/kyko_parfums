import { adminToken, api, expect, login, loginAsAdmin, newCustomer, test } from "./support";

/** A product with one volume in stock and one that is not: the shop gets it in 1-2 days. */
async function productWithMissingVolume(admin: string) {
  const brand = await api("POST", "/admin/brands", admin, { name: `Под заказ ${Date.now()}` });
  const created = await api("POST", "/admin/products", admin, {
    brand_id: brand.id,
    name: `Backorder ${Date.now()}`,
    is_active: true,
    variants: [
      { volume_ml: 50, stock: 5, retail_price: 30000 },
      { volume_ml: 100, stock: 0, retail_price: 50000 },
    ],
  });
  const byVolume = (ml: number) => created.variants.find((v: { volume_ml: number }) => v.volume_ml === ml);
  return { product: created, inStock: byVolume(50), missing: byVolume(100) };
}

test("товара нет в наличии: клиент заказывает, менеджер убирает недостающее", async ({ page, openPage }) => {
  const admin = await adminToken();
  const { product, missing } = await productWithMissingVolume(admin);
  const customer = await newCustomer("backorder");
  await login(page, customer.email, customer.password);

  await test.step("карточка товара: «Под заказ», кнопка «Заказать»", async () => {
    await page.goto(`/products/${product.id}`);
    await page.getByRole("button", { name: /^100 мл/ }).click();
    await expect(page.getByText(/Под заказ: привезём за 1–2 дня/)).toBeVisible();
    await page.getByRole("button", { name: "Заказать" }).click();
    await expect(page.getByText("Добавлено в корзину")).toBeVisible();
    await page.getByRole("button", { name: /^50 мл/ }).click();
    await page.getByRole("button", { name: "В корзину" }).click();
  });

  let orderId = 0;
  await test.step("корзина и оформление не блокируются", async () => {
    await page.goto("/cart");
    await expect(page.getByText("Под заказ: привезём за 1–2 дня")).toBeVisible();
    await page.getByRole("link", { name: "Оформить заказ" }).click();
    await page.waitForURL("**/checkout");
    await expect(page.getByText(/Часть товаров под заказ/)).toBeVisible();
    await page.getByLabel("Город").fill("Алматы");
    await page.getByLabel("Адрес").fill("пр. Абая, 5");
    await page.getByRole("button", { name: /Подтвердить заказ/ }).click();
    await page.waitForURL(/\/account\/orders\/\d+/);
    orderId = Number(new URL(page.url()).pathname.split("/").pop());
    await expect(page.getByText(/Под заказ \(нет на складе/)).toBeVisible();
    const order = await api("GET", `/admin/orders/${orderId}`, admin);
    const line = order.items.find((i: { variant_id: number }) => i.variant_id === missing.id);
    expect(line.backordered).toBe(1);
    expect(order.variant_stock[missing.id], "one unit is owed to the customer").toBe(-1);
  });

  await test.step("менеджер видит пометку в списке, в заказе и на дашборде", async () => {
    const m = await openPage();
    await loginAsAdmin(m);
    await expect(m.getByText(/Нужно заказать у поставщика/)).toBeVisible();
    await m.goto("/admin/orders");
    const row = m.locator(`a[href='/admin/orders/${orderId}']`).filter({ visible: true }).first();
    await expect(m.locator("tr", { has: row }).getByText("под заказ")).toBeVisible();

    await m.goto(`/admin/orders/${orderId}`);
    await expect(m.getByText("Часть товара под заказ")).toBeVisible();
    await expect(m.getByText(/под заказ 1 шт\. · на складе не хватает 1 шт\./)).toBeVisible();

    await m.getByRole("button", { name: "Изменить состав" }).click();
    const panel = m.locator("div.card", { hasText: "Изменить состав заказа" });
    await panel.locator("li", { hasText: "100 мл" }).getByRole("button", { name: "Убрать" }).click();
    await panel.getByPlaceholder("Нет в наличии, клиент передумал…").fill("Нет у поставщика");
    await panel.getByRole("button", { name: "Сохранить изменения" }).click();
    await expect(m.getByText("Состав заказа изменён")).toBeVisible();
    await expect(m.getByText("Часть товара под заказ")).toHaveCount(0);
    expect((await api("GET", `/admin/orders/${orderId}`, admin)).variant_stock[missing.id]).toBe(0);
  });

  await test.step("покупатель видит изменение в истории", async () => {
    await page.goto(`/account/orders/${orderId}`);
    await expect(page.getByText(/Менеджер изменил состав/)).toBeVisible();
    await expect(page.getByText(/Нет у поставщика/)).toBeVisible();
  });
});
