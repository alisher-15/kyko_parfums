import {
  HomeBrands,
  HomeBudget,
  HomeChoice,
  HomeConsult,
  HomeHits,
  HomePromotions,
  HomeRecent,
  HomeSearch,
  HomeStart,
  HomeTesters,
  HomeTrust,
  HomeWholesale,
} from "./home-sections";

export default function Home() {
  return (
    <>
      {/* The shop's name for search engines and screen readers; the page opens with its goods. */}
      <h1 className="sr-only">Kyko — парфюмерия в розницу и оптом</h1>
      <HomeSearch />
      <HomePromotions />
      <HomeTrust />
      <HomeStart />
      <HomeHits />
      <HomeTesters />
      <HomeChoice />
      <HomeBudget />
      <HomeConsult />
      <HomeRecent />
      <HomeBrands />
      <HomeWholesale />
    </>
  );
}
