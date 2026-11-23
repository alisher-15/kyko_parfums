from pydantic import BaseModel, Field

from app.models import CategoryKind


class CategoryBrief(BaseModel):
    id: int
    name: str


class CategoryPublic(BaseModel):
    """A node of the catalog tree for the shop: the tiles on the home page are the sections
    (parent_id null), their groups are chips on the section's page. Nodes without active
    products are left out."""

    id: int
    parent_id: int | None
    name: str
    kind: CategoryKind
    # The tile's picture: the one set in the admin panel, else a photo of its products.
    image_url: str | None
    # Active products in this node and below it.
    product_count: int


class CategoryAdminOut(BaseModel):
    id: int
    parent_id: int | None
    name: str
    kind: CategoryKind
    position: int
    # The picture set in the admin panel (null: the shop shows a photo of its products).
    image_url: str | None
    # All products in this node and below it, hidden ones too.
    product_count: int
    # Products placed right in this node (the admin moves them before deleting it).
    own_product_count: int


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    # None: a new section.
    parent_id: int | None = None
    # For a section: which fields its products have. A group takes its section's.
    kind: CategoryKind = CategoryKind.cosmetics
    image_url: str | None = Field(default=None, max_length=1024)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    # Move under another node; null makes it a section.
    parent_id: int | None = None
    # Sections only; the groups below follow.
    kind: CategoryKind | None = None
    # null removes the picture.
    image_url: str | None = Field(default=None, max_length=1024)
