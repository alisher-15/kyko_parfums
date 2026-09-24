"""Demo data for local development: `python -m app.cli seed-demo`.

Idempotent: re-running updates prices/stock of the demo products instead of duplicating them.
"""

from decimal import Decimal

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Brand, Gender, PricingMode, Product, ProductVariant, User, UserRole
from app.security import hash_password
from app.services.settings import get_pricing_settings

# (brand, name, type, olfactory group, gender, longevity, top, heart, base, description,
#  {volume_ml: retail_price})
# fmt: off
DEMO_PRODUCTS = [
    ("Chanel", "Coco Mademoiselle", "EDP", "Шипровые", Gender.female, "Стойкий",
     "Апельсин, бергамот, грейпфрут", "Роза, жасмин, личи", "Пачули, ветивер, ваниль",
     "Свежий восточный аромат для независимой и смелой женщины.", {50: 72000, 100: 98000}),
    ("Chanel", "Bleu de Chanel", "EDP", "Древесные", Gender.male, "Стойкий",
     "Грейпфрут, лимон, мята", "Имбирь, мускатный орех, жасмин", "Ладан, ветивер, кедр",
     "Древесно-ароматический аромат, воплощение свободы.", {50: 64000, 100: 89000}),
    ("Dior", "Sauvage", "EDT", "Фужерные", Gender.male, "Стойкий",
     "Калабрийский бергамот, перец", "Сычуаньский перец, лаванда, герань", "Амброксан, кедр",
     "Радикально свежая композиция с благородными древесными нотами.", {60: 52000, 100: 69000}),
    ("Dior", "J'adore", "EDP", "Цветочные", Gender.female, "Средняя",
     "Груша, дыня, магнолия", "Жасмин, тубероза, роза", "Мускус, ваниль, кедр",
     "Букет из самых изысканных цветов.", {50: 61000, 100: 84000}),
    ("Tom Ford", "Tobacco Vanille", "Parfum", "Восточные", Gender.unisex, "Очень стойкий",
     "Табачный лист, пряности", "Ваниль, какао, бобы тонка", "Сухофрукты, древесные ноты",
     "Роскошный и тёплый аромат английского клуба.", {50: 145000, 100: 210000}),
    ("Tom Ford", "Lost Cherry", "Parfum", "Восточные", Gender.unisex, "Стойкий",
     "Чёрная вишня, горький миндаль", "Турецкая роза, жасмин", "Перуанский бальзам, сандал",
     "Соблазнительная вишня с миндальными нотами.", {30: 98000, 50: 152000}),
    ("Maison Francis Kurkdjian", "Baccarat Rouge 540", "EDP", "Древесные", Gender.unisex,
     "Очень стойкий", "Шафран, жасмин", "Амбровое дерево", "Кедр, ель",
     "Поэтичная алхимия: светящаяся, воздушная, минеральная.", {35: 118000, 70: 175000}),
    ("Creed", "Aventus", "EDP", "Фруктовые", Gender.male, "Стойкий",
     "Ананас, бергамот, чёрная смородина", "Берёза, пачули, жасмин", "Мускус, дубовый мох",
     "Символ силы, власти и успеха.", {50: 138000, 100: 199000}),
    ("Yves Saint Laurent", "Black Opium", "EDP", "Восточные", Gender.female, "Стойкий",
     "Розовый перец, груша", "Кофе, жасмин", "Ваниль, пачули, кедр",
     "Кофейный аромат с адреналиновым характером.", {30: 38000, 50: 51000, 90: 72000}),
    ("Yves Saint Laurent", "Libre", "EDP", "Цветочные", Gender.female, "Средняя",
     "Лаванда, мандарин", "Апельсиновый цвет, жасмин", "Ваниль, амбра, кедр",
     "Аромат свободы: лаванда и апельсиновый цвет.", {30: 41000, 50: 56000, 90: 78000}),
    ("Giorgio Armani", "Acqua di Gio", "EDT", "Акватические", Gender.male, "Средняя",
     "Лайм, лимон, бергамот", "Морские ноты, жасмин", "Белый мускус, кедр, пачули",
     "Классика свежести средиземноморского моря.", {50: 39000, 100: 54000}),
    ("Giorgio Armani", "Si", "EDP", "Шипровые", Gender.female, "Стойкий",
     "Чёрная смородина", "Роза, фрезия", "Ваниль, пачули, амбра",
     "Современный шипр для сильной женщины.", {30: 36000, 50: 49000, 100: 68000}),
    ("Lancôme", "La Vie Est Belle", "EDP", "Гурманские", Gender.female, "Очень стойкий",
     "Чёрная смородина, груша", "Ирис, жасмин, флёрдоранж", "Пралине, ваниль, пачули",
     "Жизнь прекрасна — сладкий аромат счастья.", {30: 37000, 50: 50000, 100: 71000}),
    ("Kilian", "Angels' Share", "EDP", "Гурманские", Gender.unisex, "Стойкий",
     "Коньяк", "Корица, бобы тонка, дуб", "Пралине, ваниль, сандал",
     "Ароматическое путешествие в погреба Коньяка.", {50: 165000}),
    ("Byredo", "Gypsy Water", "EDP", "Древесные", Gender.unisex, "Средняя",
     "Бергамот, лимон, перец", "Ладан, сосновые иглы", "Амбра, ваниль, сандал",
     "Романтизированный образ цыганского образа жизни.", {50: 89000, 100: 128000}),
    ("Montale", "Intense Cafe", "EDP", "Восточные", Gender.unisex, "Очень стойкий",
     "Розовый цвет", "Кофе", "Ваниль, амбра, белый мускус",
     "Бархатный кофейно-розовый аккорд.", {50: 42000, 100: 58000}),
    ("Paco Rabanne", "1 Million", "EDT", "Пряные", Gender.male, "Стойкий",
     "Грейпфрут, мята, мандарин", "Роза, корица, специи", "Кожа, амбра, пачули",
     "Дерзкий аромат роскоши и успеха.", {50: 36000, 100: 49000, 200: 72000}),
    ("Versace", "Eros", "EDT", "Фужерные", Gender.male, "Стойкий",
     "Мята, зелёное яблоко, лимон", "Бобы тонка, амброксан, герань", "Ваниль, ветивер, кедр",
     "Аромат страсти и желания.", {30: 26000, 50: 34000, 100: 46000}),
    ("Versace", "Bright Crystal", "EDT", "Цветочные", Gender.female, "Средняя",
     "Юдзу, гранат", "Пион, магнолия, лотос", "Мускус, красное дерево, амбра",
     "Свежий, чувственный цветочный аромат.", {30: 24000, 50: 31000, 90: 42000}),
    ("Byredo", "Bal d'Afrique", "EDP", "Цитрусовые", Gender.unisex, "Средняя",
     "Бергамот, лимон, бархатцы", "Фиалка, жасмин, цикламен", "Ветивер, мускус, кедр",
     "Ода африканской культуре и парижскому авангарду 1920-х.", {50: 89000}),
]
# fmt: on

