import { adminToken, api, createProduct, expect, login, loginAsAdmin, newCustomer, test } from "./support";

test("товара нет в наличии: клиент заказывает как обычно, менеджер убирает недостающее", async ({
  page,
  openPage,
}) => {
  const admin = await adminToken();
  // One volume in stock and one that is not: the shop can get it in 1-2 days.
  const { product, volume } = await createProduct(admin, [
    { volume_ml: 50, stock: 20, retail_price: 30000 },
    { volume_ml: 100, stock: 0, retail_price: 50000 },
  ]);
  const missing = volume(100);
  const customer = await newCustomer("backorder");
  await login(page, customer.email, customer.password);

  await test.step("покупатель не видит, что товара нет: обычная кнопка «В корзину»", async () => {
    await page.goto(`/products/${product.id}`);
    await page.getByRole("button", { name: /^100 мл/ }).click();
    await expect(page.getByText(/Под заказ|Нет в наличии/)).toHaveCount(0);
    await page.getByRole("button", { name: "В корзину" }).click();
    await expect(page.getByText("Добавлено в корзину")).toBeVisible();
    await page.getByRole("button", { name: /^50 мл/ }).click();
    await page.getByRole("button", { name: "В корзину" }).click();
  });

  let orderId = 0;
  await test.step("корзина и оформление ничего не говорят о наличии", async () => {
    await page.goto("/cart");
    await expect(page.getByText("Итого").first()).toBeVisible();
    await expect(page.getByText(/под заказ/i)).toHaveCount(0);
    await page.getByRole("link", { name: "Оформить заказ" }).click();
    await page.waitForURL("**/checkout");
    await expect(page.getByText(/подтвердит наличие и срок доставки/)).toBeVisible();
    await expect(page.getByText(/под заказ/i)).toHaveCount(0);
    await page.getByLabel("Город").fill("Алматы");
    await page.getByLabel("Адрес").fill("пр. Абая, 5");
    await page.getByRole("button", { name: /Подтвердить заказ/ }).click();
    await page.waitForURL(/\/account\/orders\/\d+/);
    orderId = Number(new URL(page.url()).pathname.split("/").pop());
    await expect(page.getByText(/Спасибо! Заказ №/)).toBeVisible();
    await expect(page.getByText(/под заказ/i), "the customer's order says nothing about it").toHaveCount(0);
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
