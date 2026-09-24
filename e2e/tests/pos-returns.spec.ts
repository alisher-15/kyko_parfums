import { devices } from "@playwright/test";
import {
  adminToken,
  api,
  DEMO_PASSWORD,
  ensureStock,
  expect,
  horizontalOverflow,
  login,
  loginAsAdmin,
  placeOrder,
  product,
  test,
  tokenFor,
  volume,
} from "./support";

test("касса: продажа со скидкой оптовику и возврат на склад", async ({ page }) => {
  const admin = await adminToken();
  const coco = await product(admin, "coco");
  const v50 = volume(coco, 50);
  const v100 = volume(coco, 100);
  const sku = `E2E-${Date.now()}`;
  await api("PATCH", `/admin/variants/${v100.id}`, admin, { sku });
  const before = {
    v50: await ensureStock(admin, v50, 5),
    v100: await ensureStock(admin, v100, 5),
  };
  const stock = async () => {
    const p = await product(admin, "coco");
    return { v50: volume(p, 50).stock, v100: volume(p, 100).stock };
  };

  await loginAsAdmin(page);
  await page.goto("/admin/pos");
  const search = page.getByPlaceholder("Название, бренд или штрихкод");

  await test.step("поиск по названию и скан артикула", async () => {
    await search.fill("coco");
    await page.getByRole("button", { name: /Chanel Coco Mademoiselle, 50 мл/ }).click();
    await search.fill(sku);
    await search.press("Enter");
    await expect(page.locator("li", { hasText: "Coco Mademoiselle, 100 мл" }).first()).toBeVisible();
  });

  let saleId = 0;
  await test.step("2 шт., скидка 5% на чек, покупатель-оптовик, оплата картой", async () => {
    await page.locator("li").filter({ hasText: "Coco Mademoiselle, 50 мл" }).getByLabel("Больше").click();
    await page.getByPlaceholder("0").last().fill("5");
    await page.getByRole("button", { name: "Применить" }).click();
    await page.getByPlaceholder("Телефон, email, имя или компания").fill("wholesale");
    await page.getByRole("button", { name: /wholesale@example.com/ }).click();
    await page.getByRole("button", { name: "Карта" }).click();
    await page.getByRole("button", { name: /Провести продажу/ }).click();
    const done = page.getByText(/Продажа № \d+ проведена/);
    await expect(done).toBeVisible();
    saleId = Number((await done.innerText()).match(/№ (\d+)/)![1]);
    const sale = await api("GET", `/admin/orders/${saleId}`, admin);
    expect(sale).toMatchObject({ channel: "store", status: "delivered", payment_method: "card", customer_role: "wholesale" });
    expect(sale.items.every((i: { discount_percent: number }) => i.discount_percent === 5)).toBe(true);
    expect(await stock()).toEqual({ v50: before.v50 - 2, v100: before.v100 - 1 });
  });

  await test.step("возврат всей продажи возвращает товар на склад", async () => {
    await page.getByRole("link", { name: "Открыть продажу" }).click();
    await expect(page.getByText("Товар выдан покупателю.")).toBeVisible();
    await page.getByRole("button", { name: "Оформить возврат" }).click();
    await page.getByRole("button", { name: "Вернуть всё" }).click();
    await page.locator("div.card", { hasText: "Деньги возвращаются" }).getByRole("button", { name: "Оформить возврат" }).click();
    await expect(page.getByText("Возврат оформлен").first()).toBeVisible();
    expect(await stock()).toEqual(before);
    expect((await api("GET", `/admin/orders/${saleId}`, admin)).fully_returned).toBe(true);
  });

  await test.step("продажа в списке заказов с фильтром «магазин»", async () => {
    await page.goto("/admin/orders?channel=store");
    await expect(page.locator(`a[href='/admin/orders/${saleId}']`).filter({ visible: true }).first()).toBeVisible();
  });

  await test.step("ручное изменение остатка с причиной попадает в журнал", async () => {
    await page.goto(`/admin/products/${coco.id}`);
    await expect(page.getByText("Движение склада")).toBeVisible();
    const row = page.locator("div.rounded-xl", { has: page.locator("input[value='50']") }).first();
    // Desktop row: volume, then stock (the article field is text).
    await row.locator("input[inputmode=decimal]").nth(1).fill(String(before.v50 + 12));
    await page.getByPlaceholder("Списание брака, пересчёт…").fill("Приход, накладная 17");
    await row.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByText("Приход, накладная 17").last()).toBeVisible();
    expect((await stock()).v50).toBe(before.v50 + 12);
  });
});

