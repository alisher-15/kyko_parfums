import { adminToken, api, ensureStock, expect, login, newCustomer, product, test } from "./support";

test.describe("Оптовые цены и тизер крупного опта", () => {
  test("оптовик видит свою цену, следующую цену и выгоду в корзине", async ({ page, openPage }) => {
    const admin = await adminToken();
    const coco = await product(admin, "coco");
    for (const v of coco.variants) await ensureStock(admin, v, 5);
    const buyer = await newCustomer("wholesale", "wholesale");

    await test.step("API: оптовая цена ниже розничной, цена крупного опта скрыта", async () => {
      const [v] = (await api("GET", `/products/${coco.id}`, buyer.token)).variants;
      expect(v.price_tier).toBe("wholesale");
      expect(v.price).toBeLessThan(v.retail_price);
      expect(v.bulk_price).toBeNull();
      expect(v.next_tier).toBe("bulk");
      expect(v.next_tier_price).toBeGreaterThan(0);
      expect(v.next_tier_price).toBeLessThan(v.price);
    });

    await test.step("гость не видит тизер", async () => {
      const guest = await openPage();
      await guest.goto(`/products/${coco.id}`);
      await expect(guest.getByRole("button", { name: "В корзину" })).toBeVisible();
      await expect(guest.getByText("Ваша следующая цена")).toHaveCount(0);
    });

    await test.step("карточка товара и корзина оптовика", async () => {
      await login(page, buyer.email, buyer.password);
      await page.goto(`/products/${coco.id}`);
      await expect(page.getByText("Ваша следующая цена")).toBeVisible();
      await page.getByRole("button", { name: "В корзину" }).click();
      await page.goto("/cart");
      await expect(page.getByText(/На крупном опте этот заказ стоил бы/)).toBeVisible();
    });

    await test.step("заявка на крупный опт → админ выдаёт роль", async () => {
      await page.goto("/account");
      await page.getByPlaceholder("Например: 200 флаконов в месяц").fill("200 флаконов в месяц, 2 магазина");
      await page.getByRole("button", { name: "Запросить крупный опт" }).click();
      await expect(page.getByText(/Заявка на «Крупный опт» отправлена/)).toBeVisible();

      const adminPage = await openPage();
      await login(adminPage, "admin", "admin12345");
      await adminPage.goto("/admin/users?wholesale_requested=true");
      const row = adminPage.locator("tr", { hasText: buyer.email });
      await expect(row.getByText("Заявка: крупный опт")).toBeVisible();
      await row.locator("select").selectOption("bulk_wholesale");
      await expect
        .poll(async () => (await api("GET", `/admin/users/${buyer.id}`, admin)).role)
        .toBe("bulk_wholesale");
      expect((await api("GET", `/admin/users/${buyer.id}`, admin)).wholesale_requested).toBe(false);
    });

    await test.step("крупный опт: своя цена без тизера", async () => {
      await page.goto(`/products/${coco.id}`);
      await expect(page.getByText("Цена крупного опта").first()).toBeVisible();
      await expect(page.getByText("Ваша следующая цена")).toHaveCount(0);
    });
  });

  test("тизер выключается в настройках", async ({ page }) => {
    const admin = await adminToken();
    const coco = await product(admin, "coco");
    const buyer = await newCustomer("teaser-off", "wholesale");
    const { updated_at: _, ...settings } = await api("GET", "/admin/settings/pricing", admin);
    await api("PUT", "/admin/settings/pricing", admin, { ...settings, show_next_tier: false });
    try {
      await login(page, buyer.email, buyer.password);
      await page.goto(`/products/${coco.id}`);
      await expect(page.getByRole("button", { name: "В корзину" })).toBeVisible();
      await expect(page.getByText("Ваша следующая цена")).toHaveCount(0);
    } finally {
      await api("PUT", "/admin/settings/pricing", admin, settings);
    }
  });
});
