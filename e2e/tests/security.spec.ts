import { adminToken, API, call, DEMO_PASSWORD, expect, newCustomer, placeOrder, product, test, tokenFor } from "./support";

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function upload(token: string, bytes: Buffer, type: string, name: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
  return fetch(`${API}/admin/uploads`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
}

test.describe("Безопасность", () => {
  test("заголовки безопасности и иконка сайта", async ({ request }) => {
    const res = await request.get("/catalog");
    const headers = res.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=(self)");
    expect(headers["x-powered-by"]).toBeUndefined();

    const icon = await request.get("/icon.svg");
    expect(icon.ok()).toBe(true);
    expect(await icon.text()).toContain("<svg");
  });

  test("админка и чужие заказы закрыты", async () => {
    const retail = await tokenFor("retail@example.com", DEMO_PASSWORD);
    expect((await call("GET", "/admin/stats", retail)).status).toBe(403);
    expect((await call("GET", "/admin/stats")).status).toBe(401);

    const other = await newCustomer("other");
    const coco = await product(await adminToken(), "coco");
    const order = await placeOrder(other.token, [{ variant_id: coco.variants[0].id, quantity: 1 }]);
    expect((await call("GET", `/orders/${order.id}`, retail)).status).toBe(404);
  });

  test("после входа ?next= не уводит на чужой сайт", async ({ page }) => {
    const customer = await newCustomer("redirect");
    await page.goto(`/login?next=${encodeURIComponent("/\\evil.example")}`);
    await page.fill("input[autocomplete=username]", customer.email);
    await page.fill("input[type=password]", customer.password);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((url) => url.pathname === "/account");
    expect(new URL(page.url()).host).toBe("localhost:3000");
  });

  test("после 10 неверных паролей вход закрыт", async ({ page }) => {
    const customer = await newCustomer("bruteforce");
    for (let i = 0; i < 10; i++) {
      const res = await call("POST", "/auth/login", null, { email: customer.email, password: `wrong-${i}` });
      expect(res.status).toBe(401);
    }
    const blocked = await call("POST", "/auth/login", null, { email: customer.email, password: customer.password });
    expect(blocked.status, "even the right password is refused for a while").toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    await page.goto("/login");
    await page.fill("input[autocomplete=username]", customer.email);
    await page.fill("input[type=password]", customer.password);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByText(/Слишком много неудачных попыток входа/)).toBeVisible();
  });

  test("загрузка фото: только настоящие картинки", async ({ page }) => {
    const admin = await adminToken();
    const good = await upload(admin, PNG, "image/png", "dot.png");
    expect(good.status).toBe(201);
    const { url } = await good.json();
    const served = await page.request.get(url);
    expect(served.ok()).toBe(true);
    expect(served.headers()["content-type"]).toBe("image/png");

    const fake = await upload(admin, Buffer.from("<html>not an image</html>"), "image/png", "fake.png");
    expect(fake.status).toBe(415);
  });

  test("заблокированный покупатель не входит, его сессия отозвана", async () => {
    const customer = await newCustomer("blocked");
    await call("PATCH", `/admin/users/${customer.id}`, await adminToken(), { is_active: false });
    const res = await call("POST", "/auth/login", null, { email: customer.email, password: customer.password });
    expect(res.status).toBe(403);
    expect((await call("GET", "/me", customer.token)).status).toBe(401);
  });
});
