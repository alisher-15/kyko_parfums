import Link from "next/link";
import { HomeBrands, HomeNew, HomePromotions, HomeSale, WholesaleStrip } from "./home-sections";

export default function Home() {
  return (
    <>
      {/* The shop's name for search engines and screen readers; the page opens with its goods. */}
      <h1 className="sr-only">Kyko Parfum — парфюмерия в розницу и оптом</h1>
      <WholesaleStrip />
      <HomePromotions />
      <HomeSale />
      <HomeNew />

      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-serif text-3xl font-bold">Бренды</h2>
          <Link href="/brands" className="text-sm font-semibold text-gold">
            Все бренды →
          </Link>
        </div>
        <HomeBrands />
      </section>
    </>
  );
}
