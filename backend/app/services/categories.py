"""The catalog tree: sections («Парфюмерия», «Макияж», …) and their groups (models.Category).

The tree is small (tens of nodes), so it is read whole and walked in Python: a section's page
shows the products of all its groups, a product page shows the path to its group.
"""

from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Category, CategoryKind, Product

# Section → group → kind («Макияж» → «Губы» → «Помада»): deep enough for the shops we follow.
MAX_DEPTH = 3
# How a path is written in the importer and the admin panel: «Макияж / Губы».
PATH_SEPARATOR = "/"


# The tree a new shop starts with (migration 0016 keeps its own copy): the sections of a
# perfume and cosmetics shop and their groups. Tests and new installs build it with create_default.
DEFAULT_TREE: list[tuple[str, CategoryKind, list[str]]] = [
    ("Парфюмерия", CategoryKind.perfume, []),
    ("Макияж", CategoryKind.cosmetics, ["Лицо", "Глаза", "Губы", "Брови", "Ногти"]),
    (
        "Уход за лицом",
        CategoryKind.cosmetics,
        [
            "Очищение",
            "Тоники",
            "Сыворотки",
            "Кремы",
            "Маски",
            "Для кожи вокруг глаз",
            "Защита от солнца",
        ],
    ),
    ("Уход за телом", CategoryKind.cosmetics, ["Для душа и ванны", "Кремы и лосьоны", "Для рук"]),
    (
        "Уход за волосами",
        CategoryKind.cosmetics,
        ["Шампуни", "Бальзамы и кондиционеры", "Маски", "Стайлинг"],
    ),
    ("Аксессуары", CategoryKind.cosmetics, []),
]


def create_default(db: Session) -> None:
    for position, (name, kind, children) in enumerate(DEFAULT_TREE):
        root = Category(name=name, kind=kind, position=position)
        db.add(root)
        db.flush()
        for child_position, child in enumerate(children):
            db.add(Category(name=child, kind=kind, parent_id=root.id, position=child_position))
    db.commit()


@dataclass
class Tree:
    by_id: dict[int, Category]
    children: dict[int | None, list[Category]] = field(default_factory=dict)

    def path(self, category_id: int) -> list[Category]:
        """From the section down to this node."""
        out: list[Category] = []
        node = self.by_id.get(category_id)
        while node is not None:
            out.append(node)
            node = self.by_id.get(node.parent_id) if node.parent_id is not None else None
        return out[::-1]

    def subtree_ids(self, category_id: int) -> list[int]:
        """This node and everything under it."""
        ids: list[int] = []
        stack = [category_id]
        while stack:
            cid = stack.pop()
            if cid not in self.by_id:
                continue
            ids.append(cid)
            stack.extend(c.id for c in self.children.get(cid, []))
        return ids

    def depth(self, category_id: int) -> int:
        """1 for a section."""
        return len(self.path(category_id))

    def height(self, category_id: int) -> int:
        """Levels in this node's subtree, the node included."""
        kids = self.children.get(category_id, [])
        return 1 + max((self.height(c.id) for c in kids), default=0)

    def full_name(self, category_id: int) -> str:
        return f" {PATH_SEPARATOR} ".join(c.name for c in self.path(category_id))


def load_tree(db: Session) -> Tree:
    nodes = list(db.scalars(select(Category).order_by(Category.position, Category.name)))
    children: dict[int | None, list[Category]] = defaultdict(list)
    for node in nodes:
        children[node.parent_id].append(node)
    return Tree(by_id={n.id: n for n in nodes}, children=dict(children))


def product_counts(db: Session, tree: Tree, active_only: bool) -> dict[int, int]:
    """Products in each node's subtree (a section counts the products of all its groups)."""
    stmt = (
        select(Product.category_id, func.count(Product.id))
        .where(Product.category_id.is_not(None))
        .group_by(Product.category_id)
    )
    if active_only:
        stmt = stmt.where(Product.is_active)
    direct = dict(db.execute(stmt).all())
    return {cid: sum(direct.get(i, 0) for i in tree.subtree_ids(cid)) for cid in tree.by_id}


def kind_of(product: Product) -> CategoryKind:
    """Products not placed in the tree yet are the perfumes the shop started with."""
    return product.category.kind if product.category is not None else CategoryKind.perfume


def default_perfume_section(db: Session) -> Category | None:
    """Where imported rows without a category go: the first perfume section."""
    return db.scalar(
        select(Category)
        .where(Category.parent_id.is_(None), Category.kind == CategoryKind.perfume)
        .order_by(Category.position, Category.id)
        .limit(1)
    )


def find(tree: Tree, text: str) -> Category | None:
    """A node by its path («Макияж / Губы») or by a name that only one node has («Губы» is
    found when no other section has «Губы»). Letter case doesn't matter."""
    parts = [p.strip().lower() for p in text.split(PATH_SEPARATOR) if p.strip()]
    if not parts:
        return None
    if len(parts) == 1:
        matches = [c for c in tree.by_id.values() if c.name.lower() == parts[0]]
        return matches[0] if len(matches) == 1 else None
    parent_id: int | None = None
    node: Category | None = None
    for part in parts:
        node = next((c for c in tree.children.get(parent_id, []) if c.name.lower() == part), None)
        if node is None:
            return None
        parent_id = node.id
    return node


def set_kind(tree: Tree, category_id: int, kind: CategoryKind) -> None:
    """A section's kind goes down to all of its groups."""
    for cid in tree.subtree_ids(category_id):
        tree.by_id[cid].kind = kind
