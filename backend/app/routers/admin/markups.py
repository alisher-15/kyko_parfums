from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Brand, Product
from app.schemas.markups import (
    BaseMarkupIn,
    BrandMarkupIn,
    BrandMarkupOut,
    MarkupsOut,
    RepriceLine,
    RepriceReport,
)
from app.services import markups
from app.services.settings import get_pricing_settings

router = APIRouter()

LINES_LIMIT = 300


def _brand_out(brand: Brand, product_count: int) -> BrandMarkupOut:
    return BrandMarkupOut(
        id=brand.id,
        name=brand.name,
        product_count=product_count,
        retail=brand.retail_markup,
        wholesale=brand.wholesale_markup,
        bulk=brand.bulk_markup,
    )


@router.get("/markups", response_model=MarkupsOut)
def get_markups(db: Session = Depends(get_db)):
    base = markups.base_markups(get_pricing_settings(db))
    rows = db.execute(
        select(Brand, func.count(Product.id))
        .outerjoin(Product, Product.brand_id == Brand.id)
        .group_by(Brand.id)
        .order_by(Brand.name)
    ).all()
    return MarkupsOut(
        base=BaseMarkupIn(retail=base.retail, wholesale=base.wholesale, bulk=base.bulk),
        brands=[_brand_out(b, count) for b, count in rows],
    )


@router.put("/markups/base", response_model=MarkupsOut)
def update_base(data: BaseMarkupIn, db: Session = Depends(get_db)):
    settings = get_pricing_settings(db)
    base = markups.Markups(data.retail, data.wholesale, data.bulk)
    broken = markups.brands_out_of_order(base, db.scalars(select(Brand).order_by(Brand.name)).all())
    if broken:
        names = ", ".join(broken[:5]) + (f" и ещё {len(broken) - 5}" if len(broken) > 5 else "")
        raise HTTPException(
            422,
            f"С такой базовой наценкой у брендов {names} опт получится дороже розницы "
            "или крупный опт дороже опта. Сначала уменьшите их надбавки.",
        )
    settings.retail_markup, settings.wholesale_markup, settings.bulk_markup = (
        data.retail,
        data.wholesale,
        data.bulk,
    )
    db.commit()
    return get_markups(db)


@router.put("/markups/brands/{brand_id}", response_model=BrandMarkupOut)
def update_brand(brand_id: int, data: BrandMarkupIn, db: Session = Depends(get_db)):
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(404, "Бренд не найден")
    brand.retail_markup, brand.wholesale_markup, brand.bulk_markup = (
        data.retail,
        data.wholesale,
        data.bulk,
    )
    error = markups.order_error(
        markups.brand_markups(markups.base_markups(get_pricing_settings(db)), brand)
    )
    if error:
        db.rollback()
        raise HTTPException(422, f"У бренда {brand.name} итоговая {error}")
    db.commit()
    count = db.scalar(select(func.count(Product.id)).where(Product.brand_id == brand.id)) or 0
    return _brand_out(brand, count)


@router.post("/markups/recalculate", response_model=RepriceReport)
def recalculate(
    dry_run: bool = Query(default=True),
    brand_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Prices of every volume (or of one brand) by the markups: check first, then apply."""
    if brand_id is not None and db.get(Brand, brand_id) is None:
        raise HTTPException(404, "Бренд не найден")
    plan = markups.plan_reprice(db, get_pricing_settings(db), brand_id, lock=not dry_run)

    def jump(c: markups.Change) -> float:
        old = c.old[0] or 1
        return float(abs(c.new[0] - c.old[0]) / old)

    lines = [
        RepriceLine(
            variant_id=c.variant.id,
            product_id=c.variant.product_id,
            label=c.variant.label,
            cost_price=c.variant.cost_price,
            old_retail=c.old[0],
            old_wholesale=c.old[1],
            old_bulk=c.old[2],
            retail=c.new[0],
            wholesale=c.new[1],
            bulk=c.new[2],
        )
        for c in sorted(plan.changes, key=jump, reverse=True)[:LINES_LIMIT]
    ]
    report = RepriceReport(
        dry_run=dry_run,
        changed=len(plan.changes),
        raised=sum(c.new[0] > c.old[0] for c in plan.changes),
        lowered=sum(c.new[0] < c.old[0] for c in plan.changes),
        unchanged=plan.unchanged,
        locked=plan.locked,
        no_cost=plan.no_cost,
        lines=lines,
    )
    if dry_run:
        db.rollback()
    else:
        markups.apply(plan)
        db.commit()
    return report
