from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Brand, PriceGroup, Product
from app.schemas.markups import (
    AssignIn,
    BrandGroupOut,
    MarkupsOut,
    PriceGroupIn,
    PriceGroupOut,
    RepriceLine,
    RepriceReport,
)
from app.services import markups
from app.services.markups import Plan

router = APIRouter()

LINES_LIMIT = 300
NAME_TAKEN = "Группа с таким названием уже есть"


def _group(db: Session, group_id: int) -> PriceGroup:
    group = db.get(PriceGroup, group_id)
    if group is None:
        raise HTTPException(404, "Группа не найдена")
    return group


def _check_name(db: Session, name: str, group_id: int | None = None) -> None:
    same = select(PriceGroup.id).where(func.lower(PriceGroup.name) == name.lower())
    if group_id is not None:
        same = same.where(PriceGroup.id != group_id)
    if db.scalar(same.limit(1)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, NAME_TAKEN)


def _brand_counts(db: Session) -> dict[int | None, int]:
    rows = db.execute(select(Brand.price_group_id, func.count()).group_by(Brand.price_group_id))
    return {group_id: count for group_id, count in rows.all()}


def _group_out(group: PriceGroup, counts: dict[int | None, int]) -> PriceGroupOut:
    brand_count = counts.get(group.id, 0) + (counts.get(None, 0) if group.is_default else 0)
    return PriceGroupOut(
        id=group.id,
        name=group.name,
        retail=group.retail_markup,
        wholesale=group.wholesale_markup,
        bulk=group.bulk_markup,
        is_default=group.is_default,
        brand_count=brand_count,
    )


def _report(plan: Plan, dry_run: bool) -> RepriceReport:
    def jump(c: markups.Change) -> float:
        return float(abs(c.new[0] - c.old[0]) / (c.old[0] or 1))

    shifts = [(c.new[0] - c.old[0]) / c.old[0] * 100 for c in plan.changes if c.old[0]]
    return RepriceReport(
        dry_run=dry_run,
        changed=len(plan.changes),
        raised=sum(c.new[0] > c.old[0] for c in plan.changes),
        lowered=sum(c.new[0] < c.old[0] for c in plan.changes),
        avg_change=round(float(sum(shifts) / len(shifts)), 1) if shifts else None,
        unchanged=plan.unchanged,
        locked=plan.locked,
        no_cost=plan.no_cost,
        lines=[
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
        ],
    )


@router.get("/markups", response_model=MarkupsOut)
def get_markups(db: Session = Depends(get_db)):
    default = markups.default_group(db)
    counts = _brand_counts(db)
    groups = db.scalars(
        select(PriceGroup).order_by(PriceGroup.is_default.desc(), PriceGroup.name)
    ).all()
    brands = db.execute(
        select(Brand, func.count(Product.id))
        .outerjoin(Product, Product.brand_id == Brand.id)
        .group_by(Brand.id)
        .order_by(Brand.name)
    ).all()
    return MarkupsOut(
        groups=[_group_out(g, counts) for g in groups],
        brands=[
            BrandGroupOut(
                id=b.id, name=b.name, product_count=n, group_id=b.price_group_id or default.id
            )
            for b, n in brands
        ],
    )


@router.post("/markups/groups", response_model=PriceGroupOut, status_code=status.HTTP_201_CREATED)
def create_group(data: PriceGroupIn, db: Session = Depends(get_db)):
    """A new, empty group: no prices change until brands are moved into it."""
    markups.default_group(db)
    _check_name(db, data.name)
    group = PriceGroup(
        name=data.name,
        retail_markup=data.retail,
        wholesale_markup=data.wholesale,
        bulk_markup=data.bulk,
    )
    db.add(group)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, NAME_TAKEN) from e
    return _group_out(group, {})


@router.put("/markups/groups/{group_id}", response_model=RepriceReport)
def update_group(
    group_id: int,
    data: PriceGroupIn,
    dry_run: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    """Save a group and reprice its brands at once. With ``dry_run`` (the default): only tell
    what would change. Renaming alone changes no price."""
    group = _group(db, group_id)
    _check_name(db, data.name, group.id)
    plan = Plan()
    if data.markups != markups.group_markups(group):
        plan = markups.plan_reprice(
            db, [markups.in_group(group)], markups={group.id: data.markups}, lock=not dry_run
        )
    report = _report(plan, dry_run)
    if dry_run:
        db.rollback()
        return report
    group.name = data.name
    group.retail_markup, group.wholesale_markup, group.bulk_markup = (
        data.retail,
        data.wholesale,
        data.bulk,
    )
    markups.apply(plan)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, NAME_TAKEN) from e
    return report


@router.delete("/markups/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = _group(db, group_id)
    if group.is_default:
        raise HTTPException(status.HTTP_409_CONFLICT, "Группу по умолчанию удалить нельзя")
    if db.scalar(select(func.count(Brand.id)).where(Brand.price_group_id == group.id)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "В группе есть бренды: сначала перенесите их в другую группу"
        )
    db.delete(group)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/markups/assign", response_model=RepriceReport)
def assign_brands(
    data: AssignIn,
    dry_run: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    """Move brands to groups and reprice them at once. With ``dry_run`` (the default): only tell
    what would change."""
    default_id = markups.default_group(db).id
    group_ids = {m.group_id for m in data.brands}
    if len(db.scalars(select(PriceGroup.id).where(PriceGroup.id.in_(group_ids))).all()) != len(
        group_ids
    ):
        raise HTTPException(404, "Группа не найдена")
    # The default group is stored as "no group", so new brands land there too.
    moves = {m.brand_id: None if m.group_id == default_id else m.group_id for m in data.brands}
    brands = db.scalars(select(Brand).where(Brand.id.in_(moves))).all()
    if len(brands) != len(moves):
        raise HTTPException(404, "Бренд не найден")
    plan = markups.plan_reprice(db, [Brand.id.in_(moves)], brand_groups=moves, lock=not dry_run)
    report = _report(plan, dry_run)
    if dry_run:
        db.rollback()
        return report
    for brand in brands:
        brand.price_group_id = moves[brand.id]
    markups.apply(plan)
    db.commit()
    return report


@router.post("/markups/recalculate", response_model=RepriceReport)
def recalculate(
    dry_run: bool = Query(default=True),
    group_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Prices of every volume (or of one group's brands) by the markups and the current cost,
    after the cost has changed: check first, then apply."""
    where = [] if group_id is None else [markups.in_group(_group(db, group_id))]
    plan = markups.plan_reprice(db, where, lock=not dry_run)
    report = _report(plan, dry_run)
    if dry_run:
        db.rollback()
    else:
        markups.apply(plan)
        db.commit()
    return report
