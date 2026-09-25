import fs from "node:fs";
import {
  adminToken,
  api,
  call,
  DEMO_PASSWORD,
  ensureStock,
  expect,
  loginAsAdmin,
  newCustomer,
  placeOrder,
  product,
  test,
  tokenFor,
} from "./support";

test.describe("Админка", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("дашборд", async ({ page }) => {
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Обзор").first()).toBeVisible();
    const stats = await api("GET", "/admin/stats", await adminToken());
    expect(stats.products_total).toBeGreaterThan(0);
    for (const key of ["revenue_total", "pending_total", "gross_profit", "stock_value", "orders_by_status"]) {
      expect(stats).toHaveProperty(key);
    }
    await expect(page.getByText("Выручка · выданные заказы")).toBeVisible();
    await expect(page.getByText(/В работе, ещё не выдано/)).toBeVisible();
  });

  test("бренд, товар и объём с ценами и себестоимостью", async ({ page }) => {
    const admin = await adminToken();
    const brand = `E2E Brand ${Date.now()}`;
    const name = `E2E Eau ${Date.now()}`;

    await page.goto("/admin/brands");
    await page.getByPlaceholder("Новый бренд").fill(brand);
    await page.getByRole("button", { name: "Добавить" }).click();
    await expect(page.locator(`input[value="${brand}"]`)).toBeVisible();

    await page.goto("/admin/products/new");
    await page.getByLabel("Название").fill(name);
    await page.getByLabel("Бренд").selectOption({ label: brand });
    await page.getByRole("button", { name: "Создать товар" }).click();
    await page.waitForURL(/\/admin\/products\/\d+$/);
    const productId = Number(page.url().split("/").pop());

    // On narrow screens every field of the new volume has its own label.
    await page.setViewportSize({ width: 1200, height: 860 });
    const field = (label: string | RegExp) => page.getByLabel(label).filter({ visible: true }).last();
    await field("Объём, мл").fill("50");
    await field("Остаток, шт.").fill("7");
    await field(/^Розница/).fill("25000");
    await field(/^Опт/).fill("19000");
    await field(/^Себестоимость/).fill("12000");
    await page.getByRole("button", { name: "Добавить", exact: true }).click();

    await expect.poll(async () => (await api("GET", `/admin/products/${productId}`, admin)).variants.length).toBe(1);
    const [v] = (await api("GET", `/admin/products/${productId}`, admin)).variants;
    expect(v).toMatchObject({ volume_ml: 50, stock: 7, retail_price: 25000, wholesale_price: 19000, cost_price: 12000 });
    const moves = await api("GET", `/admin/products/${productId}/stock-movements`, admin);
    expect(moves).toHaveLength(1);
    expect(moves[0].delta).toBe(7);
    expect((await api("GET", `/products?q=${encodeURIComponent(name)}`)).total).toBe(1);
  });

  test("импорт каталога: шаблон и проверка без сохранения", async ({ page }, testInfo) => {
    await page.goto("/admin/import");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Скачать шаблон" }).click(),
    ]);
    const file = testInfo.outputPath("template.xlsx");
    await download.saveAs(file);
    expect(fs.statSync(file).size).toBeGreaterThan(3000);

    await page.setInputFiles("input[type=file]", {
      name: "template.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: fs.readFileSync(file),
    });
    await expect(page.getByRole("button", { name: "template.xlsx" })).toBeVisible();
    await page.getByRole("button", { name: "Проверить (без сохранения)" }).click();
    await expect(page.getByText("Проверка завершена")).toBeVisible();
    // The template has a row of a tester (next to the bottle of the same volume).
    await expect(page.locator(".card", { hasText: "Тестеров в файле" })).toContainText("1");
  });

  test("заказ: поиск по номеру и смена статуса", async ({ page }) => {
    const admin = await adminToken();
    const coco = await product(admin, "coco");
    await ensureStock(admin, coco.variants[0], 3);
    const retail = await tokenFor("retail@example.com", DEMO_PASSWORD);
    const order = await placeOrder(retail, [{ variant_id: coco.variants[0].id, quantity: 1 }]);

    await page.goto("/admin/orders");
    await page.getByPlaceholder("№, email, имя, телефон").fill(String(order.id));
    await page.getByPlaceholder("№, email, имя, телефон").press("Enter");
    await page.locator(`a[href='/admin/orders/${order.id}']`).filter({ visible: true }).first().click();
    await page.getByRole("button", { name: "В обработке" }).click();
    await expect(page.getByText("Статус изменён")).toBeVisible();

    const saved = await api("GET", `/admin/orders/${order.id}`, admin);
    expect(saved.status).toBe("processing");
    expect(saved.events.length).toBeGreaterThanOrEqual(2);
  });

  test("пользователи: роль и блокировка", async ({ page }) => {
    const admin = await adminToken();
    const customer = await newCustomer("role");
    await page.goto("/admin/users");
    await page.getByPlaceholder("Email, имя, телефон, компания").fill(customer.email);
    await page.getByRole("button", { name: "Найти" }).click();
    const row = page.locator("tr", { hasText: customer.email });
    await row.locator("select").selectOption("wholesale");
    await expect.poll(async () => (await api("GET", `/admin/users/${customer.id}`, admin)).role).toBe("wholesale");

    await row.getByRole("button", { name: "Активен" }).click();
    await expect(row.getByRole("button", { name: "Заблокирован" })).toBeVisible();
    const res = await call("POST", "/auth/login", null, { email: customer.email, password: customer.password });
    expect(res.status).toBe(403);
  });

  test("настройки цен сохраняются", async ({ page }) => {
    const admin = await adminToken();
    await page.goto("/admin/settings");
    await expect(page.getByText("По сумме заказа")).toBeVisible();
    const { updated_at: _, ...settings } = await api("GET", "/admin/settings/pricing", admin);
    try {
      await api("PUT", "/admin/settings/pricing", admin, { ...settings, max_store_discount_percent: 15 });
      expect((await api("GET", "/admin/settings/pricing", admin)).max_store_discount_percent).toBe(15);
    } finally {
      await api("PUT", "/admin/settings/pricing", admin, settings);
    }
  });

  test("разделы склада и кассы открываются", async ({ page }) => {
    for (const [path, heading] of [
      ["/admin/receipts", "Приёмка"],
      ["/admin/inventory", "Инвентаризация"],
      ["/admin/pos", "Продажа"],
    ]) {
      await page.goto(path);
      await expect(page.getByText(heading).first()).toBeVisible();
    }
  });
});
