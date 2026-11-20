import type { Metadata } from "next";
import { money } from "@/lib/format";
import { SITE_IMAGE, SITE_OPEN_GRAPH, SITE_URL, absoluteUrl, publicProduct } from "@/lib/site";
import type { ProductDetail } from "@/lib/types";
import { ProductView } from "./product-view";

function title(p: ProductDetail): string {
  return [p.brand.name, p.name, p.type].filter(Boolean).join(" ");
}

function description(p: ProductDetail): string {
  const parts = [title(p)];
  if (p.volumes.length) parts.push(`${p.volumes.join(", ")} мл`);
  if (p.min_price !== null) parts.push(`цена от ${money(p.min_price)}`);
  const notes = [p.top_notes, p.mid_notes, p.base_notes].filter(Boolean).join(", ");
  if (notes) parts.push(`ноты: ${notes}`);
  return `${parts.join(" · ")}. Оригинальная парфюмерия в розницу и оптом.`.slice(0, 300);
}

/** Title, description and the link preview (photo, price) are made on the server, for search
 *  engines and messengers; the page itself is client-rendered (prices depend on the role). */
export async function generateMetadata(props: PageProps<"/products/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const p = await publicProduct(Number(id));
  if (!p) return { title: "Товар" };
  const url = `${SITE_URL}/products/${p.id}`;
  return {
    title: title(p),
    description: description(p),
    alternates: { canonical: url },
    openGraph: {
      ...SITE_OPEN_GRAPH,
      url,
      title: title(p),
      description: description(p),
      images: p.image_url ? [{ url: absoluteUrl(p.image_url), width: 600, height: 600 }] : [SITE_IMAGE],
    },
  };
}

/** schema.org Product: search engines show the price and the photo in results. */
function jsonLd(p: ProductDetail) {
  const prices = p.variants.map((v) => v.price);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title(p),
    brand: { "@type": "Brand", name: p.brand.name },
    image: p.image_url ? [absoluteUrl(p.image_url)] : undefined,
    description: p.description ?? description(p),
    url: `${SITE_URL}/products/${p.id}`,
    offers: prices.length
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "KZT",
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: prices.length,
        }
      : undefined,
  };
}

export default async function ProductPage(props: PageProps<"/products/[id]">) {
  const { id } = await props.params;
  const p = await publicProduct(Number(id));
  return (
    <>
      {p && (
        <script
          type="application/ld+json"
          // JSON with "<" escaped, so a product text can't close the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(p)).replace(/</g, "\\u003c") }}
        />
      )}
      <ProductView id={Number(id)} />
    </>
  );
}
