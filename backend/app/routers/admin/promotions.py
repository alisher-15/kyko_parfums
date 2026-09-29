"""Promotions: home page banners with an optional discount (see services/promotions.py)."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Brand, Product, Promotion
from app.schemas.promotions import (
    PromotionBrief,
    PromotionIn,
    PromotionOut,
    PromotionStatus,
)
from app.services.promotions import shop_today

router = APIRouter(prefix="/promotions")


def status_of(promotion: Promotion, today: date) -> PromotionStatus:
    if not promotion.is_active:
        return PromotionStatus.off
    if promotion.starts_on and promotion.starts_on > today:
        return PromotionStatus.scheduled
    if promotion.ends_on and promotion.ends_on < today:
        return PromotionStatus.ended
    return PromotionStatus.running


def _load(db: Session, promotion_id: int) -> Promotion:
    promotion = db.scalar(
        select(Promotion)
        .where(Promotion.id == promotion_id)
        .options(
            selectinload(Promotion.brands),
            selectinload(Promotion.products).joinedload(Product.brand),
        )
        .execution_options(populate_existing=True)
    )
    if promotion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Акция не найдена")
    return promotion


def _brief_fields(p: Promotion, today: date) -> dict:
    return dict(
        id=p.id,
        title=p.title,
        image_url=p.image_url,
        image_only=p.image_only,
        discount_percent=p.discount_percent,
        starts_on=p.starts_on,
        ends_on=p.ends_on,
        is_active=p.is_active,
        all_products=p.all_products,
        brands_count=len(p.brands),
        products_count=len(p.products),
        status=status_of(p, today),
    )


def _out(db: Session, p: Promotion) -> PromotionOut:
    return PromotionOut(
        **_brief_fields(p, shop_today(db)),
        description=p.description,
        brands=p.brands,
        products=p.products,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _apply(db: Session, promotion: Promotion, data: PromotionIn) -> None:
    for field in (
        "title",
        "description",
        "image_url",
        "image_only",
        "discount_percent",
        "starts_on",
        "ends_on",
        "is_active",
        "all_products",
    ):
        setattr(promotion, field, getattr(data, field))
    brand_ids, product_ids = set(data.brand_ids), set(data.product_ids)
    brands = db.scalars(select(Brand).where(Brand.id.in_(brand_ids))).all() if brand_ids else []
    products = (
        db.scalars(select(Product).where(Product.id.in_(product_ids))).all() if product_ids else []
    )
    if len(brands) != len(brand_ids):
        raise HTTPException(422, "Бренд не найден")
    if len(products) != len(product_ids):
        raise HTTPException(422, "Товар не найден")
    # The whole catalog makes a list pointless.
    promotion.brands = [] if data.all_products else list(brands)
    promotion.products = [] if data.all_products else list(products)


@router.get("", response_model=list[PromotionBrief])
def list_promotions(db: Session = Depends(get_db)):
    today = shop_today(db)
    promotions = db.scalars(
        select(Promotion)
        .options(selectinload(Promotion.brands), selectinload(Promotion.products))
        .order_by(Promotion.id.desc())
    ).all()
    return [PromotionBrief(**_brief_fields(p, today)) for p in promotions]


@router.get("/{promotion_id}", response_model=PromotionOut)
def get_promotion(promotion_id: int, db: Session = Depends(get_db)):
    return _out(db, _load(db, promotion_id))


@router.post("", response_model=PromotionOut, status_code=status.HTTP_201_CREATED)
def create_promotion(data: PromotionIn, db: Session = Depends(get_db)):
    promotion = Promotion()
    _apply(db, promotion, data)
    db.add(promotion)
    db.commit()
    return _out(db, _load(db, promotion.id))


@router.put("/{promotion_id}", response_model=PromotionOut)
def update_promotion(promotion_id: int, data: PromotionIn, db: Session = Depends(get_db)):
    promotion = _load(db, promotion_id)
    _apply(db, promotion, data)
    db.commit()
    return _out(db, _load(db, promotion_id))


@router.delete("/{promotion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_promotion(promotion_id: int, db: Session = Depends(get_db)):
    """Orders sold under it keep its title (order_items.promotion_title)."""
    promotion = db.get(Promotion, promotion_id)
    if promotion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Акция не найдена")
    db.delete(promotion)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
