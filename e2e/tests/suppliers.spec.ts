import { API, adminToken, api, createProduct, ensureStock, expect, loginAsAdmin, test, volume } from "./support";
import { randomEan } from "./barcodes";

/** Rows of six cells: the same number of «;» on every line, so the delimiter is clear. */
function csv(rows: (string | number)[][]): Buffer {
  return Buffer.from(rows.map((r) => [...r, "", "", "", "", "", ""].slice(0, 6).join(";")).join("\n"), "utf-8");
}

/** Канат's 1С layout: the line and its price in tenge (the dollar price beside it). */
function kanatCsv(line: string, price: number): Buffer {
  return csv([
    ["", "Прайс-лист"],
    ["", "Ценовая группа/ Номенклатура/ Характеристика номенклатуры", "Долларовая"],
    ["", "", "Цена", "Ед."],
    ["", "1. Элитка", "", "", "ОПТ ЦЕНА", "ЗАКАЗЫ"],
    ["", line, (price / 495).toFixed(2), "шт", price],
  ]);
}

/** Эрик's layout: barcode, line, «ПРИМ», «ОПТ» and the cash price (not used). */
function erikCsv(barcode: string, line: string, price: number): Buffer {
  return csv([
    ["опт", "", "Товар обмену не подлежит", "ПРИМ", "ОПТ", 480],
    ["", "ШТРИХ - КОД"],
    [price, barcode, line, "", price, price - 100],
  ]);
}

/** Apply a price list through the API (the page is tested elsewhere). */
async function applyPriceList(admin: string, supplier: string, file: Buffer, name: string) {
  const suppliers = await api("GET", "/admin/suppliers", admin);
  const id = suppliers.find((s: { name: string }) => s.name === supplier).id;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]), name);
  const res = await fetch(`${API}/admin/suppliers/${id}/price-list?dry_run=false`, {
    method: "POST",
    headers: { Authorization: `Bearer ${admin}` },
    body: form,
  });
  expect(res.ok).toBe(true);
}

/** A volume priced by hand at cost 10 000 and 16 000 / 13 000 / 12 000: markups 60 / 30 / 20 %. */
async function pricedProduct(admin: string) {
  const created = await createProduct(admin, [
    { volume_ml: 50, stock: 0, retail_price: 16000, wholesale_price: 13000, bulk_price: 12000 },
  ]);
  await api("PATCH", `/admin/variants/${created.volume(50).id}`, admin, { cost_price: 10000 });
  return created;
}

test("поставщики: прайс Каната — привязка строки, проверка, применение; цены не снижаются", async ({ page }) => {
  const admin = await adminToken();
  const { product } = await pricedProduct(admin);
  const line = `E2E LINE ${product.name} EdP 50`;
  const current = async () => volume(await api("GET", `/admin/products/${product.id}`, admin), 50);

  await loginAsAdmin(page);
  await page.goto("/admin/suppliers");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: /Канат/ }) });
  await card.locator('input[type=file][aria-label="Прайс Канат"]').setInputFiles({
    name: "kanat.csv",
    mimeType: "text/csv",
    buffer: kanatCsv(line, 11000),
  });
  await expect(card.getByText("Проверка «kanat.csv» — ещё ничего не изменено")).toBeVisible();
  await expect(card.getByText(/не сопоставлено: 1\./)).toBeVisible();

  // Link the unknown line to the volume: the check runs again and finds it.
  const row = card.locator("li", { hasText: line });
  await row.getByRole("button", { name: "Привязать" }).click();
  await row.getByPlaceholder("Найдите товар на сайте").fill(product.name);
  await row.getByRole("button", { name: new RegExp(product.name) }).click();
  await expect(card.getByText(/не сопоставлено: 0\./)).toBeVisible();
  await expect(card.getByText("Цены продажи вырастут у 1 объёма.")).toBeVisible();
  expect((await current()).retail_price).toBe(16000);

  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Применить" }).click();
  await expect(card.getByText(/Прайс «kanat\.csv» загружен/)).toBeVisible();
  expect(await current()).toMatchObject({ cost_price: 11000, retail_price: 17600, wholesale_price: 14300, bulk_price: 13200 });

  // A lower price: the cost goes down, the prices stay.
  await card.locator('input[type=file][aria-label="Прайс Канат"]').setInputFiles({
    name: "kanat2.csv",
    mimeType: "text/csv",
    buffer: kanatCsv(line, 9000),
  });
  await expect(card.getByText("Цены продажи вырастут у 0 объёмов.")).toBeVisible();
  await expect(card.getByText(/у 1 объёма цены продажи остаются прежними/)).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Применить" }).click();
  await expect(card.getByText(/Прайс «kanat2\.csv» загружен/)).toBeVisible();
  expect(await current()).toMatchObject({ cost_price: 9000, retail_price: 17600, wholesale_price: 14300, bulk_price: 13200 });

  // The product card shows both suppliers' prices: Эрик has none.
  await page.goto(`/admin/products/${product.id}`);
  await expect(page.getByText(/Канат:\s*9\s000/)).toBeVisible();
  await expect(page.getByText(/Эрик:\s*—/)).toBeVisible();
});

