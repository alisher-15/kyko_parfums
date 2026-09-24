import { api, expect, productLinks, test } from "./support";

test.describe("Витрина для гостя", () => {
  test("главная показывает подборки и товары", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Новые поступления")).toBeVisible();
    await expect(page.locator("a[href^='/products/']").first()).toBeVisible();
  });

  test("каталог: поиск, фильтры, сортировка", async ({ page }) => {
    const chanel = await api("GET", "/products?q=chanel");
    expect(chanel.total).toBeGreaterThan(0);
    expect(chanel.items.every((p: { brand: { name: string } }) => /chanel/i.test(p.brand.name))).toBe(true);
    await page.goto("/catalog?q=chanel");
    await expect.poll(() => productLinks(page)).toBe(chanel.total);

    // What the user types is searched as text: % and _ are not wildcards.
    expect((await api("GET", "/products?q=%25")).total).toBe(0);
    expect((await api("GET", "/products?q=sa_vage")).total).toBe(0);

    const female = await api("GET", "/products?gender=female&page_size=100");
    expect(female.total).toBeGreaterThan(0);
    expect(female.items.every((p: { gender: string }) => p.gender === "female")).toBe(true);
    await page.goto("/catalog?gender=female");
    await expect.poll(() => productLinks(page)).toBe(Math.min(female.total, 24));

    const prices = (await api("GET", "/products?sort=price_asc&page_size=100")).items
      .map((p: { min_price: number | null }) => p.min_price)
      .filter((x: number | null) => x !== null);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    const filters = await api("GET", "/filters");
    expect(filters.brands.length).toBeGreaterThan(0);
    expect(filters.price_min).toBeGreaterThan(0);
  });

  test("страница брендов", async ({ page }) => {
    await page.goto("/brands");
    await expect(page.getByText("Chanel").first()).toBeVisible();
  });

  test("карточка товара и корзина гостя", async ({ page }) => {
    const coco = (await api("GET", "/products?q=coco")).items[0];
    const detail = await api("GET", `/products/${coco.id}`);
    for (const v of detail.variants) {
      expect(v.wholesale_price, "a guest never gets wholesale prices").toBeNull();
      expect(v.bulk_price).toBeNull();
      expect(v).not.toHaveProperty("cost_price");
    }

    await page.goto(`/products/${coco.id}`);
    await page.getByRole("button", { name: "В корзину" }).click();
    await expect(page.getByText("Добавлено в корзину")).toBeVisible();

    await page.goto("/cart");
    await expect(page.getByText("Итого").first()).toBeVisible();
    await expect(page.locator("a[href='/login?next=/checkout']")).toBeVisible();
  });
});
