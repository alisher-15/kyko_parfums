import { devices } from "@playwright/test";
import { CAMERA_CODES } from "./barcodes";
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

// The browser of this project has a fake webcam that shows CAMERA_CODES in turn (global-setup.ts).
const [codeA, codeB] = CAMERA_CODES;

let coco50: { id: number };
let sauvage100: { id: number };

test.beforeAll(async () => {
  const admin = await adminToken();
  coco50 = volume(await product(admin, "coco"), 50);
  sauvage100 = volume(await product(admin, "sauvage"), 100);
  await ensureStock(admin, coco50, 5);
  await ensureStock(admin, sauvage100, 5);
  // Idempotent: the same code on the same volume is fine when the tests run again.
  await api("POST", `/admin/variants/${coco50.id}/barcodes`, admin, { code: codeA });
  await api("POST", `/admin/variants/${sauvage100.id}/barcodes`, admin, { code: codeB });
});

test("камера на компьютере: один скан = одна штука, −/+ и отмена", async ({ page }) => {
  const admin = await adminToken();
  const receipt = await api("POST", "/admin/receipts", admin, { supplier: "Камера" });
  const total = async () => (await api("GET", `/admin/receipts/${receipt.id}`, admin)).total_quantity;
  await loginAsAdmin(page);
  await page.goto(`/admin/receipts/${receipt.id}`);

  // Slow the first lookup down so the "processing" state can be seen.
  let slow = true;
  await page.route("**/api/admin/receipts/*/scan", async (route) => {
    if (slow) {
      slow = false;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Камера" }).click();
  const dialog = page.getByRole("dialog");

  await test.step("код прочитан: камера замирает и показывает результат", async () => {
    await expect(dialog.getByText(/прочитан · ищем товар/)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText("В приёмке, шт.")).toBeVisible();
    await page.waitForTimeout(3000);
    expect(await total(), "the code stays in view, but it is counted once").toBe(1);
  });

  await test.step("«+» и отмена скана", async () => {
    await dialog.getByRole("button", { name: "Увеличить количество" }).click();
    await expect.poll(total).toBe(2);
    await dialog.getByRole("button", { name: "Отменить этот скан" }).click();
    await expect(dialog.getByText(/^Отменено:/)).toBeVisible();
    await expect.poll(total).toBe(0);
  });

  await test.step("«Следующий товар»: ровно одна штука за нажатие", async () => {
    for (let i = 1; i <= 3; i++) {
      await dialog.getByRole("button", { name: /Следующий товар|Сканировать снова/ }).click();
      await expect(dialog.getByText("В приёмке, шт.")).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(2500);
      expect(await total()).toBe(i);
    }
    await dialog.getByRole("button", { name: "Закрыть" }).click();
  });

  await test.step("неизвестный код предлагает привязать его к товару", async () => {
    const field = page.getByPlaceholder("Отсканируйте штрихкод");
    await field.fill("999000111");
    await field.press("Enter");
    await expect(page.getByRole("status").getByText("Штрихкод 999000111 не найден")).toBeVisible();
    await page.getByRole("button", { name: "Привязать к товару" }).click();
    await expect(page.locator("#unknown-barcode")).toBeInViewport();
  });

  await test.step("касса: −/+ и отмена в карточке скана", async () => {
    await page.goto("/admin/pos");
    const search = page.getByPlaceholder("Название, бренд или штрихкод");
    await search.fill(codeA);
    await search.press("Enter");
    await expect(page.getByText("В чеке, шт.")).toBeVisible();
    await page.getByRole("button", { name: "Увеличить количество" }).click();
    await expect(page.locator("li", { hasText: "Coco Mademoiselle, 50 мл" }).locator("input").first()).toHaveValue("2");
    await page.getByRole("button", { name: "Отменить этот скан" }).click();
    await expect(page.getByText("Найдите товар по названию")).toBeVisible();
  });
});

test("камера на телефоне: инвентаризация и сборка заказа", async ({ openPage }) => {
  const admin = await adminToken();
  const phone = { ...devices["iPhone 13"], permissions: ["camera"] };

  await test.step("инвентаризация: сначала камера, клавиатура не выскакивает", async () => {
    const count = await api("POST", "/admin/counts", admin, { note: "Витрина" });
    const m = await openPage(phone);
    await loginAsAdmin(m);
    await m.goto(`/admin/inventory/${count.id}`);
    const big = m.getByRole("button", { name: "Сканировать камерой" });
    await expect(big).toBeVisible();
    expect(await m.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
    await big.click();
    const dialog = m.getByRole("dialog");
    await expect(dialog.getByText("Посчитано, шт.")).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Следующий товар" }).click();
    await expect(dialog.getByText("Посчитано, шт.")).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Закрыть" }).click();
    await expect
      .poll(async () =>
        (await api("GET", `/admin/counts/${count.id}`, admin)).items.reduce((s: number, i: { counted: number }) => s + i.counted, 0),
      )
      .toBe(2);
  });

  await test.step("сборка заказа камерой", async () => {
    const retail = await tokenFor("retail@example.com", DEMO_PASSWORD);
    const order = await placeOrder(retail, [
      { variant_id: coco50.id, quantity: 2 },
      { variant_id: sauvage100.id, quantity: 1 },
    ]);
    // Chromium drops touch emulation after a fake-camera session: a fresh phone.
    const m = await openPage(phone);
    await loginAsAdmin(m);
    await m.goto(`/admin/orders/${order.id}`);
    await m.getByRole("button", { name: "Собрать заказ" }).click();
    await m.getByRole("button", { name: "Сканировать камерой" }).click();
    const dialog = m.getByRole("dialog");
    await expect(dialog.getByText(/Собрано 1 из/)).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Закрыть" }).click();
    expect(await horizontalOverflow(m)).toBeLessThanOrEqual(0);
  });
});
