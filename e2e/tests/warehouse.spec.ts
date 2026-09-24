import { devices, type Page } from "@playwright/test";
import { randomEan } from "./barcodes";
import {
  adminToken,
  api,
  DEMO_PASSWORD,
  ensureStock,
  expect,
  horizontalOverflow,
  loginAsAdmin,
  placeOrder,
  product,
  test,
  tokenFor,
  volume,
} from "./support";

test.use({ viewport: { width: 1360, height: 900 } });

/** A keyboard scan into a scan field: the code and Enter. */
async function scan(page: Page, placeholder: string, code: string) {
  const input = page.getByPlaceholder(placeholder).first();
  await input.fill(code);
  await input.press("Enter");
}

test("склад: штрихкоды, приёмка, инвентаризация, сборка заказа, касса", async ({ page, openPage }) => {
  const admin = await adminToken();
  let coco = await product(admin, "coco");
  const sauvage = await product(admin, "sauvage");
  const [codeA, codeB, codeC] = [randomEan(), randomEan(), randomEan()];
  const coco50 = volume(coco, 50);
  const coco100 = volume(coco, 100);
  const sauvage100 = volume(sauvage, 100);
  const stock50 = await ensureStock(admin, coco50, 5);
  await ensureStock(admin, sauvage100, 3);
  await api("POST", `/admin/variants/${coco100.id}/barcodes`, admin, { code: codeC });
  await loginAsAdmin(page);

  await test.step("товар: штрихкод сканом и себестоимость", async () => {
    await page.goto(`/admin/products/${coco.id}`);
    await scan(page, "Отсканируйте или введите штрихкод", codeA);
    await expect(page.getByText(`Штрихкод ${codeA} добавлен`)).toBeVisible();
    await expect(page.locator(".chip", { hasText: codeA })).toBeVisible();
    const row = page.locator("div.rounded-xl", { has: page.locator(".chip", { hasText: codeA }) }).first();
    await row.getByPlaceholder("не указана").filter({ visible: true }).fill("30000");
    await row.getByRole("button", { name: "Сохранить" }).click();
    await expect.poll(async () => volume(await product(admin, "coco"), 50).cost_price).toBe(30000);
    expect(volume(await product(admin, "coco"), 50).barcodes).toContain(codeA);
  });

  let receiptId = 0;
  await test.step("приёмка: шапка, сканы, неизвестный код, товар без штрихкода, цены", async () => {
    await page.goto("/admin/receipts");
    await page.getByRole("button", { name: "+ Новая приёмка" }).click();
    await page.waitForURL(/\/admin\/receipts\/\d+/);
    receiptId = Number(page.url().split("/").pop());
    await page.getByLabel("Поставщик").fill("Парфюм-Трейд");
    await page.getByLabel("№ накладной").fill("А-17");
    await page.getByRole("button", { name: "Сохранить" }).click();

    await scan(page, "Отсканируйте штрихкод", codeA);
    await expect(page.getByText("В приёмке, шт.")).toBeVisible();
    await scan(page, "Отсканируйте штрихкод", codeA);
    await expect.poll(async () => (await api("GET", `/admin/receipts/${receiptId}`, admin)).total_quantity).toBe(2);

    await scan(page, "Отсканируйте штрихкод", codeB);
    await expect(page.getByText(`Штрихкод ${codeB} не найден`).first()).toBeVisible();
    await page.getByPlaceholder("Товар для этого штрихкода").fill("Sauvage");
    await page.getByRole("button", { name: /Dior Sauvage, 100 мл/ }).click();
    await expect(page.getByText(/Штрихкод привязан к «Dior Sauvage, 100 мл»/)).toBeVisible();

    await page.getByPlaceholder("Название или бренд").fill("Aventus");
    await page.getByRole("button", { name: /Creed Aventus, 50 мл/ }).click();
    await expect(page.getByText(/Добавлено: Creed Aventus, 50 мл/)).toBeVisible();

    const line = (label: string) => page.locator("li", { hasText: label });
    for (const [label, cost] of [
      ["Dior Sauvage, 100 мл", "25000"],
      ["Chanel Coco Mademoiselle, 50 мл", "36000"],
    ]) {
      await line(label).getByPlaceholder("не указана").fill(cost);
      await line(label).getByPlaceholder("не указана").press("Enter");
    }
    await expect
      .poll(async () => (await api("GET", `/admin/receipts/${receiptId}`, admin)).items.filter((i: { cost_price: number | null }) => i.cost_price !== null).length)
      .toBe(2);
  });

  await test.step("приёмка проведена: остаток и средняя себестоимость", async () => {
    await page.getByRole("button", { name: /Провести приёмку/ }).click();
    await page.getByRole("button", { name: "Да, провести" }).click();
    await expect(page.getByText("Приёмка проведена, товар на складе")).toBeVisible();
    const after = volume(await product(admin, "coco"), 50);
    expect(after.stock).toBe(stock50 + 2);
    expect(after.cost_price).toBeCloseTo((stock50 * 30000 + 2 * 36000) / (stock50 + 2), 2);
  });

  await test.step("инвентаризация: остаток = посчитанному", async () => {
    await page.goto("/admin/inventory");
    await page.getByRole("button", { name: "+ Новая инвентаризация" }).click();
    await page.waitForURL(/\/admin\/inventory\/\d+/);
    const countId = Number(page.url().split("/").pop());
    for (let i = 0; i < 3; i++) await scan(page, "Отсканируйте штрихкод", codeA);
    await expect(page.getByText("Посчитано, шт.")).toBeVisible();
    await expect.poll(async () => (await api("GET", `/admin/counts/${countId}`, admin)).items[0]?.counted).toBe(3);

    await page.getByPlaceholder("Название или бренд").fill("Aventus");
    await page.getByRole("button", { name: /Creed Aventus, 100 мл/ }).click();
    await expect(page.getByText(/Добавлено: Creed Aventus, 100 мл/)).toBeVisible();
    const aventusRow = page.locator("li", { hasText: "Creed Aventus, 100 мл" });
    await aventusRow.locator("input").fill("1");
    await aventusRow.locator("input").press("Enter");
    await expect.poll(async () => (await api("GET", `/admin/counts/${countId}`, admin)).items.length).toBe(2);

    // Units in orders that are not shipped yet are counted but stay promised to customers.
    const draft = await api("GET", `/admin/counts/${countId}`, admin);
    const inOrders = (variantId: number) =>
      draft.items.find((i: { variant_id: number }) => i.variant_id === variantId).reserved as number;
    const aventus100 = volume(await product(admin, "aventus"), 100);
    await page.getByRole("button", { name: "Провести инвентаризацию" }).click();
    await page.getByRole("button", { name: "Да, провести" }).click();
    await expect(page.getByText("Инвентаризация проведена, остатки исправлены")).toBeVisible();
    expect(volume(await product(admin, "coco"), 50).stock).toBe(3 - inOrders(coco50.id));
    expect(volume(await product(admin, "aventus"), 100).stock).toBe(1 - inOrders(aventus100.id));
  });

  await test.step("журнал остатков ссылается на документы", async () => {
    await page.goto(`/admin/products/${coco.id}`);
    await expect(page.getByText("Движение склада")).toBeVisible();
    await expect(page.locator("td", { hasText: "Инвентаризация" }).first()).toBeVisible();
    await expect(page.locator("td", { hasText: "Приёмка" }).first()).toBeVisible();
    expect(await page.getByRole("link", { name: "документ" }).count()).toBeGreaterThan(0);
  });

  await test.step("сборка заказа ловит чужой объём и лишнюю штуку", async () => {
    const retail = await tokenFor("retail@example.com", DEMO_PASSWORD);
    const order = await placeOrder(retail, [
      { variant_id: coco50.id, quantity: 2 },
      { variant_id: sauvage100.id, quantity: 1 },
    ]);
    await page.goto(`/admin/orders/${order.id}`);
    await page.getByRole("button", { name: "Собрать заказ" }).click();
    const field = "Сканируйте товары заказа";
    await scan(page, field, codeC);
    await expect(page.getByText("Не тот объём: 100 мл")).toBeVisible();
    await scan(page, field, codeA);
    await scan(page, field, codeA);
    await expect(page.getByText(/Собрано 2 из 2/)).toBeVisible();
    await scan(page, field, codeA);
    await expect(page.getByText(/Лишняя штука/)).toBeVisible();
    await scan(page, field, codeB);
    await expect(page.getByText("Заказ собран полностью.")).toBeVisible();
    await page.getByRole("button", { name: "Отметить «Отправлен»" }).click();
    await expect(page.getByText(/Заказ собран. Статус изменён: Отправлен/)).toBeVisible();
    expect((await api("GET", `/admin/orders/${order.id}`, admin)).status).toBe("shipped");
  });

  await test.step("касса: скан добавляет товар в чек", async () => {
    // The till sells only free stock; the count and the picked order may have used it up.
    await ensureStock(admin, volume(await product(admin, "coco"), 50), 3);
    await page.goto("/admin/pos");
    await scan(page, "Название, бренд или штрихкод", codeA);
    await expect(page.getByText("В чеке, шт.")).toBeVisible();
    await expect(page.locator("li", { hasText: "Coco Mademoiselle, 50 мл" }).first()).toBeVisible();
  });

  await test.step("дашборд: валовая прибыль и склад по себестоимости", async () => {
    await page.goto("/admin");
    await expect(page.getByText(/Валовая прибыль/)).toBeVisible();
    await expect(page.getByText(/Склад по себестоимости/)).toBeVisible();
  });

  await test.step("телефон: карточка товара со штрихкодами без горизонтального скролла", async () => {
    const phone = await openPage({ ...devices["iPhone 13"] });
    await loginAsAdmin(phone);
    coco = await product(admin, "coco");
    await phone.goto(`/admin/products/${coco.id}`);
    await expect(phone.locator(".chip", { hasText: codeA })).toBeVisible();
    expect(await horizontalOverflow(phone)).toBeLessThanOrEqual(0);
  });

});
