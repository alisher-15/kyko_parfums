import type { Page } from "@playwright/test";
import { randomEan } from "./barcodes";
import { adminToken, api, ensureStock, expect, loginAsAdmin, product, test, volume } from "./support";

/** A hardware scanner: the whole code within a few milliseconds, then Enter. */
async function scanner(page: Page, code: string) {
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press("Enter");
}

/** A scanner while the Russian layout is on: physical keys A/B/C arrive as Ф/И/С. */
function scannerRussianLayout(page: Page, code: string) {
  return page.evaluate(async (code) => {
    const ru: Record<string, string> = { A: "Ф", B: "И", C: "С" };
    const send = (key: string, keyCode: string, shiftKey = false) => {
      for (const type of ["keydown", "keyup"]) {
        (document.activeElement || document.body).dispatchEvent(
          new KeyboardEvent(type, { key, code: keyCode, shiftKey, bubbles: true, cancelable: true }),
        );
      }
    };
    for (const ch of code) {
      if (/[A-Z]/.test(ch)) send(ru[ch], `Key${ch}`, true);
      else send(ch, `Digit${ch}`);
      await new Promise((r) => setTimeout(r, 5));
    }
    send("Enter", "Enter");
  }, code);
}

test("ручной сканер: срабатывает где бы ни стоял курсор и в русской раскладке", async ({ page }) => {
  const admin = await adminToken();
  const coco = await product(admin, "coco");
  const sauvage = await product(admin, "sauvage");
  const coco50 = volume(coco, 50);
  const coco100 = volume(coco, 100);
  const sauvage100 = volume(sauvage, 100);
  await ensureStock(admin, coco50, 3);
  await ensureStock(admin, sauvage100, 3);
  const ean = randomEan();
  const alnum = `ABC${Math.floor(10000 + Math.random() * 89999)}`;
  await api("POST", `/admin/variants/${coco50.id}/barcodes`, admin, { code: ean });
  await api("POST", `/admin/variants/${sauvage100.id}/barcodes`, admin, { code: alnum });
  const receipt = await api("POST", "/admin/receipts", admin, {});
  await api("POST", `/admin/receipts/${receipt.id}/lines`, admin, { variant_id: coco100.id, quantity: 1 });
  const lines = async (): Promise<Record<number, number>> =>
    Object.fromEntries(
      (await api("GET", `/admin/receipts/${receipt.id}`, admin)).items.map((i: { variant_id: number; quantity: number }) => [
        i.variant_id,
        i.quantity,
      ]),
    );

  await loginAsAdmin(page);
  await page.goto(`/admin/receipts/${receipt.id}`);
  const scanField = page.getByPlaceholder("Отсканируйте штрихкод");
  await expect(scanField).toBeVisible();

  await test.step("курсор в поле количества другой строки", async () => {
    const qty100 = page.locator("li", { hasText: "Coco Mademoiselle, 100 мл" }).locator("input").first();
    await qty100.click();
    await scanner(page, ean);
    await expect(page.getByRole("status").getByText("Chanel Coco Mademoiselle, 50 мл")).toBeVisible();
    await expect.poll(async () => (await lines())[coco50.id]).toBe(1);
    expect((await lines())[coco100.id], "the field the scan landed in is unchanged").toBe(1);
    await expect(qty100).toHaveValue("1");
    await expect(scanField).toBeFocused();
  });

  await test.step("человек медленно печатает цифры в поле поставщика — это не скан", async () => {
    const supplier = page.getByLabel("Поставщик");
    await supplier.click();
    await page.keyboard.type(ean, { delay: 90 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    expect((await lines())[coco50.id]).toBe(1);
    await expect(supplier).toHaveValue(ean);
    await supplier.fill("");
  });

  await test.step("курсор нигде", async () => {
    await page.getByRole("heading", { name: /Приёмка/ }).click();
    await scanner(page, ean);
    await expect.poll(async () => (await lines())[coco50.id]).toBe(2);
  });

  await test.step("русская раскладка: ФИС… читается как ABC…", async () => {
    await page.getByRole("heading", { name: /Приёмка/ }).click();
    await scannerRussianLayout(page, alnum);
    await expect(page.getByRole("status").getByText("Dior Sauvage, 100 мл")).toBeVisible();
    await expect.poll(async () => (await lines())[sauvage100.id]).toBe(1);

    const russian = alnum.replace("A", "Ф").replace("B", "И").replace("C", "С");
    await scanField.fill(russian);
    await scanField.press("Enter");
    await expect.poll(async () => (await lines())[sauvage100.id]).toBe(2);
  });

  await test.step("касса: курсор в имени покупателя", async () => {
    await page.goto("/admin/pos");
    const name = page.getByLabel("Имя покупателя (необязательно)");
    await name.click();
    await scanner(page, ean);
    await expect(page.getByText("В чеке, шт.")).toBeVisible();
    await expect(name).toHaveValue("");
    await expect(page.locator("li", { hasText: "Coco Mademoiselle, 50 мл" }).first()).toBeVisible();
    await name.click();
    await scannerRussianLayout(page, alnum);
    await expect(page.locator("li", { hasText: "Sauvage, 100 мл" }).first()).toBeVisible();
  });
});
