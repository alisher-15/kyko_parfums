"""categories: the catalog tree (sections and their groups), the home page's tiles

Revision ID: 0022
Revises: 0021
Create Date: 2026-11-23 20:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0022"
down_revision: str | Sequence[str] | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A new table and a nullable column: yes.
backward_compatible = True

# The starting tree (services/categories.DEFAULT_TREE, copied: a migration must not change when
# the code does).
TREE = [
    ("Парфюмерия", "perfume", []),
    ("Наборы", "perfume", []),
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
        sa.Column("image_url", sa.String(1024), nullable=True),
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
    ids = {}
    for position, (name, kind, children) in enumerate(TREE):
        root = conn.execute(
            insert, {"parent_id": None, "name": name, "kind": kind, "position": position}
        ).scalar_one()
        ids[name] = root
        for child_position, child in enumerate(children):
            conn.execute(
                insert,
                {"parent_id": root, "name": child, "kind": kind, "position": child_position},
            )
    # The shop sold perfumes only so far: sets (the word set or набор in the name) go to
    # «Наборы», everything else to «Парфюмерия».
    conn.execute(
        sa.text(
            "UPDATE products SET category_id = CASE WHEN name ~* '\\m(set\\M|набор)' "
            "THEN :sets ELSE :perfume END"
        ),
        {"sets": ids["Наборы"], "perfume": ids["Парфюмерия"]},
    )


def downgrade() -> None:
    op.drop_index("ix_products_category_id", table_name="products")
    op.drop_column("products", "category_id")
    op.drop_index("uq_categories_parent_name", table_name="categories")
    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_table("categories")
