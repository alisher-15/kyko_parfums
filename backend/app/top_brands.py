"""The houses in the running line of brands on the home page («Бренды» marquee).

A brand gets `brands.is_top` when it is created if its name is one of these (spelled any usual
way: «By Kilian», «Parfums de Marly», «Hermès»); the owner can tick or untick any brand in
«Бренды» afterwards. Migration 0023 marked the brands that existed then with its own copy of
this list.
"""

import re
import unicodedata

# Niche and couture houses at the top of the price range, as the name reads after `key()`.
TOP_BRANDS = frozenset(
    {
        "amouage",
        "boadicea victorious",
        "bulgari",
        "bvlgari",
        "byredo",
        "chanel",
        "christian dior",
        "clive christian",
        "creed",
        "dior",
        "ex nihilo",
        "frederic malle",
        "guerlain",
        "hermes",
        "initio",
        "kilian",
        "le labo",
        "louis vuitton",
        "maison crivelli",
        "maison francis kurkdjian",
        "marly",
        "memo",
        "mfk",
        "nishane",
        "roja",
        "roja dove",
        "tiziana terenzi",
        "tom ford",
        "xerjoff",
    }
)

# Words that don't tell houses apart: «By Kilian», «Parfums de Marly», «Memo Paris».
_NOISE = {"by", "parfums", "parfum", "perfumes", "paris", "prives", "editions", "de", "the"}


def key(name: str) -> str:
    """«Parfums de Marly» → "marly", «Hermès» → "hermes"."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    words = re.sub(r"[^a-z0-9]+", " ", plain).split()
    return " ".join(w for w in words if w not in _NOISE)


def is_top(name: str | None) -> bool:
    return bool(name) and key(name) in TOP_BRANDS
