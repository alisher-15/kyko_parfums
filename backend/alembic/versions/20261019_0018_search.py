"""search: names written as they sound (search_fold), other names of a product, pg_trgm

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-19 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0018"
down_revision: str | Sequence[str] | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
# Can the code from before this migration run on the schema after it? See app/migrations.py.
# A function, a nullable column and columns the database fills itself: yes.
backward_compatible = True

# A name reduced to how it sounds, in Latin letters, so that "шанель" and "Chanel" both become
# "shanel" and "соваж" and "Sauvage" both "sovaj" (app/services/search.py). Upper-case Cyrillic is
# lowered by translate(): lower() leaves it as is in a database with the C locale.
SEARCH_FOLD = r"""
CREATE OR REPLACE FUNCTION search_fold(t text) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE STRICT AS $$
DECLARE
  s text := t;
BEGIN
  s := translate(s, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя');
  s := lower(s);
  -- Accents off, apostrophes out, any other sign is a space.
  s := translate(s, 'àáâãäåèéêëìíîïòóôõöùúûüýÿçñё''’`', 'aaaaaaeeeeiiiiooooouuuuyycnе');
  s := regexp_replace(s, '[^a-z0-9а-я]+', ' ', 'g');
  -- Cyrillic to Latin.
  s := replace(replace(replace(s, 'щ', 'sh'), 'ш', 'sh'), 'ч', 'ch');
  s := replace(replace(replace(replace(s, 'ж', 'zh'), 'ц', 'ts'), 'ю', 'yu'), 'я', 'ya');
  s := replace(replace(replace(s, 'х', 'h'), 'ъ', ''), 'ь', '');
  s := translate(s, 'абвгдезийклмнопрстуфыэ', 'abvgdeziiklmnoprstufie');
  -- A sound written in several ways is written one way.
  s := regexp_replace(s, 'cc([ei])', 'sh\1', 'g');
  s := replace(replace(replace(s, 'sch', 'sh'), 'ch', 'sh'), 'ph', 'f');
  s := replace(replace(s, 'th', 't'), 'igh', 'ai');
  s := replace(replace(replace(replace(s, 'gh', 'g'), 'dzh', 'j'), 'zh', 'j'), 'dj', 'j');
  s := regexp_replace(s, 'gu([eiy])', 'g\1', 'g');
  s := regexp_replace(s, 'g([eiy])', 'j\1', 'g');
  s := regexp_replace(s, 'qu|q|ck', 'k', 'g');
  s := regexp_replace(s, 'c([eiy])', 's\1', 'g');
  s := replace(replace(replace(replace(s, 'c', 'k'), 'x', 'ks'), 'w', 'v'), 'y', 'i');
  s := replace(replace(replace(replace(s, 'ee', 'i'), 'eau', 'o'), 'au', 'o'), 'oi', 'ua');
  s := regexp_replace(s, 'oo|ou', 'u', 'g');
  s := regexp_replace(s, 'eu|iu', 'u', 'g');
  s := regexp_replace(s, 'ai|ei', 'e', 'g');
  s := regexp_replace(s, '(^|[^s])h', '\1', 'g');
  s := replace(replace(s, 'ts', 's'), 'z', 's');
  s := regexp_replace(s, '(sh)+', 'sh', 'g');
  -- A letter said once; the silent e at the end of a word.
  s := regexp_replace(s, '([a-z])\1+', '\1', 'g');
  s := regexp_replace(s, '([a-z]{2})e\M', '\1', 'g');
  RETURN trim(regexp_replace(s, '\s+', ' ', 'g'));
END
$$
"""

PRODUCT_SEARCH_TEXT = (
    "search_fold(name || ' ' || coalesce(type, '') || ' ' || coalesce(search_names, ''))"
)


def upgrade() -> None:
    # Similarity of words with typos (word_similarity). A trusted extension: the database owner
    # may create it without being a superuser.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(SEARCH_FOLD)
    op.add_column("products", sa.Column("search_names", sa.Text(), nullable=True))
    op.add_column(
        "products",
        sa.Column("search_text", sa.Text(), sa.Computed(PRODUCT_SEARCH_TEXT, persisted=True)),
    )
    op.add_column(
        "brands",
        sa.Column("search_text", sa.Text(), sa.Computed("search_fold(name)", persisted=True)),
    )


def downgrade() -> None:
    op.drop_column("brands", "search_text")
    op.drop_column("products", "search_text")
    op.drop_column("products", "search_names")
    op.execute("DROP FUNCTION IF EXISTS search_fold(text)")