test("изменение заказа до отправки и частичный возврат после доставки", async ({ page, openPage }) => {
  const admin = await adminToken();
  const coco = await product(admin, "coco");
  const v50 = volume(coco, 50);
  const v100 = volume(coco, 100);
  await ensureStock(admin, v50, 5);
  await ensureStock(admin, v100, 5);
  const wholesale = await tokenFor("wholesale@example.com", DEMO_PASSWORD);
  const order = await placeOrder(wholesale, [
    { variant_id: v50.id, quantity: 3 },
    { variant_id: v100.id, quantity: 2 },
  ]);
  const customer = await openPage();
  await login(customer, "wholesale@example.com", DEMO_PASSWORD);
  await loginAsAdmin(page);

  await test.step("менеджер уменьшает 50 мл до 1 шт. и убирает 100 мл", async () => {
    await page.goto(`/admin/orders/${order.id}`);
    await page.getByRole("button", { name: "Изменить состав" }).click();
    const panel = page.locator("div.card", { hasText: "Изменить состав заказа" });
    const row50 = panel.locator("li", { hasText: "50 мл" });
    await row50.getByLabel("Меньше").click();
    await row50.getByLabel("Меньше").click();
    await panel.locator("li", { hasText: "100 мл" }).getByRole("button", { name: "Убрать" }).click();
    await panel.getByPlaceholder("Нет в наличии, клиент передумал…").fill("100 мл закончился");
    await panel.getByRole("button", { name: "Сохранить изменения" }).click();
    await expect(page.getByText("Состав заказа изменён")).toBeVisible();
    const edited = await api("GET", `/admin/orders/${order.id}`, admin);
    expect(edited.items.map((i: { quantity: number }) => i.quantity).sort()).toEqual([0, 1]);
  });

  await test.step("покупатель видит изменение в истории", async () => {
    await customer.goto(`/account/orders/${order.id}`);
    await expect(customer.getByText(/Менеджер изменил состав/)).toBeVisible();
  });

  await test.step("отправлен → доставлен → возврат 1 шт. как брак", async () => {
    const stockBefore = volume(await product(admin, "coco"), 50).stock;
    await page.getByRole("button", { name: "Отправлен" }).click();
    await expect(page.getByText("Статус изменён: Отправлен")).toBeVisible();
    await page.getByRole("button", { name: "Доставлен" }).click();
    await expect(page.getByText("Статус изменён: Доставлен")).toBeVisible();
    await page.getByRole("button", { name: "Оформить возврат" }).click();
    const panel = page.locator("div.card", { hasText: "Деньги возвращаются" });
    await panel.locator("li", { hasText: "50 мл" }).getByLabel("Больше").click();
    await panel.getByRole("button", { name: "Брак — списать" }).click();
    await panel.getByRole("button", { name: "Kaspi / перевод" }).click();
    await panel.getByPlaceholder(/Не подошёл аромат/).fill("Треснул флакон");
    await panel.getByRole("button", { name: "Оформить возврат" }).click();
    await expect(page.getByText("Возврат оформлен").first()).toBeVisible();

    const final = await api("GET", `/admin/orders/${order.id}`, admin);
    expect(final.returned_amount).toBe(final.total_amount);
    expect(final.net_total).toBe(0);
    expect(final.fully_returned).toBe(true);
    expect(volume(await product(admin, "coco"), 50).stock, "defective goods are written off").toBe(stockBefore);
  });

  await test.step("покупатель видит возврат", async () => {
    await customer.goto(`/account/orders/${order.id}`);
    await expect(customer.getByText("Возвраты")).toBeVisible();
  });

  await test.step("телефон: панель возврата магазинной продажи", async () => {
    const sale = await api("POST", "/admin/store/sales", admin, { items: [{ variant_id: v50.id, quantity: 1 }] });
    const phone = await openPage({ ...devices["iPhone 13"] });
    await loginAsAdmin(phone);
    await phone.goto(`/admin/orders/${sale.id}`);
    await phone.getByRole("button", { name: "Оформить возврат" }).tap();
    await phone.getByRole("button", { name: "Вернуть всё" }).tap();
    expect(await horizontalOverflow(phone)).toBeLessThanOrEqual(0);
  });
});
