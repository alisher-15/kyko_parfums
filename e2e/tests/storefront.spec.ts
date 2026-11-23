import { adminToken, api, createProduct, expect, loginAsAdmin, productLinks, test } from "./support";

test.describe("Витрина для гостя", () => {
  test("главная показывает подборки и товары", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Горячие предложения").first()).toBeVisible();
    await expect(page.locator("a[href^='/products/']").first()).toBeVisible();
    // No big banner: one line invites shops to wholesale, a guest goes to registration.
    await expect(page.getByRole("link", { name: "Стать оптовым клиентом →" })).toHaveAttribute("href", "/register");
    // The shop's contacts in the footer.
    for (const [name, href] of [
      [/^WhatsApp/, "https://wa.me/77474848194"],
      [/^Telegram/, "https://t.me/KYK0_parfum"],
      [/^Instagram/, "https://www.instagram.com/kyk0_parfum"],
    ] as const) {
      await expect(page.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  test("бегущая строка топовых брендов: дорогие дома сами, галочка в «Бренды»", async ({ page, openPage }) => {
    const admin = await adminToken();
    const brands: { id: number; name: string; is_top: boolean }[] = await api("GET", "/admin/brands", admin);
    const creed = brands.find((b) => b.name === "Creed")!;
    const versace = brands.find((b) => b.name === "Versace")!;
    expect(creed.is_top).toBe(true);
    expect(versace.is_top).toBe(false);
    try {
      await loginAsAdmin(page);
      await page.goto("/admin/brands");
      await page.getByLabel("Versace: в бегущей строке на главной").check();
      await expect.poll(async () => (await api("GET", "/admin/brands", admin)).find((b: { id: number }) => b.id === versace.id).is_top).toBe(true);

      // With reduced motion the line keeps still (a row to scroll), so a link can be clicked.
      const guest = await openPage({ reducedMotion: "reduce" });
      await guest.goto("/");
      const line = guest.getByRole("navigation", { name: "Топовые бренды" });
      await expect(line.getByRole("link", { name: "Creed" }).first()).toBeVisible();
      await expect(line.getByRole("link", { name: "Versace" }).first()).toBeAttached();
      // Products on promotion are behind the banners: no «Акции» block of their own.
      await expect(guest.getByRole("heading", { name: "Акции" })).toHaveCount(0);
      await line.getByRole("link", { name: "Creed" }).first().click();
      await expect(guest).toHaveURL(new RegExp(`brand_id=${creed.id}`));
    } finally {
      await api("PATCH", `/admin/brands/${versace.id}`, admin, { is_top: false });
    }
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

  test("поиск по-русски, в другой раскладке, с опечаткой и по другим названиям", async ({ page }) => {
    // A Russian name finds the same products as the Latin one.
    const chanel = await api("GET", "/products?q=chanel");
    await page.goto("/");
    const search = page.getByPlaceholder("Поиск по аромату или бренду").filter({ visible: true });
    await search.fill("шанель");
    await search.press("Enter");
    await page.waitForURL(/\/catalog\?q=/);
    await expect.poll(() => productLinks(page)).toBe(chanel.total);

    // "sauvage" typed with the Russian layout on.
    await page.goto(`/catalog?q=${encodeURIComponent("ыфгмфпу")}`);
    await expect(page.locator("a[href^='/products/']").filter({ hasText: "Sauvage" }).first()).toBeVisible();

    // A typo: no exact match, the closest products are offered as similar.
    await page.goto("/catalog?q=savage");
    await expect(page.getByText("Точно по запросу «savage» ничего нет. Похожие товары:")).toBeVisible();
    await expect(page.locator("a[href^='/products/']").filter({ hasText: "Sauvage" }).first()).toBeVisible();

    // A name of its own, set in the admin panel.
    const admin = await adminToken();
    const { product } = await createProduct(admin, [{ volume_ml: 50, stock: 1, retail_price: 10000 }]);
    const nickname = `ласточка${Date.now()}`;
    await loginAsAdmin(page);
    await page.goto(`/admin/products/${product.id}`);
    await page.getByLabel("Другие названия для поиска").fill(`${nickname}, птичка`);
    await page.getByRole("button", { name: "Сохранить изменения" }).click();
    await expect(page.getByText("Сохранено")).toBeVisible();
    await page.goto(`/catalog?q=${nickname}`);
    await expect.poll(() => productLinks(page)).toBe(1);
    await expect(page.locator("a[href^='/products/']").filter({ hasText: product.name }).first()).toBeVisible();
  });

  test("оферта и политика конфиденциальности открываются из подвала", async ({ page }) => {
    await page.goto("/");
    for (const [link, heading] of [
      ["Публичная оферта", "Публичная оферта"],
      ["Политика конфиденциальности", "Политика конфиденциальности"],
    ]) {
      await page.locator("footer").getByRole("link", { name: link }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText(/^Редакция от /)).toBeVisible();
      await page.goBack();
    }
  });

  test("страница брендов", async ({ page }) => {
    await page.goto("/brands");
    await expect(page.getByText("Chanel").first()).toBeVisible();
  });

  test("о наличии витрина говорит, только когда товара мало", async ({ page }) => {
    const admin = await adminToken();
    const { product } = await createProduct(admin, [
      { volume_ml: 30, stock: 12, retail_price: 20000 },
      { volume_ml: 50, stock: 2, retail_price: 30000 },
      { volume_ml: 100, stock: 0, retail_price: 50000 },
    ]);
    const detail = await api("GET", `/products/${product.id}`);
    expect(detail.variants.map((v: { stock: number | null }) => v.stock)).toEqual([null, 2, null]);
    expect(detail).not.toHaveProperty("in_stock");
    expect(detail.variants[0]).not.toHaveProperty("availability");

    await page.goto(`/products/${product.id}`);
    await page.getByRole("button", { name: /^50 мл/ }).click();
    await expect(page.getByText("Осталось мало: 2 шт.")).toBeVisible();
    for (const ml of [30, 100]) {
      await page.getByRole("button", { name: new RegExp(`^${ml} мл`) }).click();
      await expect(page.getByRole("button", { name: "В корзину" })).toBeEnabled();
      await expect(page.getByText(/Осталось мало|В наличии|Нет в наличии|Под заказ/)).toHaveCount(0);
    }
    await page.goto("/catalog");
    await expect(page.locator("a[href^='/products/']").first()).toBeVisible();
    await expect(page.getByText(/Под заказ|Только в наличии/)).toHaveCount(0);
  });

  test("карточка товара, корзина и заказ гостя без регистрации", async ({ page }) => {
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

    // No account needed: the guest orders at retail prices and gets a link of their own.
    await page.getByRole("link", { name: "Оформить заказ" }).click();
    await page.waitForURL("**/checkout");
    await expect(page.getByText("Можно без регистрации — по розничным ценам.")).toBeVisible();
    const phone = `+7 7${String(Date.now()).slice(-9)}`;
    await page.getByLabel("Имя и фамилия").fill("Гость Тестов");
    await page.getByLabel("Телефон").fill(phone);
    await page.getByLabel("Город").fill("Алматы");
    await page.getByLabel("Адрес").fill("пр. Абая, 1");
    // Without the consent to the processing of personal data the browser won't send the form.
    await page.getByRole("button", { name: /^Подтвердить заказ/ }).click();
    const consent = page.getByLabel(/согласие на обработку/);
    expect(await consent.evaluate((box: HTMLInputElement) => box.validity.valueMissing)).toBe(true);
    await expect(page).toHaveURL(/\/checkout$/);
    await consent.check();
    await page.getByRole("button", { name: /^Подтвердить заказ/ }).click();
    await page.waitForURL(/\/orders\/\d+\?key=.+&created=1$/);
    const link = new URL(page.url());
    const orderId = Number(link.pathname.split("/").pop());
    await expect(page.getByText(`Заказ № ${orderId} создан`)).toBeVisible();
    await expect(page.getByText("Сохраните эту страницу в закладки")).toBeVisible();

    const admin = await adminToken();
    const placed = await api("GET", `/admin/orders/${orderId}`, admin);
    expect(placed.user_email).toBeNull();
    expect(placed.customer_role).toBe("retail");
    expect(placed.contact_phone).toBe(phone);

    // The link opens the order in another browser too; without its key it is not found.
    const other = await page.context().browser()!.newPage();
    await other.goto(`${link.pathname}?key=${link.searchParams.get("key")}`);
    await expect(other.getByRole("heading", { name: new RegExp(`Заказ № ${orderId}`) })).toBeVisible();
    await other.goto(link.pathname);
    await expect(other.getByText("Заказ не найден")).toBeVisible();
    await other.close();

    // The guest cancels it; the shop sees who it was.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Отменить заказ" }).click();
    await expect(page.getByText("Отменён").first()).toBeVisible();
    await loginAsAdmin(page);
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByText("Без регистрации · розничные цены")).toBeVisible();
  });
});
