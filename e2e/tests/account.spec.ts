import {
  adminToken,
  api,
  ensureStock,
  expect,
  fromBackendLog,
  newCustomer,
  product,
  test,
  uniqueEmail,
} from "./support";

type Variant = { stock: number };
const totalStock = async (productId: number) =>
  (await api("GET", `/products/${productId}`)).variants.reduce((s: number, v: Variant) => s + v.stock, 0);

test("новый покупатель: регистрация, заказ, отмена, профиль, пароль, заявка на опт", async ({ page }) => {
  const admin = await adminToken();
  const coco = await product(admin, "coco");
  for (const v of coco.variants) await ensureStock(admin, v, 5);
  const email = uniqueEmail("buyer");

  await test.step("товар в корзине, регистрация возвращает к оформлению", async () => {
    await page.goto(`/products/${coco.id}`);
    await page.getByRole("button", { name: "В корзину" }).click();
    await expect(page.getByText("Добавлено в корзину")).toBeVisible();
    await page.goto("/register?next=/checkout");
    await page.getByLabel("Имя").fill("Аудит Тестов");
    await page.getByLabel("Телефон").fill("+7 701 111 22 33");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill("buyer-pass-1");
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();
    await page.waitForURL("**/checkout");
  });

  const stockBefore = await totalStock(coco.id);
  let orderId = 0;
  await test.step("оформление заказа списывает остаток", async () => {
    await page.getByLabel("Город").fill("Алматы");
    await page.getByLabel("Адрес").fill("пр. Абая, 10");
    await page.getByRole("button", { name: /Подтвердить заказ/ }).click();
    await page.waitForURL(/\/account\/orders\/\d+/);
    await expect(page.getByText(/Спасибо! Заказ №/)).toBeVisible();
    orderId = Number(new URL(page.url()).pathname.split("/").pop());
    expect(await totalStock(coco.id)).toBe(stockBefore - 1);
  });

  await test.step("покупатель отменяет новый заказ, товар возвращается", async () => {
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Отменить заказ" }).click();
    await expect(page.getByText("Отменён").first()).toBeVisible();
    expect((await api("GET", `/admin/orders/${orderId}`, admin)).status).toBe("cancelled");
    expect(await totalStock(coco.id)).toBe(stockBefore);
  });

  await test.step("история заказов", async () => {
    await page.goto("/account/orders");
    await expect(page.locator(`a[href='/account/orders/${orderId}']`).filter({ visible: true }).first()).toBeVisible();
  });

  await test.step("профиль сохраняется", async () => {
    await page.goto("/account");
    await page.getByLabel("Компания", { exact: true }).fill("ИП Аудит");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Сохранено")).toBeVisible();
  });

  await test.step("смена пароля", async () => {
    await page.getByLabel("Текущий пароль").fill("buyer-pass-1");
    await page.getByLabel("Новый пароль").fill("buyer-pass-2");
    await page.getByRole("button", { name: "Изменить пароль" }).click();
    await expect(page.getByText("Пароль изменён")).toBeVisible();
    const res = await api("POST", "/auth/login", null, { email, password: "buyer-pass-2" });
    expect(res.user.email).toBe(email);
  });

  await test.step("заявка на опт берёт компанию и телефон из профиля", async () => {
    await expect(page.getByLabel("Компания / ИП")).toHaveValue("ИП Аудит");
    await page.getByRole("button", { name: "Запросить оптовые цены" }).click();
    await expect(page.getByText(/Заявка на «Опт» отправлена/)).toBeVisible();
    const users = await api("GET", `/admin/users?q=${encodeURIComponent(email)}`, admin);
    expect(users.items[0].requested_role).toBe("wholesale");
  });
});

test("восстановление пароля по ссылке из письма", async ({ page }) => {
  const customer = await newCustomer("forgot");
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(customer.email);
  await page.getByRole("button", { name: "Отправить ссылку" }).click();
  await expect(page.getByText(/Если такой email зарегистрирован/)).toBeVisible();

  // Without SMTP the backend writes the email to its log.
  const escaped = customer.email.replace(/[.+]/g, "\\$&");
  const [, token] = await fromBackendLog(new RegExp(`email to ${escaped}:[\\s\\S]*?reset-password\\?token=([\\w-]+)`));
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel("Новый пароль").fill("brand-new-pass");
  await page.getByLabel("Повторите пароль").fill("brand-new-pass");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page.getByText("Пароль изменён.")).toBeVisible();
  expect((await api("POST", "/auth/login", null, { email: customer.email, password: "brand-new-pass" })).user.email).toBe(
    customer.email,
  );
});
