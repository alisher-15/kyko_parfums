from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

MONEY = Numeric(12, 2)


class UserRole(enum.StrEnum):
    retail = "retail"
    wholesale = "wholesale"
    bulk_wholesale = "bulk_wholesale"
    admin = "admin"


class Gender(enum.StrEnum):
    female = "female"
    male = "male"
    unisex = "unisex"


class OrderStatus(enum.StrEnum):
    new = "new"
    processing = "processing"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"


class PriceTier(enum.StrEnum):
    retail = "retail"
    wholesale = "wholesale"
    bulk = "bulk"


class OrderChannel(enum.StrEnum):
    online = "online"  # placed by the customer on the website
    store = "store"  # sold in the physical shop and entered by an admin


class PaymentMethod(enum.StrEnum):
    cash = "cash"
    card = "card"
    transfer = "transfer"  # Kaspi / bank transfer
    other = "other"


class StockReason(enum.StrEnum):
    online_order = "online_order"
    store_sale = "store_sale"
    order_cancel = "order_cancel"
    manual = "manual"  # admin edited the stock number by hand
    import_ = "import"
    order_edit = "order_edit"  # items removed from an order before it was handed over
    order_return = "return"  # goods brought back after the sale
    receipt = "receipt"  # goods received from a supplier (posted stock receipt)
    inventory = "inventory"  # stock count: the number was set to what was counted


class DocumentStatus(enum.StrEnum):
    """Stock receipts and stock counts are drafts until posted; posting changes the stock."""

    draft = "draft"
    posted = "posted"


class OrderEventKind(enum.StrEnum):
    created = "created"
    status = "status"
    edited = "edited"
    returned = "returned"


class PricingMode(enum.StrEnum):
    # Tier is chosen once for the whole order by its total amount.
    order_total = "order_total"
    # Tier is chosen per order line by the quantity of that variant.
    item_quantity = "item_quantity"


def volume_label(volume_ml: int, is_tester: bool = False) -> str:
    """How a volume is named everywhere: "100 мл" or "100 мл, тестер"."""
    return f"{volume_ml} мл, тестер" if is_tester else f"{volume_ml} мл"


def _enum(e: type[enum.Enum], name: str) -> Enum:
    # Stored as VARCHAR + CHECK: easier to extend than native PG enums.
    return Enum(
        e,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda x: [m.value for m in x],
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        _enum(UserRole, "user_role"), default=UserRole.retail, server_default="retail"
    )
    full_name: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(64))
    company_name: Mapped[str | None] = mapped_column(String(255))
    # User asked for a better price level (retail -> wholesale, wholesale -> bulk);
    # an admin reviews and changes the role manually. requested_role says which one.
    wholesale_requested: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    requested_role: Mapped[UserRole | None] = mapped_column(_enum(UserRole, "requested_role"))
    upgrade_request_note: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Bumped on password change/reset to invalidate outstanding refresh tokens.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    orders: Mapped[list[Order]] = relationship(back_populates="user", foreign_keys="Order.user_id")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Brand(TimestampMixin, Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(1024))
    description: Mapped[str | None] = mapped_column(Text)

    products: Mapped[list[Product]] = relationship(back_populates="brand")


class Product(TimestampMixin, Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    # EDP / EDT / Parfum / Extrait / EDC / ... — free text, normalized on import.
    type: Mapped[str | None] = mapped_column(String(32))
    # Olfactory group ("Цветочные", "Древесные", ...).
    category: Mapped[str | None] = mapped_column(String(128), index=True)
    gender: Mapped[Gender | None] = mapped_column(_enum(Gender, "gender"))
    longevity: Mapped[str | None] = mapped_column(String(64))
    top_notes: Mapped[str | None] = mapped_column(Text)
    mid_notes: Mapped[str | None] = mapped_column(Text)
    base_notes: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(1024))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    brand: Mapped[Brand] = relationship(back_populates="products")
    variants: Mapped[list[ProductVariant]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        # Bottles first, then testers; each by volume.
        order_by="[ProductVariant.is_tester, ProductVariant.volume_ml]",
    )


