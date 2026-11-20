"""Catalog search: by the letters, by the sound (Russian spelling, a wrong keyboard layout), and,
when nothing matches, by similarity (typos).

The database keeps every brand and product name reduced to how it sounds (``search_fold``,
migration 0018): "Chanel" and "шанель" are both "shanel", "Sauvage" and "соваж" both "sovaj".
"""

import re
from functools import reduce
from operator import add

from sqlalchemy import Text, and_, false, func, literal, or_, true

from app.models import Brand, Product

# A product is "similar" when its words are this close to the query's on average (pg_trgm
# word_similarity, 0..1). Tried on the real catalog: Russian names, typos and junk queries.
SIMILAR = 0.5

# The same key in the Russian layout: "ыфгмфпу" is "sauvage" typed with the layout switched.
RU_LAYOUT = str.maketrans("йцукенгшщзхъфывапролджэячсмитьбюё", "qwertyuiop[]asdfghjkl;'zxcvbnm,.`")


def contains(term: str) -> str:
    """ILIKE pattern matching ``term`` anywhere; ``%`` and ``_`` in it are literal characters.

    PostgreSQL's default LIKE escape character is the backslash.
    """
    escaped = term.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def words(q: str) -> list[str]:
    """The query's words, lower-case; signs on their own ("&", "-") are not words."""
    return [w for w in q.lower().split() if any(ch.isalnum() for ch in w)]


def spellings(word: str) -> list[str]:
    """The word, and the same keys in the English layout when it reads as a Latin word."""
    swapped = word.translate(RU_LAYOUT)
    if swapped != word and re.fullmatch(r"[a-z0-9]+", swapped):
        return [word, swapped]
    return [word]


def _fold(word: str):
    return func.search_fold(literal(word, Text), type_=Text)


def _letters():
    """Brand, name, type and other names of the product, as written."""
    return (
        Brand.name
        + " "
        + Product.name
        + " "
        + func.coalesce(Product.type, "")
        + " "
        + func.coalesce(Product.search_names, "")
    )


def _sounds():
    """The same as it sounds (search_fold)."""
    return func.coalesce(Brand.search_text, "") + " " + func.coalesce(Product.search_text, "")


def product_name_match(q: str):
    """Every word is found in the brand, name, type or other names, as written or as it sounds
    from the start of a word: "chanel chance", "шанель шанс" and "ыфгмфпу" (sauvage) all match.
    The query needs Product joined with its Brand. A query of signs only finds nothing."""
    found = [_matches(_letters(), _sounds(), w) for w in words(q)]
    return and_(*found) if found else false()


def product_similarity(q: str):
    """0..1: how close the query's words are to the product's on average, by sound or by
    letters, for queries with typos ("givency", "tom fort", "джипси вотер")."""
    scores = []
    for word in words(q):
        options = []
        for spelling in spellings(word):
            options.append(func.word_similarity(_fold(spelling), _sounds()))
            options.append(func.word_similarity(literal(spelling, Text), func.lower(_letters())))
        scores.append(func.greatest(*options))
    if not scores:
        return literal(0.0)
    return reduce(add, scores) / len(scores)


def _matches(letters, sounds, word: str):
    """The word is in the text as written, or as it sounds from the start of a word."""
    options = []
    for spelling in spellings(word):
        folded = _fold(spelling)
        options.append(letters.ilike(contains(spelling)))
        options.append(
            and_(
                func.length(folded) >= 2,
                or_(sounds.like(folded + "%"), sounds.like("% " + folded + "%")),
            )
        )
    return or_(*options)


def brand_name_match(q: str):
    """Every word is in the brand's name, as written or as it sounds ("шанель" finds Chanel)."""
    sounds = func.coalesce(Brand.search_text, "")
    return and_(true(), *(_matches(Brand.name, sounds, w) for w in words(q)))
