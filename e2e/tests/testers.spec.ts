import { devices } from "@playwright/test";
import {
  adminToken,
  api,
  createProduct,
  expect,
  horizontalOverflow,
  login,
  loginAsAdmin,
  newCustomer,
  test,
} from "./support";

test("тестер: выбор «Товар / Тестер» в карточке, цены по роли, заказ и админка", async ({ page, openPage }) => {
  const admin = await adminToken();
  const { product, volume, tester } = await createProduct(admin, [
    { volume_ml: 50, stock: 10, retail_price: 30000, wholesale_price: 26000, bulk_price: 24000 },
    { volume_ml: 100, stock: 10, retail_price: 50000, wholesale_price: 43000, bulk_price: 40000 },
    { volume_ml: 100, stock: 10, retail_price: 42000, wholesale_price: 36000, bulk_price: 33000, is_tester: true },
  ]);
  const bottleButton = (p = page) => p.getByRole("button", { name: /^Товар/ });
  const testerButton = (p = page) => p.getByRole("button", { name: /^Тестер/ });
  const volumeButton = (ml: number, p = page) => p.getByRole("button", { name: new RegExp(`^${ml} мл`) });

  await test.step("каталог: у товара один объём 100 мл, цена «от» — самая низкая", async () => {
    const listed = (await api("GET", `/products?q=${encodeURIComponent(product.name)}`)).items[0];
    expect(listed).toMatchObject({ volumes: [50, 100], min_price: 30000 });
    const detail = await api("GET", `/products/${product.id}`);
    expect(detail.variants.map((v: { volume_ml: number; is_tester: boolean }) => [v.volume_ml, v.is_tester])).toEqual([
      [50, false],
      [100, false],
      [100, true],
    ]);
    expect(detail.variants[2].wholesale_price, "a guest never gets wholesale prices").toBeNull();
  });

  await test.step("гость: сначала товар, тестер — отдельный выбор с тем же объёмом и своей ценой", async () => {
    await page.goto(`/products/${product.id}`);
    await expect(bottleButton()).toHaveAttribute("aria-pressed", "true");
    await expect(testerButton()).toContainText(/42\s000/);
    await volumeButton(100).click();
    await testerButton().click();
    await expect(testerButton()).toHaveAttribute("aria-pressed", "true");
    await expect(volumeButton(100), "the volume is kept").toHaveAttribute("aria-pressed", "true");
    await expect(volumeButton(50), "there is no 50 ml tester").toHaveCount(0);
    await expect(page.getByText(/Тестер — тот же аромат/)).toBeVisible();
    await page.getByRole("button", { name: "В корзину" }).click();
    await expect(page.getByText("Добавлено в корзину")).toBeVisible();

    await bottleButton().click();
    await expect(volumeButton(50)).toBeVisible();
    await expect(page.getByText(/Тестер — тот же аромат/)).toHaveCount(0);
    await page.getByRole("button", { name: "В корзину" }).click();

    await page.goto("/cart");
    await expect(page.getByText("100 мл, тестер")).toBeVisible();
    await expect(page.getByText("100 мл", { exact: true })).toBeVisible();
  });

  await test.step("телефон: переключатель помещается на экран", async () => {
    const phone = await openPage({ ...devices["iPhone 13"] });
    await phone.goto(`/products/${product.id}`);
    await testerButton(phone).tap();
    await expect(testerButton(phone)).toHaveAttribute("aria-pressed", "true");
    expect(await horizontalOverflow(phone)).toBeLessThanOrEqual(0);
  });

  let orderId = 0;
  await test.step("оптовик видит оптовую цену тестера и заказывает его", async () => {
    const customer = await newCustomer("tester", "wholesale");
    const m = await openPage();
    await login(m, customer.email, customer.password);
    await m.goto(`/products/${product.id}`);
    await testerButton(m).click();
    await expect(m.getByText(/36\s000/).first()).toBeVisible();
    await expect(m.getByText("Ваша следующая цена")).toBeVisible();
    await m.getByRole("button", { name: "В корзину" }).click();
    await m.goto("/cart");
    await expect(m.getByText("100 мл, тестер")).toBeVisible();
    await m.getByRole("link", { name: "Оформить заказ" }).click();
    await m.waitForURL("**/checkout");
    await m.getByLabel("Город").fill("Алматы");
    await m.getByLabel("Адрес").fill("пр. Абая, 7");
    await m.getByRole("button", { name: /Подтвердить заказ/ }).click();
    await m.waitForURL(/\/account\/orders\/\d+/);
    orderId = Number(new URL(m.url()).pathname.split("/").pop());
    await expect(m.getByText("100 мл, тестер").first()).toBeVisible();

    const order = await api("GET", `/admin/orders/${orderId}`, admin);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ variant_id: tester(100).id, is_tester: true, price_applied: 36000 });
  });

  await test.step("админка: тестер в заказе и в карточке товара, новый тестер из редактора", async () => {
    await loginAsAdmin(page);
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByText("100 мл, тестер").first()).toBeVisible();

    // Below xl every field of a volume has its own label.
    await page.setViewportSize({ width: 1200, height: 860 });
    await page.goto(`/admin/products/${product.id}`);
    const boxes = page.getByRole("checkbox", { name: "Тестер" });
    await expect(boxes).toHaveCount(4); // three volumes and the row for a new one
    expect(await boxes.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).checked))).toEqual([
      false,
      false,
      true,
      false,
    ]);

    const field = (label: string | RegExp) => page.getByLabel(label).filter({ visible: true }).last();
    await field("Объём, мл").fill("50");
    await boxes.last().check();
    await field(/^Розница/).fill("26000");
    await page.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect
      .poll(async () => (await api("GET", `/admin/products/${product.id}`, admin)).variants.length)
      .toBe(4);
    const created = (await api("GET", `/admin/products/${product.id}`, admin)).variants.find(
      (v: { volume_ml: number; is_tester: boolean }) => v.volume_ml === 50 && v.is_tester,
    );
    expect(created).toMatchObject({ retail_price: 26000, stock: 0 });
    expect(volume(50).id).not.toBe(created.id);

    // The same volume as a tester twice is refused with a clear message.
    await field("Объём, мл").fill("100");
    await boxes.last().check();
    await field(/^Розница/).fill("40000");
    await page.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(page.getByText("У товара уже есть 100 мл, тестер")).toBeVisible();
  });

  await test.step("витрина: у тестера теперь два объёма", async () => {
    await page.goto(`/products/${product.id}`);
    await testerButton().click();
    await expect(volumeButton(50)).toBeVisible();
    await expect(volumeButton(100)).toBeVisible();
    await expect(testerButton()).toContainText(/от 26\s000/);
  });
});