DEMO_USERS = [
    ("retail@example.com", UserRole.retail, "Анна Розница", None),
    ("wholesale@example.com", UserRole.wholesale, "Бахыт Оптовик", "ТОО «Парфюм Опт»"),
    ("bulk@example.com", UserRole.bulk_wholesale, "Дина Крупный Опт", "ТОО «Beauty Distribution»"),
]
DEMO_PASSWORD = "password123"


def _round(v: Decimal) -> Decimal:
    return (v / 100).quantize(Decimal("1")) * 100


def seed_demo() -> None:
    with SessionLocal() as db:
        brands = {b.name: b for b in db.scalars(select(Brand))}
        for i, (
            brand_name,
            name,
            ptype,
            cat,
            gender,
            longevity,
            top,
            mid,
            base,
            desc,
            volumes,
        ) in enumerate(DEMO_PRODUCTS):
            brand = brands.get(brand_name)
            if brand is None:
                brand = brands[brand_name] = Brand(name=brand_name)
                db.add(brand)
            product = db.scalar(
                select(Product).join(Brand).where(Brand.name == brand_name, Product.name == name)
            )
            if product is None:
                product = Product(brand=brand, name=name)
                db.add(product)
            product.type, product.category, product.gender = ptype, cat, gender
            product.longevity, product.description = longevity, desc
            product.top_notes, product.mid_notes, product.base_notes = top, mid, base

            existing = {v.volume_ml: v for v in product.variants}
            for volume, retail in volumes.items():
                retail = Decimal(retail)
                v = existing.get(volume) or ProductVariant(volume_ml=volume)
                v.retail_price = retail
                v.wholesale_price = _round(retail * Decimal("0.85"))
                v.bulk_price = _round(retail * Decimal("0.75"))
                v.stock = (i * 7 + volume) % 40  # some variants end up out of stock
                if v not in product.variants:
                    product.variants.append(v)

        for email, role, full_name, company in DEMO_USERS:
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                db.add(
                    User(
                        email=email,
                        password_hash=hash_password(DEMO_PASSWORD),
                        role=role,
                        full_name=full_name,
                        company_name=company,
                    )
                )

        settings = get_pricing_settings(db)
        # Wholesale prices depend on the role only; no order-size thresholds.
        settings.mode = PricingMode.order_total
        settings.wholesale_min_order_amount = Decimal(0)
        settings.bulk_min_order_amount = Decimal(0)
        settings.wholesale_min_item_qty = 1
        settings.bulk_min_item_qty = 1
        db.commit()

    print(f"Seeded {len(DEMO_PRODUCTS)} demo products and demo users:")
    for email, role, *_ in DEMO_USERS:
        print(f"  {email:24} {role.value:15} password: {DEMO_PASSWORD}")
