import { adminToken, api, createProduct, expect, loginAsAdmin, test, volume } from "./support";

test("наценки: новая группа, перенос бренда и правка группы сразу меняют цены", async ({ page }) => {
  const admin = await adminToken();
  const { product, volume: vol } = await createProduct(admin, [
    { volume_ml: 50, stock: 0, retail_price: 1000 },
    { volume_ml: 100, stock: 0, retail_price: 2000 },
  ]);
  const brand = product.brand.name;
  await api("PATCH", `/admin/variants/${vol(50).id}`, admin, { cost_price: 10000 });
  // Priced by hand: no markup touches it.
  await api("PATCH", `/admin/variants/${vol(100).id}`, admin, { cost_price: 20000, price_locked: true });
  const group = `E2E Люкс ${Date.now()}`;
  const current = async () => api("GET", `/admin/products/${product.id}`, admin);

  try {
    await loginAsAdmin(page);
    await page.goto("/admin/markups");
    // A new group changes no price until brands are moved into it.
    await page.getByLabel("Название новой группы").fill(group);
    await page.getByLabel("Новая группа: Розница, %").fill("40");
    await page.getByLabel("Новая группа: Опт, %").fill("20");
    await page.getByLabel("Новая группа: Крупный опт, %").fill("12");
    await page.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(page.getByText(`Группа «${group}» добавлена`)).toBeVisible();

    // Moving the brand: the bar tells what changes, «Сохранить» changes it.
    await page.getByPlaceholder("Найти бренд").fill(brand);
    await page.getByLabel(`Группа бренда ${brand}`).selectOption({ label: `${group} · 40 / 20 / 12%` });
    const bar = page.locator(".sticky", { hasText: "Перенос 1 бренда" });
    await expect(bar.getByText(/изменятся цены у 1 объёма/)).toBeVisible();
    await expect(bar.getByText(/«Цена вручную» не меняется у 1 объёма/)).toBeVisible();
    expect(volume(await current(), 50).retail_price).toBe(1000);
    await bar.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Перенесено 1 бренд: обновлены цены у 1 объёма.")).toBeVisible();
    expect(volume(await current(), 50)).toMatchObject({ retail_price: 14000, wholesale_price: 12000, bulk_price: 11200 });
    expect(volume(await current(), 100).retail_price).toBe(2000);

    // Editing the group: the row tells what changes before saving.
    await page.getByLabel(`${group}: Розница, %`).fill("50");
    await expect(page.getByText(/Изменятся цены у 1 объёма \(дороже 1\)/)).toBeVisible();
    expect(volume(await current(), 50).retail_price).toBe(14000);
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByText(`Группа «${group}» сохранена: обновлены цены у 1 объёма.`)).toBeVisible();
    expect(volume(await current(), 50).retail_price).toBe(15000);
    // The storefront sells at the new price.
    const pub = await api("GET", `/products/${product.id}`);
    expect(pub.variants[0].price).toBe(15000);
  } finally {
    const markups = await api("GET", "/admin/markups", admin);
    const byDefault = markups.groups.find((g: { is_default: boolean }) => g.is_default);
    const mine = markups.groups.find((g: { name: string }) => g.name === group);
    const own = markups.brands.find((b: { name: string }) => b.name === brand);
    await api("POST", "/admin/markups/assign?dry_run=false", admin, {
      brands: [{ brand_id: own.id, group_id: byDefault.id }],
    });
    if (mine) await api("DELETE", `/admin/markups/groups/${mine.id}`, admin);
  }
});

test("наценки: цена, изменённая руками, получает «Цена вручную»", async ({ page }) => {
  const admin = await adminToken();
  const { product, volume: vol } = await createProduct(admin, [{ volume_ml: 50, stock: 0, retail_price: 30000 }]);
  await loginAsAdmin(page);
  await page.goto(`/admin/products/${product.id}`);
  // On narrow screens every field of a volume has its own label.
  await page.setViewportSize({ width: 1200, height: 860 });
  const locked = page.getByLabel("Цена вручную").filter({ visible: true }).first();
  await expect(locked).not.toBeChecked();
  await page.getByLabel(/^Розница/).filter({ visible: true }).first().fill("31000");
  await expect(locked).toBeChecked();
  await page.getByRole("button", { name: "Сохранить", exact: true }).first().click();
  await expect
    .poll(async () => volume(await api("GET", `/admin/products/${product.id}`, admin), 50).price_locked)
    .toBe(true);
  expect(volume(await api("GET", `/admin/products/${product.id}`, admin), 50).retail_price).toBe(31000);
  expect(vol(50).price_locked).toBe(false);
});
