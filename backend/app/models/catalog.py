from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String,
                        UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin

CATEGORIES = ("panel", "inverter", "battery", "charge_controller", "structure", "wiring", "safety", "service")
UNIT_STATUSES = ("in_stock", "reserved", "dispatched", "delivered", "installed", "returned", "scrapped")
PURCHASE_STATUSES = ("draft", "ordered", "received", "cancelled")


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint(f"category IN {CATEGORIES}", name="ck_products_category"),
        CheckConstraint("qty_on_hand >= 0", name="ck_products_qty_on_hand"),
        CheckConstraint("qty_reserved >= 0 AND qty_reserved <= qty_on_hand", name="ck_products_qty_reserved"),
        CheckConstraint("cost_price >= 0 AND sale_price >= 0", name="ck_products_prices"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(30), index=True)
    brand: Mapped[str | None] = mapped_column(String(80))
    model: Mapped[str | None] = mapped_column(String(80))
    wattage: Mapped[int | None] = mapped_column(Integer)
    unit: Mapped[str] = mapped_column(String(12), default="pcs")
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    sale_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    warranty_months: Mapped[int] = mapped_column(Integer, default=0)
    is_serialized: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dcr: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    qty_on_hand: Mapped[int] = mapped_column(Integer, default=0)
    qty_reserved: Mapped[int] = mapped_column(Integer, default=0)
    reorder_level: Mapped[int] = mapped_column(Integer, default=0)


class KitTemplate(TimestampMixin, Base):
    __tablename__ = "kit_templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    capacity_kw: Mapped[Decimal] = mapped_column(Numeric(4, 1))
    system_type: Mapped[str] = mapped_column(String(20))
    includes_installation: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    lines: Mapped[list["KitLine"]] = relationship(back_populates="kit", cascade="all, delete-orphan")


class KitLine(Base):
    __tablename__ = "kit_lines"
    __table_args__ = (UniqueConstraint("kit_id", "product_id"), CheckConstraint("qty > 0", name="ck_kit_lines_qty"))
    id: Mapped[int] = mapped_column(primary_key=True)
    kit_id: Mapped[int] = mapped_column(ForeignKey("kit_templates.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    qty: Mapped[int] = mapped_column(Integer)

    kit: Mapped[KitTemplate] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship()


class Supplier(TimestampMixin, Base):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20))
    gstin: Mapped[str | None] = mapped_column(String(20))


class Purchase(TimestampMixin, Base):
    __tablename__ = "purchases"
    __table_args__ = (CheckConstraint(f"status IN {PURCHASE_STATUSES}", name="ck_purchases_status"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    ordered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": version}

    supplier: Mapped[Supplier] = relationship()
    lines: Mapped[list["PurchaseLine"]] = relationship(back_populates="purchase", cascade="all, delete-orphan")


class PurchaseLine(Base):
    __tablename__ = "purchase_lines"
    __table_args__ = (CheckConstraint("qty > 0", name="ck_purchase_lines_qty"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchases.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    qty: Mapped[int] = mapped_column(Integer)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    purchase: Mapped[Purchase] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship()


class StockUnit(TimestampMixin, Base):
    """One physical serial-numbered item (inverter, battery, panel...)."""
    __tablename__ = "stock_units"
    __table_args__ = (
        CheckConstraint(f"status IN {UNIT_STATUSES}", name="ck_stock_units_status"),
        Index("ix_stock_units_product_status", "product_id", "status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    serial_no: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    purchase_line_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_lines.id"))
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="in_stock")
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), index=True)
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    warranty_end: Mapped[date | None] = mapped_column(Date)
    qr_token: Mapped[str | None] = mapped_column(String(64), unique=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": version}

    product: Mapped[Product] = relationship()
