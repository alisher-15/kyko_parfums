import Link from "next/link";
import { HomeBrands, HomeProducts } from "./home-sections";

export default function Home() {
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-white to-cream">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <p className="text-xs font-semibold tracking-[0.3em] text-gold uppercase">
              Парфюмерия и косметика
            </p>
            <h1 className="mt-4 font-serif text-5xl leading-[1.05] font-bold md:text-6xl">
              Ароматы, которые
              <br />
              <span className="text-gold">рассказывают о вас</span>
            </h1>
            <p className="mt-6 max-w-md text-muted">
              Нишевая и селективная парфюмерия с подробными нотами, стойкостью и олфактивными
              группами. Розница и оптовые поставки для магазинов.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/catalog" className="btn btn-primary">
                Перейти в каталог
              </Link>
              <Link href="/register" className="btn btn-outline">
                Оптовым клиентам
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ["Розница", "Цены для всех покупателей"],
              ["Опт", "Сниженные цены от порога заказа"],
              ["Крупный опт", "Лучшие цены для дистрибьюторов"],
            ].map(([title, text], i) => (
              <div
                key={title}
                className={`card flex flex-col justify-end p-4 ${i === 1 ? "translate-y-6 bg-ink text-white" : ""}`}
                style={{ minHeight: 180 }}
              >
                <div className="font-serif text-2xl font-bold">{title}</div>
                <div className={`mt-1 text-xs ${i === 1 ? "text-stone-300" : "text-muted"}`}>
                  {text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-serif text-3xl font-bold">Новые поступления</h2>
          <Link href="/catalog?sort=new" className="text-sm font-semibold text-gold">
            Все товары →
          </Link>
        </div>
        <HomeProducts />
      </section>

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
