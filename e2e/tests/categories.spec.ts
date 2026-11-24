import { adminToken, api, expect, loginAsAdmin, test } from "./support";

type Node = { id: number; parent_id: number | null; name: string; kind: string };

async function tree(admin: string): Promise<Node[]> {
  return api("GET", "/admin/categories", admin);
}

function find(all: Node[], section: string, group?: string): Node {
  const top = all.find((c) => c.parent_id === null && c.name === section)!;
  return group ? all.find((c) => c.parent_id === top.id && c.name === group)! : top;
}

test.describe("Разделы каталога", () => {
  test("разделы с главной и «Все категории»: раздел показывает свои группы и товары", async ({ page }) => {
    const admin = await adminToken();
    const all = await tree(admin);
    const lips = find(all, "Макияж", "Губы");
    const tag = `${Date.now()}`;
    const brand = await api("POST", "/admin/brands", admin, { name: `E2E Makeup ${tag}` });
    const lipstick = await api("POST", "/admin/products", admin, {
      brand_id: brand.id,
      name: `Помада ${tag}`,
      category_id: lips.id,
      is_active: true,
      variants: [{ volume_ml: 4, stock: 3, retail_price: 9000 }],
    });
    try {
      await page.goto("/");
      // Sections other than perfume sit next to «Для неё», «Тестеры»… in «С чего начнём?».
      const start = page.getByRole("navigation", { name: "С чего начнём" });
      await expect(start.getByRole("link", { name: /^Для неё/ })).toBeVisible();
      await expect(start.getByRole("link", { name: /^Макияж/ })).toBeVisible();

      // «Все категории» opens every section as a card (as Kaspi's «Категории»).
      await page.getByRole("link", { name: "Все категории →" }).click();
      await expect(page).toHaveURL(/\/categories$/);
      await expect(page.getByRole("heading", { level: 1, name: "Категории" })).toBeVisible();
      const cards = page.getByRole("navigation", { name: "Категории" });
      await expect(cards.getByRole("link", { name: "Парфюмерия" })).toBeVisible();
      // A section with groups opens its groups first, as on Kaspi, then «Все товары» or a group.
      await cards.getByRole("link", { name: "Макияж" }).click();
      await expect(page).toHaveURL(/\/categories\?parent=\d+$/);
      await expect(page.getByRole("heading", { level: 1, name: "Макияж" })).toBeVisible();
      await expect(cards.getByRole("link", { name: "Губы" })).toBeVisible();
      await cards.getByRole("link", { name: /^Все товары/ }).click();
      await expect(page).toHaveURL(new RegExp(`/catalog\\?category_id=${find(all, "Макияж").id}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Макияж" })).toBeVisible();
      const groups = page.getByLabel("Подразделы");
      await expect(groups.getByRole("link", { name: "Губы" })).toBeVisible();
      await expect(page.getByText(`Помада ${tag}`)).toBeVisible();
      // A cosmetics section has no «Для кого»: its products have no gender.
      await expect(page.getByText("Для кого")).toHaveCount(0);

      await groups.getByRole("link", { name: "Губы" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Губы" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Разделы" })).toContainText("Каталог / Макияж");

      // The product's page leads back to its section.
      await page.getByText(`Помада ${tag}`).click();
      await expect(page.getByRole("link", { name: "Губы" }).first()).toBeVisible();
    } finally {
      await api("DELETE", `/admin/products/${lipstick.id}`, admin).catch(() => {});
    }
  });

  test("админка: раздел у товара и группа в «Категориях»", async ({ page }) => {
    const admin = await adminToken();
    await loginAsAdmin(page);

    // A new product starts as a perfume; a cosmetics section hides the perfume fields.
    await page.goto("/admin/products/new");
    const section = page.getByLabel("Раздел");
    await expect(section.locator("option:checked")).toHaveText("Парфюмерия");
    await expect(page.getByLabel("Олфактивная группа")).toBeVisible();
    await section.selectOption({ label: "   Губы" });
    await expect(page.getByLabel("Олфактивная группа")).toHaveCount(0);

    // A group added in «Категории» can be renamed and deleted while it is empty.
    const name = `Тушь ${Date.now()}`;
    await page.goto("/admin/categories");
    const makeup = page.locator(".card").filter({ hasText: "Макияж" }).first();
    await makeup.getByRole("button", { name: "+ Группа" }).first().click();
    await page.getByLabel(/Новая группа в «Макияж»/).fill(name);
    await page.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(page.getByText(name)).toBeVisible();
    const created = (await tree(admin)).find((c) => c.name === name)!;
    expect(created.parent_id).toBe(find(await tree(admin), "Макияж").id);
    page.once("dialog", (d) => d.accept());
    await page
      .locator("div.flex", { hasText: name })
      .last()
      .getByRole("button", { name: "Удалить" })
      .click();
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
