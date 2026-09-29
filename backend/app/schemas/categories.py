from pydantic import BaseModel, Field

from app.models import CategoryKind


class CategoryBrief(BaseModel):
    id: int
    name: str


class CategoryPublic(BaseModel):
    """A node of the catalog tree for the shop's menus. The shop hides nodes without products."""

    id: int
    parent_id: int | None
    name: str
    kind: CategoryKind
    # Active products in this node and below it.
    product_count: int


class CategoryAdminOut(CategoryPublic):
    position: int
    # Products placed right in this node (the admin moves them before deleting it).
    own_product_count: int


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    # None: a new section.
    parent_id: int | None = None
    # For a section: which fields its products have. A group takes its section's.
    kind: CategoryKind = CategoryKind.cosmetics


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    # Move under another node; null makes it a section.
    parent_id: int | None = None
    # Sections only; the groups below follow.
    kind: CategoryKind | None = None
