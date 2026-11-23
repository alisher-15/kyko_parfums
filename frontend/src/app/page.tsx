import { BrandMarquee, HomeCategories, HomeHot, HomePromotions, WholesaleStrip } from "./home-sections";

export default function Home() {
  return (
    <>
      {/* The shop's name for search engines and screen readers; the page opens with its goods. */}
      <h1 className="sr-only">Kyko Parfum — парфюмерия в розницу и оптом</h1>
      <WholesaleStrip />
      <HomePromotions />
      <HomeCategories />
      <BrandMarquee />
      <HomeHot />
    </>
  );
}
