import { adminToken, api, createProduct, expect, test } from "./support";

test.describe("Поисковики и превью ссылок", () => {
  test("страница товара: заголовок, описание, превью и цена для поисковиков", async ({ page }) => {
    const found = await api("GET", "/products?q=coco");
    const coco = await api("GET", `/products/${found.items[0].id}`);
    const prices: number[] = coco.variants.map((v: { price: number }) => v.price);

    await page.goto(`/products/${coco.id}`);
    await expect(page.getByRole("heading", { name: coco.name })).toBeVisible();
    // Made on the server, so search engines and messengers see it without running the page.
    await expect(page).toHaveTitle("Chanel Coco Mademoiselle EDP — Kyko");
    const meta = (selector: string) => page.locator(selector).getAttribute("content");
    expect(await meta("meta[name=description]")).toContain("цена от");
    expect(await meta("meta[property='og:title']")).toBe("Chanel Coco Mademoiselle EDP");
    expect(await meta("meta[property='og:site_name']")).toBe("Kyko");
    expect(await meta("meta[property='og:url']")).toBe(`http://localhost:3000/products/${coco.id}`);
    // Demo products have no photo: the shop's own picture stands in.
    const image = await meta("meta[property='og:image']");
    expect(image).toBe("http://localhost:3000/og.png");
    const picture = await page.request.get(image!);
    expect(picture.headers()["content-type"]).toBe("image/png");
    expect(await page.locator("link[rel=canonical]").getAttribute("href")).toBe(
      `http://localhost:3000/products/${coco.id}`,
    );

    // schema.org Product with the guest's (retail) prices in tenge.
    const ld = JSON.parse((await page.locator("script[type='application/ld+json']").textContent())!);
    expect(ld["@type"]).toBe("Product");
    expect(ld.brand.name).toBe("Chanel");
    expect(ld.offers).toMatchObject({
      "@type": "AggregateOffer",
      priceCurrency: "KZT",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
    });

    // No analytics counter is configured here, so no outside scripts.
    await expect(page.locator("script[src*='mc.yandex'], script[src*='googletagmanager']")).toHaveCount(0);
  });

  test("sitemap.xml и robots.txt", async ({ request }) => {
    const admin = await adminToken();
    const shown = await createProduct(admin, [{ volume_ml: 50, stock: 1, retail_price: 10000 }]);
    const hidden = await createProduct(admin, [{ volume_ml: 50, stock: 1, retail_price: 10000 }]);
    await api("PATCH", `/admin/products/${hidden.product.id}`, admin, { is_active: false });

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBe(true);
    const xml = await sitemap.text();
    expect(xml).toContain("<loc>http://localhost:3000/catalog</loc>");
    expect(xml).toContain(`<loc>http://localhost:3000/products/${shown.product.id}</loc>`);
    expect(xml).toContain(`brand_id=${shown.product.brand.id}</loc>`);
    expect(xml, "hidden products stay out").not.toContain(`/products/${hidden.product.id}<`);

    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /checkout");
    expect(robots).toContain("Sitemap: http://localhost:3000/sitemap.xml");
  });
});
