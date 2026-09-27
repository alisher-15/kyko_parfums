"""Which promotions run today and which products they cover.

A promotion runs when it is switched on and today (in the shop's time zone, settings.timezone)
is between its start and end dates, both inclusive. It covers the whole catalog or the brands
and products listed. Prices are in pricing.py (Deal, promo_price); the SQL here mirrors them for
catalog sorting and filtering.
"""

from collections.abc import Iterable
from datetime import date

from sqlalchemy import Date, and_, cast, exists, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    PriceTier,
    Product,
    ProductVariant,
    Promotion,
    promotion_brands,
    promotion_products,
)
from app.pricing import Deal


def today_expr():
    """Today's date in the shop's time zone, computed by the database."""
    return cast(func.timezone(get_settings().timezone, func.now()), Date)


def shop_today(db: Session) -> date:
    return db.scalar(select(today_expr()))


def running():
    """SQL condition: the promotion is on today."""
    today = today_expr()
    return and_(
        Promotion.is_active,
        or_(Promotion.starts_on.is_(None), Promotion.starts_on <= today),
        or_(Promotion.ends_on.is_(None), Promotion.ends_on >= today),
    )


def covers(product_id, brand_id):
    """SQL condition: the promotion covers the product with these id columns.

    The EXISTS clauses take Promotion and Product from the enclosing queries, however deep.
    """
    return or_(
        Promotion.all_products,
        exists()
        .where(
            promotion_products.c.promotion_id == Promotion.id,
            promotion_products.c.product_id == product_id,
        )
        .correlate_except(promotion_products),
        exists()
        .where(
            promotion_brands.c.promotion_id == Promotion.id,
            promotion_brands.c.brand_id == brand_id,
        )
        .correlate_except(promotion_brands),
    )


def best_discount():
    """Scalar subquery correlated to Product: the best running discount, or NULL."""
    return (
        select(func.max(Promotion.discount_percent))
        .where(
            running(),
            Promotion.discount_percent.is_not(None),
            covers(Product.id, Product.brand_id),
        )
        .correlate(Product)
        .scalar_subquery()
    )


def price_expr(tier: PriceTier):
    """SQL counterpart of the price a customer of this tier pays: the tier price, or the
    promotion price when it is lower (see pricing.deal_price). Needs Product in the query."""
    if tier == PriceTier.bulk:
        tier_price = func.coalesce(
            ProductVariant.bulk_price, ProductVariant.wholesale_price, ProductVariant.retail_price
        )
    elif tier == PriceTier.wholesale:
        tier_price = func.coalesce(ProductVariant.wholesale_price, ProductVariant.retail_price)
    else:
        tier_price = ProductVariant.retail_price
    promo = func.round(ProductVariant.retail_price * (100 - best_discount()) / 100)
    # LEAST ignores NULL: without a discount it is the tier price.
    return func.least(tier_price, promo)


def on_sale():
    """SQL condition on Product: a running promotion gives it a discount."""
    return best_discount().is_not(None)


def in_promotion(promotion_id: int):
    """SQL condition on Product: the promotion covers it (running or not)."""
    return (
        exists()
        .where(Promotion.id == promotion_id, covers(Product.id, Product.brand_id))
        .correlate_except(Promotion)
    )


def deals_for(db: Session, products: Iterable[Product]) -> dict[int, Deal]:
    """The best running discount of each product that has one, keyed by product id."""
    products = list(products)
    if not products:
        return {}
    promos = db.scalars(
        select(Promotion).where(running(), Promotion.discount_percent.is_not(None))
    ).all()
    if not promos:
        return {}
    ids = [p.id for p in promos]
    brands: dict[int, set[int]] = {}
    for promotion_id, brand_id in db.execute(
        select(promotion_brands.c.promotion_id, promotion_brands.c.brand_id).where(
            promotion_brands.c.promotion_id.in_(ids)
        )
    ):
        brands.setdefault(promotion_id, set()).add(brand_id)
    listed: dict[int, set[int]] = {}
    for promotion_id, product_id in db.execute(
        select(promotion_products.c.promotion_id, promotion_products.c.product_id).where(
            promotion_products.c.promotion_id.in_(ids),
            promotion_products.c.product_id.in_([p.id for p in products]),
        )
    ):
        listed.setdefault(promotion_id, set()).add(product_id)

    deals: dict[int, Deal] = {}
    for product in products:
        best = max(
            (
                p
                for p in promos
                if p.all_products
                or product.brand_id in brands.get(p.id, ())
                or product.id in listed.get(p.id, ())
            ),
            key=lambda p: (p.discount_percent, -p.id),
            default=None,
        )
        if best is not None:
            deals[product.id] = Deal(best.id, best.title, best.discount_percent, best.ends_on)
    return deals


def deals_for_variants(db: Session, variants: Iterable[ProductVariant]) -> dict[int, Deal]:
    """deals_for, keyed by variant id."""
    variants = list(variants)
    by_product = deals_for(db, {v.product.id: v.product for v in variants}.values())
    return {v.id: by_product[v.product_id] for v in variants if v.product_id in by_product}
