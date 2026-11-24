import { adminToken, api, createProduct, expect, loginAsAdmin, test } from "./support";

test("баннер и сторис по шаблону: превью, скачивание и баннер акции", async ({ page }) => {
  const admin = await adminToken();
  const { product } = await createProduct(admin, [{ volume_ml: 50, stock: 5, retail_price: 30000 }]);

  await test.step("«Баннеры и сторис»: превью и JPG", async () => {
    await loginAsAdmin(page);
    await page.goto("/admin/creatives");
    await page.getByPlaceholder("Новогодняя неделя Tom Ford").fill("Неделя ароматов");
    await page.getByPlaceholder("−15%").fill("−20%");
    await page.getByPlaceholder("Найти товар: название или бренд").fill(product.name);
    await page.getByTestId("creative-maker").getByRole("button", { name: new RegExp(product.name) }).click();
    await expect(page.getByText("Флаконы на картинке · 1 из 3")).toBeVisible();
    await expect(page.getByTestId("creative-preview")).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
    await page.getByRole("button", { name: /Сторис 1080×1920/ }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Скачать JPG" }).click();
    expect((await download).suggestedFilename()).toBe("kyko-story.jpg");
  });

  await test.step("форма акции: «Сделать по шаблону» ставит готовый баннер", async () => {
    const title = `Баннер E2E ${Date.now()}`;
    await page.goto("/admin/promotions/new");
    await page.getByLabel("Название").fill(title);
    await page.getByRole("button", { name: "Сделать по шаблону" }).click();
    await expect(page.getByTestId("creative-preview")).toBeVisible();
    await page.getByRole("button", { name: "Поставить баннером акции" }).click();
    await expect(page.getByLabel(/Готовый баннер/)).toBeChecked();
    await page.getByRole("button", { name: "Создать акцию" }).click();
    await expect(page).toHaveURL(/\/admin\/promotions\/\d+/);
    const id = Number(page.url().split("/").pop());
    try {
      const saved = await api("GET", `/admin/promotions/${id}`, admin);
      expect(saved.image_only).toBe(true);
      expect(saved.image_url).toMatch(/\/creatives\/[0-9a-f]+\.jpg$/);
    } finally {
      await api("DELETE", `/admin/promotions/${id}`, admin);
    }
  });
});