class ProductVariant(TimestampMixin, Base):
    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint(
            "product_id", "volume_ml", "is_tester", name="uq_variant_product_volume_tester"
        ),
        CheckConstraint("volume_ml > 0", name="ck_variant_volume_positive"),
        CheckConstraint("retail_price >= 0", name="ck_variant_retail_price"),
        CheckConstraint("wholesale_price IS NULL OR wholesale_price >= 0", name="ck_variant_wh"),
        CheckConstraint("bulk_price IS NULL OR bulk_price >= 0", name="ck_variant_bulk"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    volume_ml: Mapped[int] = mapped_column(Integer)
    # A tester of this volume: the same perfume in plain packaging, with its own prices, stock
    # and barcodes. It shares the product's photos.
    is_tester: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sku: Mapped[str | None] = mapped_column(String(64), unique=True)
    # Below zero: customers ordered more than the shop has (backorder); receipts fill it first.
    stock: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    retail_price: Mapped[Decimal] = mapped_column(MONEY)
    # NULL => falls back to the next cheaper-for-us tier (bulk -> wholesale -> retail).
    wholesale_price: Mapped[Decimal | None] = mapped_column(MONEY)
    bulk_price: Mapped[Decimal | None] = mapped_column(MONEY)
    photo_url: Mapped[str | None] = mapped_column(String(1024))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Average purchase cost of one unit in stock: moving average over posted receipts,
    # or set by hand. NULL = unknown, the margin of such sales is not counted.
    cost_price: Mapped[Decimal | None] = mapped_column(MONEY)

    product: Mapped[Product] = relationship(back_populates="variants")
    barcodes: Mapped[list[VariantBarcode]] = relationship(
        back_populates="variant", cascade="all, delete-orphan", order_by="VariantBarcode.id"
    )

    @property
    def label(self) -> str:
        volume = volume_label(self.volume_ml, self.is_tester)
        return f"{self.product.brand.name} {self.product.name}, {volume}"


class VariantBarcode(Base):
    """A barcode printed on the goods (EAN-13 and the like). A volume can have several
    (different suppliers, box and bottle). A tester has its own codes: it is its own variant."""

    __tablename__ = "variant_barcodes"

    id: Mapped[int] = mapped_column(primary_key=True)
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    variant: Mapped[ProductVariant] = relationship(back_populates="barcodes")


class Order(TimestampMixin, Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    # NULL for an anonymous walk-in customer in the shop.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    channel: Mapped[OrderChannel] = mapped_column(
        _enum(OrderChannel, "order_channel"),
        default=OrderChannel.online,
        server_default="online",
        index=True,
    )
    status: Mapped[OrderStatus] = mapped_column(
        _enum(OrderStatus, "order_status"),
        default=OrderStatus.new,
        server_default="new",
        index=True,
    )
    total_amount: Mapped[Decimal] = mapped_column(MONEY)
    # Role of the buyer at checkout time (roles can change later).
    customer_role: Mapped[UserRole] = mapped_column(_enum(UserRole, "order_customer_role"))
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        _enum(PaymentMethod, "payment_method")
    )
    # Admin who entered a store sale.
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # Contacts and delivery are required for online orders (see CheckoutIn), optional in the shop.
    contact_name: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(64))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    delivery_city: Mapped[str | None] = mapped_column(String(128))
    delivery_address: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text)
    admin_note: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User | None] = relationship(back_populates="orders", foreign_keys=[user_id])
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id])
    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id"
    )
    returns: Mapped[list[OrderReturn]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderReturn.id"
    )
    events: Mapped[list[OrderEvent]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderEvent.id"
    )

    @property
    def returned_amount(self) -> Decimal:
        return sum((r.refund_amount for r in self.returns), Decimal(0))

    @property
    def fully_returned(self) -> bool:
        return bool(self.returns) and all(i.quantity == i.returned_quantity for i in self.items)

    @property
    def net_total(self) -> Decimal:
        """What the customer finally paid: order total minus refunds."""
        return self.total_amount - self.returned_amount

    @property
    def user_email(self) -> str | None:
        return self.user.email if self.user else None

    @property
    def created_by_email(self) -> str | None:
        return self.created_by.email if self.created_by else None

    @property
    def discount_total(self) -> Decimal:
        return sum(((i.list_price - i.price_applied) * i.quantity for i in self.items), Decimal(0))