test("поставщики: прайс Эрика находит товар по штрихкоду", async ({ page }) => {
  const admin = await adminToken();
  const { product, volume: vol } = await pricedProduct(admin);
  const ean = randomEan();
  await api("POST", `/admin/variants/${vol(50).id}/barcodes`, admin, { code: ean });
  // Канат's list must have come first: until then other lists don't change costs.
  await applyPriceList(admin, "Канат", kanatCsv(`E2E other ${Date.now()}`, 1000), "kanat.csv");

  await loginAsAdmin(page);
  await page.goto("/admin/suppliers");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: /Эрик/ }) });
  await card.locator('input[type=file][aria-label="Прайс Эрик"]').setInputFiles({
    name: "erik.csv",
    mimeType: "text/csv",
    buffer: erikCsv(ean, `E2E ${product.name} EDP 50ML`, 12000),
  });
  await expect(card.getByText(/Сопоставлено: 1 \(по штрихкоду 1\)/)).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Применить" }).click();
  await expect(card.getByText(/Прайс «erik\.csv» загружен/)).toBeVisible();

  // Канат doesn't have it: Эрик's price is the cost; 12 000 × 1.6 = 19 200.
  const v = volume(await api("GET", `/admin/products/${product.id}`, admin), 50);
  expect(v).toMatchObject({ cost_price: 12000, retail_price: 19200, wholesale_price: 15600, bulk_price: 14400 });
  await page.goto(`/admin/products/${product.id}`);
  await expect(page.getByText(/Эрик:\s*12\s000/)).toBeVisible();
  await expect(page.getByText(/Канат:\s*—/)).toBeVisible();
});

test("поставщики: приёмка берёт цену из прайса, касса показывает себестоимость и маржу", async ({ page }) => {
  const admin = await adminToken();
  const { product, volume: vol } = await pricedProduct(admin);
  const v = vol(50);
  const ean = randomEan();
  await api("POST", `/admin/variants/${v.id}/barcodes`, admin, { code: ean });
  // Канат's line is linked to the volume, Эрик's is found by its barcode.
  const line = `E2E COST ${product.name} 50`;
  const kanat = (await api("GET", "/admin/suppliers", admin)).find((s: { name: string }) => s.name === "Канат").id;
  await api("POST", `/admin/suppliers/${kanat}/links`, admin, { line, variant_id: v.id });
  await applyPriceList(admin, "Канат", kanatCsv(line, 11000), "kanat.csv");
  await applyPriceList(admin, "Эрик", erikCsv(ean, `E2E ${product.name} 50ML`, 12500), "erik.csv");
  // Канат's 11 000 is the cost: the retail price rose from 16 000 to 17 600.

  await test.step("приёмка без поставщика: закупочная цена из прайса Каната, рядом цена Эрика", async () => {
    const receipt = await api("POST", "/admin/receipts", admin, {});
    await loginAsAdmin(page);
    await page.goto(`/admin/receipts/${receipt.id}`);
    const scan = page.getByPlaceholder("Отсканируйте штрихкод");
    await scan.fill(ean);
    await scan.press("Enter");
    await expect(page.getByRole("status")).toContainText(
      /Закупочная цена 11\s000\s₸ · Канат: 11\s000\s₸ · Эрик: 12\s500\s₸/,
    );
    const row = page.locator("li", { hasText: product.name });
    await expect(row).toContainText(/Канат: 11\s000\s₸ · Эрик: 12\s500\s₸/);
    await expect(row.getByLabel(/Цена/)).toHaveValue("11000");
  });

  await test.step("касса: себестоимость и маржа видны только по переключателю", async () => {
    await ensureStock(admin, v, 2);
    await page.goto("/admin/pos");
    const search = page.getByPlaceholder("Название, бренд или штрихкод");
    await search.fill(ean);
    await search.press("Enter");
    const row = page.locator("li", { hasText: `${product.name}, 50 мл` }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText(/Себестоимость/)).toHaveCount(0);
    await page.getByLabel("Показать себестоимость").check();
    // 17 600 − 11 000 = 6 600, 38% of the price.
    await expect(row).toContainText(/Себестоимость 11\s000\s₸ · маржа 6\s600\s₸ \(38%\)/);
    await expect(page.getByText(/^Себестоимость 11\s000\s₸ · маржа 6\s600\s₸ \(38%\)$/)).toHaveCount(2);
  });
});
