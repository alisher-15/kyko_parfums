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
      expect(v.stock === null || v.stock <= 5, "stock only when few are left, as for everyone").toBe(true);
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

  test("вход истёк при оформлении: заказ не уходит гостевым по рознице, форма сохранена", async ({ page }) => {
    const admin = await adminToken();
    const coco = await product(admin, "coco");
    await ensureStock(admin, coco.variants[0], 2);
    const buyer = await newCustomer("expired", "wholesale");
    await login(page, buyer.email, buyer.password);
    await page.goto(`/products/${coco.id}`);
    await page.getByRole("button", { name: "В корзину" }).click();
    await page.goto("/checkout");
    await page.getByLabel("Имя и фамилия").fill("Оптовик Тестов");
    await page.getByLabel("Телефон").fill("+7 701 111 22 33");
    await page.getByLabel("Город").fill("Алматы");
    await page.getByLabel("Адрес").fill("пр. Абая, 5");
    await page.getByLabel(/согласие на обработку/).check();
    const before = (await api("GET", "/admin/orders?page_size=1", admin)).total;

    // The session ends meanwhile (a password change on another device): both tokens are dead.
    await page.evaluate(() =>
      localStorage.setItem("kyko.tokens", JSON.stringify({ access_token: "dead", refresh_token: "dead" })),
    );
    await page.getByRole("button", { name: /Подтвердить заказ/ }).click();
    // Whether the dead session shows up on sending or just before it, the form comes back as a
    // guest's with what was typed, and says so.
    await expect(page.getByText("Вход истёк, заказ не отправлен.")).toBeVisible();
    await expect(page.getByLabel("Город")).toHaveValue("Алматы");
    await expect(page.getByLabel("Адрес")).toHaveValue("пр. Абая, 5");
    expect((await api("GET", "/admin/orders?page_size=1", admin)).total, "no guest order").toBe(before);

    await page.getByRole("link", { name: "Войдите снова" }).click();
    await page.fill("input[autocomplete=username]", buyer.email);
    await page.fill("input[type=password]", buyer.password);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL("**/checkout");
    await expect(page.getByLabel("Адрес")).toHaveValue("пр. Абая, 5");
    await page.getByLabel(/согласие на обработку/).check();
    await page.getByRole("button", { name: /Подтвердить заказ/ }).click();
    await page.waitForURL(/\/account\/orders\/\d+/);
  });
});
