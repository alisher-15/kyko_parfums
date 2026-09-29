import { adminToken, api, expect, loginAsAdmin, test } from "./support";

/** The catalog tree the migrations create, by name: «Макияж», «Макияж / Губы»… */
async function categoryId(admin: string, path: string): Promise<number> {
  const all = await api("GET", "/admin/categories", admin);
  const names = path.split(" / ");
  let parent: number | null = null;
  let found: { id: number } | undefined;
  for (const name of names) {
    found = all.find((c: { name: string; parent_id: number | null }) => c.name === name && c.parent_id === parent);
    if (!found) throw new Error(`no category ${path}`);
    parent = found.id;
  }
  return found!.id;
}

test("разделы: админ добавляет группу и товар косметики, витрина показывает их в меню и каталоге", async ({
  page,
  openPage,
}) => {
  const admin = await adminToken();
  const tag = Date.now();
  const group = `Тушь E2E ${tag}`;
  const name = `Volume E2E ${tag}`;
  const makeup = await categoryId(admin, "Макияж");
  const brand = await api("POST", "/admin/brands", admin, { name: `E2E Beauty ${tag}` });

  await test.step("админ добавляет группу в раздел «Макияж»", async () => {
    await loginAsAdmin(page);
    await page.goto("/admin/categories");
    await expect(page.getByText("Парфюмерия").first()).toBeVisible();
    const section = page.locator(".card", { has: page.getByText("Макияж", { exact: true }) });
    await section.getByRole("button", { name: "+ Группа" }).first().click();
    await page.getByLabel("Новая группа в «Макияж»").fill(group);
    await page.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(page.getByText(group)).toBeVisible();
  });

  let productId = 0;
  await test.step("товар косметики: без концентрации, нот и олфактивной группы", async () => {
    await page.goto("/admin/products/new");
    await page.getByLabel("Название").fill(name);
    await page.getByLabel("Бренд").selectOption({ label: brand.name });
    await page.getByLabel("Категория").selectOption({ label: `   ${group}` });
    await expect(page.getByLabel("Олфактивная группа")).toHaveCount(0);
    await expect(page.getByLabel("Верхние ноты")).toHaveCount(0);
    // A perfume section brings the perfume fields back.
    await page.getByLabel("Категория").selectOption({ label: "Парфюмерия" });
    await expect(page.getByLabel("Олфактивная группа")).toBeVisible();
    await page.getByLabel("Категория").selectOption({ label: `   ${group}` });
    await page.getByRole("button", { name: "Создать товар" }).click();
    await page.waitForURL(/\/admin\/products\/\d+$/);
    productId = Number(page.url().split("/").pop());
    await api("POST", `/admin/products/${productId}/variants`, admin, {
      volume_ml: 10,
      retail_price: 7500,
      stock: 5,
    });
    const saved = await api("GET", `/admin/products/${productId}`, admin);
    expect(saved.type).toBeNull();
  });

  const shop = await openPage();
  await test.step("в меню сайта «Макияж» с новой группой; каталог группы и хлебные крошки", async () => {
    await shop.goto("/");
    const menu = shop.getByRole("navigation", { name: "Разделы каталога" });
    await menu.getByRole("link", { name: "Макияж", exact: true }).hover();
    await menu.getByRole("link", { name: group }).click();
    await shop.waitForURL(/category_id=/);
    await expect(shop.getByRole("heading", { level: 1, name: group })).toBeVisible();
    await expect(shop.getByRole("link", { name: "Макияж", exact: true }).first()).toBeVisible();
    const card = shop.locator("a", { hasText: name }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(group);

    // The section shows the products of all its groups, and its groups as chips.
    await shop.goto(`/catalog?category_id=${makeup}`);
    await expect(shop.getByRole("heading", { level: 1, name: "Макияж" })).toBeVisible();
    const chips = shop.getByRole("navigation", { name: "Подкатегории" });
    await expect(chips.getByRole("link", { name: new RegExp(group) })).toBeVisible();
    await expect(chips.getByRole("link", { name: /^Глаза/ })).toBeVisible();
    await expect(shop.locator("a", { hasText: name }).first()).toBeVisible();

    await shop.goto(`/products/${productId}`);
    await expect(shop.getByRole("link", { name: group })).toBeVisible();
    await expect(shop.getByText("Верхние ноты")).toHaveCount(0);
  });

  await test.step("у парфюмерии в меню «Женские», «Мужские», «Унисекс»", async () => {
    await shop.goto("/");
    const menu = shop.getByRole("navigation", { name: "Разделы каталога" });
    await menu.getByRole("link", { name: "Парфюмерия", exact: true }).hover();
    await menu.getByRole("link", { name: "Женские" }).click();
    await shop.waitForURL(/gender=female/);
    await expect(shop.getByRole("heading", { level: 1, name: "Парфюмерия" })).toBeVisible();
    await expect(shop.getByRole("checkbox", { name: "Женский" })).toBeChecked();
  });

  await test.step("группу с товаром не удалить; пустую — можно", async () => {
    await page.goto("/admin/categories");
    const row = page.locator("div", { hasText: group }).filter({ has: page.getByRole("button", { name: "Удалить" }) }).last();
    await expect(row.getByRole("button", { name: "Удалить" })).toBeDisabled();
    await api("DELETE", `/admin/products/${productId}`, admin);
    await page.reload();
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByText(group)).toHaveCount(0);
  });
});