class OrderItem(Base):
    __tablename__ = "order_items"
    # 0 = the line was removed by a manager before the order was handed over.
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_order_item_quantity"),
        CheckConstraint("backordered >= 0", name="ck_order_item_backordered"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    # SET NULL: the order keeps its snapshot even if the variant is deleted from the catalog.
    variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), index=True
    )
    quantity: Mapped[int] = mapped_column(Integer)
    # Quantity at checkout, before any manager edits.
    original_quantity: Mapped[int] = mapped_column(Integer)
    # Units that were not in stock at checkout: the manager gets them from a supplier
    # (usually 1-2 days) or removes them from the order.
    backordered: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Price-list price of the chosen tier and the final unit price after the discount.
    list_price: Mapped[Decimal] = mapped_column(MONEY)
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, server_default="0")
    price_applied: Mapped[Decimal] = mapped_column(MONEY)
    price_tier: Mapped[PriceTier] = mapped_column(_enum(PriceTier, "price_tier"))
    # Snapshot of what was bought.
    brand_name: Mapped[str] = mapped_column(String(255))
    product_name: Mapped[str] = mapped_column(String(255))
    product_id: Mapped[int | None] = mapped_column(Integer)
    volume_ml: Mapped[int] = mapped_column(Integer)
    is_tester: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Cost of one unit when it was sold (the variant's average cost then); NULL = unknown.
    cost_price: Mapped[Decimal | None] = mapped_column(MONEY)

    order: Mapped[Order] = relationship(back_populates="items")
    variant: Mapped[ProductVariant | None] = relationship()
    return_items: Mapped[list[OrderReturnItem]] = relationship(back_populates="order_item")

    @property
    def line_total(self) -> Decimal:
        return self.price_applied * self.quantity

    @property
    def label(self) -> str:
        return f"{self.product_name}, {volume_label(self.volume_ml, self.is_tester)}"

    @property
    def returned_quantity(self) -> int:
        return sum(r.quantity for r in self.return_items)


class PricingSettings(Base):
    """Single-row table (id=1) with wholesale threshold rules, editable in the admin panel."""

    __tablename__ = "pricing_settings"
    __table_args__ = (CheckConstraint("id = 1", name="ck_pricing_settings_singleton"),)

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    mode: Mapped[PricingMode] = mapped_column(
        _enum(PricingMode, "pricing_mode"),
        default=PricingMode.order_total,
        server_default="order_total",
    )
    wholesale_min_order_amount: Mapped[Decimal] = mapped_column(
        MONEY, default=0, server_default="0"
    )
    bulk_min_order_amount: Mapped[Decimal] = mapped_column(MONEY, default=0, server_default="0")
    wholesale_min_item_qty: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    bulk_min_item_qty: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    # Show wholesale customers the bulk price as their "next price" (upsell teaser).
    show_next_tier: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Conditions for getting bulk prices, shown next to the teaser.
    next_tier_terms: Mapped[str | None] = mapped_column(Text)
    # Largest discount an admin may give per line in a store sale.
    max_store_discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=10, server_default="10"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class StockMovement(Base):
    """Journal of every stock change, so the current number can always be explained."""

    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), index=True
    )
    delta: Mapped[int] = mapped_column(Integer)
    stock_after: Mapped[int] = mapped_column(Integer)
    reason: Mapped[StockReason] = mapped_column(_enum(StockReason, "stock_reason"))
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # The document behind a receipt / stock count movement.
    receipt_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_receipts.id", ondelete="SET NULL"), index=True
    )
    count_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_counts.id", ondelete="SET NULL"), index=True
    )
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    variant: Mapped[ProductVariant] = relationship()
    order: Mapped[Order | None] = relationship()
    user: Mapped[User | None] = relationship()


class StockReceipt(TimestampMixin, Base):
    """Goods received from a supplier. A draft is filled by scanning; posting adds the stock
    and updates the average cost of each volume."""

    __tablename__ = "stock_receipts"

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[DocumentStatus] = mapped_column(
        _enum(DocumentStatus, "receipt_status"),
        default=DocumentStatus.draft,
        server_default="draft",
        index=True,
    )
    supplier: Mapped[str | None] = mapped_column(String(255))
    # The supplier's invoice number.
    number: Mapped[str | None] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    posted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id])
    posted_by: Mapped[User | None] = relationship(foreign_keys=[posted_by_id])
    items: Mapped[list[StockReceiptItem]] = relationship(
        back_populates="receipt", cascade="all, delete-orphan", order_by="StockReceiptItem.id"
    )

    @property
    def total_quantity(self) -> int:
        return sum(i.quantity for i in self.items)

    @property
    def total_cost(self) -> Decimal:
        return sum((i.cost_price * i.quantity for i in self.items if i.cost_price), Decimal(0))


