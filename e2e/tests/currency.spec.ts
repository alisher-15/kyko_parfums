import { adminToken, api, createProduct, expect, loginAsAdmin, newCustomer, placeOrder, test } from "./support";

test("доллар: курс в админке, переключатель ₸ / $ на витрине", async ({ page, openPage }) => {
  const admin = await adminToken();
  const { product, volume } = await createProduct(admin, [{ volume_ml: 50, stock: 20, retail_price: 50000 }]);
  const v50 = volume(50);
  // No real mig.kz in tests (RATE_SOURCE_URL is empty): the admin types the rate.
  const reset = () => api("PUT", "/admin/currency", admin, { adjustment: 0, manual_rate: null });

  try {
    await test.step("без курса кнопки ₸ / $ на сайте нет", async () => {
      await reset();
      expect((await api("GET", "/currency")).usd_rate).toBeNull();
      const guest = await openPage();
      await guest.goto(`/products/${product.id}`);
      await expect(guest.getByRole("button", { name: "В корзину" })).toBeVisible();
      await expect(guest.getByRole("group", { name: "Валюта" })).toHaveCount(0);
    });

    await test.step("админ вводит курс, поправка сдвигает курс mig.kz", async () => {
      await loginAsAdmin(page);
      await page.goto("/admin/settings");
      const card = page.getByRole("form", { name: "Курс доллара" });
      await expect(card.getByText("курс не задан")).toBeVisible();
      await expect(card.getByText(/источник курса отключён/)).toBeVisible();

      await card.getByPlaceholder("например, 505").fill("500");
      await card.getByRole("button", { name: "Сохранить курс" }).click();
      await expect(card.getByText("Курс сохранён")).toBeVisible();
      await expect(card.getByText("1 $ = 500,00 ₸").first()).toBeVisible();
      expect((await api("GET", "/currency")).usd_rate).toBe(500);

      // Nonsense is refused before saving.
      await card.getByLabel("Поправка, ₸").fill("70");
      await expect(card.getByRole("button", { name: "Сохранить курс" })).toBeDisabled();
      await card.getByRole("button", { name: "0", exact: true }).click();

      // The quick buttons add to the shift. (Its effect on the mig.kz rate is in the backend tests.)
      await card.getByRole("button", { name: "+10" }).click();
      await expect(card.getByLabel("Поправка, ₸")).toHaveValue("10");
      await card.getByRole("button", { name: "−5" }).click();
      await expect(card.getByLabel("Поправка, ₸")).toHaveValue("5");
      await card.getByRole("button", { name: "0", exact: true }).click();
    });

    await test.step("с курсом mig.kz админ задаёт только поправку", async () => {
      // No real mig.kz here: the admin API answers as if mig.kz had given 441.90.
      const now = new Date().toISOString();
      const fromMig = {
        effective_rate: 446.9,
        source_rate: 441.9,
        source_updated_at: now,
        checked_at: now,
        source_error: null,
        adjustment: 5,
        manual_rate: null,
      };
      await page.route("**/api/admin/currency", (route) =>
        route.request().method() === "GET" ? route.fulfill({ json: fromMig }) : route.fallback(),
      );
      await page.goto("/admin/settings");
      const card = page.getByRole("form", { name: "Курс доллара" });
      await expect(card.getByText("1 $ = 446,90 ₸").first()).toBeVisible();
      await expect(card.getByText("mig.kz 441,90 ₸ + 5,00 ₸ поправка.")).toBeVisible();
      // A rate typed by hand would not be used, so there is no field for it.
      await expect(card.getByLabel("Курс вручную, ₸")).toHaveCount(0);
      await card.getByRole("button", { name: "+10" }).click();
      await expect(card.getByText(/После сохранения на сайте будет/)).toContainText("1 $ = 456,90 ₸");
      await page.unroute("**/api/admin/currency");
    });

    const shopper = await openPage();
    await test.step("покупатель включает доллары: карточка, корзина с оплатой в тенге", async () => {
      await shopper.goto(`/products/${product.id}`);
      await expect(shopper.getByText(/50\s000\s₸/).first()).toBeVisible();
      await shopper.getByRole("button", { name: "Цены в долларах" }).click();
      await expect(shopper.getByText("$100.00").first()).toBeVisible();
      await expect(shopper.getByText(/50\s000\s₸/)).toHaveCount(0);

      // The choice is remembered on other pages and after a reload.
      await shopper.reload();
      await expect(shopper.getByText("$100.00").first()).toBeVisible();

      await shopper.getByRole("button", { name: "В корзину" }).click();
      await shopper.goto("/cart");
      await expect(shopper.getByText("$100.00").first()).toBeVisible();
      await expect(shopper.getByText(/Оплата в тенге:\s*50\s000\s₸/)).toBeVisible();
      await expect(shopper.getByText(/курс 1 \$ = 500 ₸/)).toBeVisible();
    });

    await test.step("заказы остаются в тенге, переключатель возвращает цены", async () => {
      const buyer = await newCustomer("dollar");
      const order = await placeOrder(buyer.token, [{ variant_id: v50.id, quantity: 1 }]);
      const own = await openPage();
      await own.goto("/login");
      await own.fill("input[autocomplete=username]", buyer.email);
      await own.fill("input[type=password]", buyer.password);
      await own.getByRole("button", { name: "Войти" }).click();
      await own.waitForURL((url) => !url.pathname.startsWith("/login"));
      await own.getByRole("button", { name: "Цены в долларах" }).click();
      await own.goto(`/account/orders/${order.id}`);
      await expect(own.getByText(/50\s000\s₸/).first()).toBeVisible();
      await expect(own.getByText("$100.00")).toHaveCount(0);

      await shopper.goto(`/products/${product.id}`);
      await shopper.getByRole("button", { name: "Цены в тенге" }).click();
      await expect(shopper.getByText(/50\s000\s₸/).first()).toBeVisible();
    });
  } finally {
    await reset();
  }
});
