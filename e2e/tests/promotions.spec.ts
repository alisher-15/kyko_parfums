import { adminToken, api, createProduct, expect, loginAsAdmin, newCustomer, placeOrder, test } from "./support";

test("новинка: галочка в карточке товара ставит его в «Новые поступления»", async ({ page, openPage }) => {
  const admin = await adminToken();
  const { product } = await createProduct(admin, [{ volume_ml: 50, stock: 5, retail_price: 30000 }]);
  try {
    await loginAsAdmin(page);
    await page.goto(`/admin/products/${product.id}`);
    await page.getByLabel(/^Новинка/).check();
    await page.getByRole("button", { name: "Сохранить изменения" }).click();
    await expect.poll(async () => (await api("GET", `/admin/products/${product.id}`, admin)).is_new).toBe(true);
    await expect(page.getByLabel(/^Новинка/)).toBeChecked();

    const guest = await openPage();
    await guest.goto("/");
    const block = guest.locator("section", { has: guest.getByRole("heading", { name: "Новые поступления" }) });
    const card = block.locator(`a[href='/products/${product.id}']`);
    await expect(card).toBeVisible();
    await expect(card.getByText("Новинка")).toBeVisible();
    await block.getByRole("link", { name: "Все новинки →" }).click();
    await expect(guest.getByRole("heading", { name: "Новинки" })).toBeVisible();
    await expect(guest.locator(`a[href='/products/${product.id}']`).first()).toBeVisible();
  } finally {
    await api("PATCH", `/admin/products/${product.id}`, admin, { is_new: false });
  }
});

test("акция: баннер, скидка в карточке и корзине, заказ и касса", async ({ page, openPage }) => {
  const admin = await adminToken();
  const { product, volume } = await createProduct(admin, [
    { volume_ml: 50, stock: 20, retail_price: 30000, wholesale_price: 26000, bulk_price: 22000 },
  ]);
  const v50 = volume(50);
  const title = `Акция E2E ${Date.now()}`;
  let promotionId = 0;
  try {
    await test.step("админ заводит акцию −20% на товар", async () => {
      await loginAsAdmin(page);
      await page.goto("/admin/promotions/new");
      await page.getByLabel("Название").fill(title);
      await page.getByLabel("Текст на баннере").fill("Только на этой неделе");
      await page.getByLabel("Скидка, %").fill("20");
      await page.getByPlaceholder("Найти товар: название или бренд").fill(product.name);
      await page.getByRole("button", { name: new RegExp(product.name) }).click();
      await page.getByRole("button", { name: "Создать акцию" }).click();
      await page.waitForURL(/\/admin\/promotions\/\d+$/);
      promotionId = Number(new URL(page.url()).pathname.split("/").pop());
      await expect(page.getByText("Идёт").first()).toBeVisible();
    });

    const guest = await openPage();
    await test.step("гость: баннер на главной ведёт к товарам акции", async () => {
      await guest.goto("/");
      const banner = guest.locator(`a[href='/catalog?promotion_id=${promotionId}']`);
      await expect(banner).toContainText(title);
      await expect(banner).toContainText("−20%");
      await banner.click();
      await expect(guest.getByRole("heading", { name: title })).toBeVisible();
      const card = guest.locator(`a[href='/products/${product.id}']`).first();
      await expect(card).toContainText("−20%");
      await expect(card).toContainText(/24\s000/);
    });

    await test.step("карточка товара и корзина считают цену по акции", async () => {
      await guest.goto(`/products/${product.id}`);
      await expect(guest.getByText("Акция −20%")).toBeVisible();
      await expect(guest.getByText(`«${title}»`)).toBeVisible();
      await guest.getByRole("button", { name: "В корзину" }).click();
      await guest.goto("/cart");
      await expect(guest.getByText(`Акция «${title}»`)).toBeVisible();
      await expect(guest.getByText(/24\s000/).first()).toBeVisible();
    });

    await test.step("заказ запоминает акцию, оптовик платит меньшую цену, касса тоже", async () => {
      const buyer = await newCustomer("promo");
      const order = await placeOrder(buyer.token, [{ variant_id: v50.id, quantity: 1 }]);
      expect(order.items[0]).toMatchObject({ price_applied: 24000, list_price: 30000, promotion_title: title });

      const wholesale = await newCustomer("promo-wh", "wholesale");
      const seen = await api("GET", `/products/${product.id}`, wholesale.token);
      expect(seen.variants[0]).toMatchObject({ price: 24000, price_tier: "wholesale" });

      const till = await api("POST", "/admin/store/quote", admin, {
        items: [{ variant_id: v50.id, quantity: 1, discount_percent: 5 }],
      });
      expect(till.lines[0]).toMatchObject({ unit_price: 24000, promotion_title: title });
    });

    await test.step("выключенная акция пропадает с сайта", async () => {
      await page.getByLabel("Включена").uncheck();
      await page.getByRole("button", { name: "Сохранить акцию" }).click();
      await expect(page.getByText("Выключена").first()).toBeVisible();
      expect((await api("GET", `/products/${product.id}`)).variants[0]).toMatchObject({ price: 30000, deal: null });
      await guest.goto("/");
      await expect(guest.getByText("Новые поступления")).toBeVisible();
      await expect(guest.locator(`a[href='/catalog?promotion_id=${promotionId}']`)).toHaveCount(0);
    });
  } finally {
    if (promotionId) await api("DELETE", `/admin/promotions/${promotionId}`, admin).catch(() => {});
  }
});