class StockReceiptItem(Base):
    __tablename__ = "stock_receipt_items"
    __table_args__ = (
        UniqueConstraint("receipt_id", "variant_id", name="uq_receipt_item_variant"),
        CheckConstraint("quantity > 0", name="ck_receipt_item_quantity"),
        CheckConstraint("cost_price IS NULL OR cost_price >= 0", name="ck_receipt_item_cost"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_id: Mapped[int] = mapped_column(
        ForeignKey("stock_receipts.id", ondelete="CASCADE"), index=True
    )
    # SET NULL + label: the document stays readable if the product is deleted later.
    variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), index=True
    )
    label: Mapped[str] = mapped_column(String(512))
    quantity: Mapped[int] = mapped_column(Integer)
    # Purchase price of one unit; NULL = unknown (the average cost is left as it is).
    cost_price: Mapped[Decimal | None] = mapped_column(MONEY)

    receipt: Mapped[StockReceipt] = relationship(back_populates="items")
    variant: Mapped[ProductVariant | None] = relationship()


class StockCount(TimestampMixin, Base):
    """Stock count (inventory). Counted quantities replace the stock of the counted volumes;
    volumes that were not counted are left as they are."""

    __tablename__ = "stock_counts"

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[DocumentStatus] = mapped_column(
        _enum(DocumentStatus, "count_status"),
        default=DocumentStatus.draft,
        server_default="draft",
        index=True,
    )
    note: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    posted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id])
    posted_by: Mapped[User | None] = relationship(foreign_keys=[posted_by_id])
    items: Mapped[list[StockCountItem]] = relationship(
        back_populates="count", cascade="all, delete-orphan", order_by="StockCountItem.id"
    )


class StockCountItem(Base):
    __tablename__ = "stock_count_items"
    __table_args__ = (
        UniqueConstraint("count_id", "variant_id", name="uq_count_item_variant"),
        CheckConstraint("counted >= 0", name="ck_count_item_counted"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    count_id: Mapped[int] = mapped_column(
        ForeignKey("stock_counts.id", ondelete="CASCADE"), index=True
    )
    variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), index=True
    )
    label: Mapped[str] = mapped_column(String(512))
    counted: Mapped[int] = mapped_column(Integer)
    # Stock in the system when the count was posted (before it was replaced).
    expected: Mapped[int | None] = mapped_column(Integer)

    count: Mapped[StockCount] = relationship(back_populates="items")
    variant: Mapped[ProductVariant | None] = relationship()


class OrderReturn(Base):
    """Goods brought back after a sale. An order can have several partial returns."""

    __tablename__ = "order_returns"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    refund_amount: Mapped[Decimal] = mapped_column(MONEY)
    refund_method: Mapped[PaymentMethod | None] = mapped_column(
        _enum(PaymentMethod, "refund_method")
    )
    reason: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order: Mapped[Order] = relationship(back_populates="returns")
    created_by: Mapped[User | None] = relationship()
    items: Mapped[list[OrderReturnItem]] = relationship(
        back_populates="order_return", cascade="all, delete-orphan", order_by="OrderReturnItem.id"
    )

    @property
    def created_by_email(self) -> str | None:
        return self.created_by.email if self.created_by else None


class OrderReturnItem(Base):
    __tablename__ = "order_return_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_return_item_quantity"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    return_id: Mapped[int] = mapped_column(
        ForeignKey("order_returns.id", ondelete="CASCADE"), index=True
    )
    order_item_id: Mapped[int] = mapped_column(
        ForeignKey("order_items.id", ondelete="CASCADE"), index=True
    )
    quantity: Mapped[int] = mapped_column(Integer)
    # False = defective / damaged: written off instead of going back on sale.
    restock: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    amount: Mapped[Decimal] = mapped_column(MONEY)

    order_return: Mapped[OrderReturn] = relationship(back_populates="items")
    order_item: Mapped[OrderItem] = relationship(back_populates="return_items")

    @property
    def product_label(self) -> str:
        return f"{self.order_item.brand_name} {self.order_item.label}"


class OrderEvent(Base):
    """Human-readable order history shown to the admin and the customer."""

    __tablename__ = "order_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    kind: Mapped[OrderEventKind] = mapped_column(_enum(OrderEventKind, "order_event_kind"))
    message: Mapped[str] = mapped_column(Text)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order: Mapped[Order] = relationship(back_populates="events")
