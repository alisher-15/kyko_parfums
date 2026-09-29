"""The catalog tree in the admin panel: sections and their groups (services/categories.py)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Category, Product
from app.schemas.categories import CategoryAdminOut, CategoryIn, CategoryUpdate
from app.services import categories

router = APIRouter(prefix="/categories")

TAKEN = "Такая категория здесь уже есть"
TOO_DEEP = (
    f"Не больше {categories.MAX_DEPTH} уровней: раздел, группа и вид (Макияж → Губы → Помада)"
)


def _list(db: Session) -> list[CategoryAdminOut]:
    tree = categories.load_tree(db)
    counts = categories.product_counts(db, tree, active_only=False)
    own = dict(
        db.execute(
            select(Product.category_id, func.count(Product.id)).group_by(Product.category_id)
        ).all()
    )
    out = []
    stack = list(reversed(tree.children.get(None, [])))
    while stack:
        c = stack.pop()
        out.append(
            CategoryAdminOut(
                id=c.id,
                parent_id=c.parent_id,
                name=c.name,
                kind=c.kind,
                position=c.position,
                product_count=counts[c.id],
                own_product_count=own.get(c.id, 0),
            )
        )
        stack.extend(reversed(tree.children.get(c.id, [])))
    return out


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, TAKEN) from e


def _next_position(tree: categories.Tree, parent_id: int | None) -> int:
    return 1 + max((c.position for c in tree.children.get(parent_id, [])), default=-1)


@router.get("", response_model=list[CategoryAdminOut])
def list_categories(db: Session = Depends(get_db)):
    """The whole tree, sections in their order, each followed by its groups."""
    return _list(db)


@router.post("", response_model=list[CategoryAdminOut], status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryIn, db: Session = Depends(get_db)):
    tree = categories.load_tree(db)
    kind = data.kind
    if data.parent_id is not None:
        parent = tree.by_id.get(data.parent_id)
        if parent is None:
            raise HTTPException(404, "Категория не найдена")
        if tree.depth(parent.id) >= categories.MAX_DEPTH:
            raise HTTPException(422, TOO_DEEP)
        kind = parent.kind
    db.add(
        Category(
            name=data.name.strip(),
            parent_id=data.parent_id,
            kind=kind,
            position=_next_position(tree, data.parent_id),
        )
    )
    _commit(db)
    return _list(db)


@router.patch("/{category_id}", response_model=list[CategoryAdminOut])
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    tree = categories.load_tree(db)
    node = tree.by_id.get(category_id)
    if node is None:
        raise HTTPException(404, "Категория не найдена")
    changes = data.model_dump(exclude_unset=True)
    if changes.get("name") is not None:
        node.name = changes["name"].strip()
    if "parent_id" in changes and changes["parent_id"] != node.parent_id:
        parent_id = changes["parent_id"]
        if parent_id is not None:
            parent = tree.by_id.get(parent_id)
            if parent is None:
                raise HTTPException(404, "Категория не найдена")
            if parent_id in tree.subtree_ids(node.id):
                raise HTTPException(422, "Нельзя перенести категорию внутрь неё самой")
            if tree.depth(parent_id) + tree.height(node.id) > categories.MAX_DEPTH:
                raise HTTPException(422, TOO_DEEP)
        node.parent_id = parent_id
        node.position = _next_position(tree, parent_id)
        # Under a new section the node and its groups take that section's kind.
        if parent_id is not None:
            categories.set_kind(tree, node.id, tree.by_id[parent_id].kind)
    if changes.get("kind") is not None:
        if node.parent_id is not None:
            raise HTTPException(422, "Тип задаётся у раздела, группы берут его от раздела")
        categories.set_kind(tree, node.id, changes["kind"])
    _commit(db)
    return _list(db)


@router.post("/{category_id}/move", response_model=list[CategoryAdminOut])
def move_category(
    category_id: int,
    direction: str = Query(pattern="^(up|down)$"),
    db: Session = Depends(get_db),
):
    """One place up or down among its siblings (the order of the shop's menus)."""
    tree = categories.load_tree(db)
    node = tree.by_id.get(category_id)
    if node is None:
        raise HTTPException(404, "Категория не найдена")
    siblings = tree.children.get(node.parent_id, [])
    i = siblings.index(node)
    j = i - 1 if direction == "up" else i + 1
    if 0 <= j < len(siblings):
        siblings[i], siblings[j] = siblings[j], siblings[i]
        for position, sibling in enumerate(siblings):
            sibling.position = position
        db.commit()
    return _list(db)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    tree = categories.load_tree(db)
    node = tree.by_id.get(category_id)
    if node is None:
        raise HTTPException(404, "Категория не найдена")
    if tree.children.get(category_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "В категории есть подкатегории: сначала удалите их"
        )
    if db.scalar(select(func.count(Product.id)).where(Product.category_id == category_id)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "В категории есть товары: сначала перенесите их в другую категорию",
        )
    db.delete(node)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
