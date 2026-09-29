"""categories: the catalog tree (sections and their groups) for perfumes and cosmetics

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-08 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | Sequence[str] | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A new table and a nullable column: yes.
backward_compatible = True

# The tree the shop starts with; the admin edits it («Категории»). All existing products are
# perfumes and go to «Парфюмерия».
PERFUME = "Парфюмерия"
TREE: list[tuple[str, str, list[str]]] = [
    (PERFUME, "perfume", []),
    ("Макияж", "cosmetics", ["Лицо", "Глаза", "Губы", "Брови", "Ногти"]),
    (
        "Уход за лицом",
        "cosmetics",
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
    ("Уход за телом", "cosmetics", ["Для душа и ванны", "Кремы и лосьоны", "Для рук"]),
    ("Уход за волосами", "cosmetics", ["Шампуни", "Бальзамы и кондиционеры", "Маски", "Стайлинг"]),
    ("Аксессуары", "cosmetics", []),
]


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("kind IN ('perfume', 'cosmetics')", name="category_kind"),
        sa.CheckConstraint("parent_id <> id", name="ck_category_not_own_parent"),
    )
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])
    op.create_index(
        "uq_categories_parent_name",
        "categories",
        [sa.text("coalesce(parent_id, 0)"), sa.text("lower(name)")],
        unique=True,
    )
    op.add_column(
        "products",
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.create_index("ix_products_category_id", "products", ["category_id"])

    conn = op.get_bind()
    insert = sa.text(
        "INSERT INTO categories (parent_id, name, kind, position) "
        "VALUES (:parent_id, :name, :kind, :position) RETURNING id"
    )
    for position, (name, kind, children) in enumerate(TREE):
        root = conn.execute(
            insert, {"parent_id": None, "name": name, "kind": kind, "position": position}
        ).scalar_one()
        for child_position, child in enumerate(children):
            conn.execute(
                insert,
                {"parent_id": root, "name": child, "kind": kind, "position": child_position},
            )
        if name == PERFUME:
            conn.execute(sa.text("UPDATE products SET category_id = :id"), {"id": root})


def downgrade() -> None:
    op.drop_index("ix_products_category_id", table_name="products")
    op.drop_column("products", "category_id")
    op.drop_index("uq_categories_parent_name", table_name="categories")
    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_table("categories")
