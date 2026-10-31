from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.models.catalog import KitTemplate, Product
from app.models.crm import Customer, Lead

ORDER_STATUSES = ("draft", "sent", "confirmed", "dispatched", "delivered", "installed", "completed", "cancelled")


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(f"status IN {ORDER_STATUSES}", name="ck_orders_status"),
        CheckConstraint("sanctioned_kw IS NULL OR sanctioned_kw > 0", name="ck_orders_sanctioned"),
        Index("ix_orders_status_created", "status", "created_at"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    kit_id: Mapped[int] = mapped_column(ForeignKey("kit_templates.id"))
    capacity_kw: Mapped[Decimal] = mapped_column(Numeric(4, 1))
    includes_installation: Mapped[bool] = mapped_column(Boolean, default=True)
    is_subsidy: Mapped[bool] = mapped_column(Boolean, default=False)
    sanctioned_kw: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    expected_subsidy: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": version}

    customer: Mapped[Customer] = relationship()
    lead: Mapped[Lead] = relationship()
    kit: Mapped[KitTemplate] = relationship()
    lines: Mapped[list["OrderLine"]] = relationship(back_populates="order", cascade="all, delete-orphan",
                                                    order_by="OrderLine.id")


class OrderLine(Base):
    __tablename__ = "order_lines"
    __table_args__ = (CheckConstraint("qty > 0", name="ck_order_lines_qty"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    qty: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    order: Mapped[Order] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship()


class PickList(TimestampMixin, Base):
    __tablename__ = "pick_lists"
    __table_args__ = (CheckConstraint("status IN ('pending','packed','dispatched')", name="ck_pick_lists_status"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")

    order: Mapped[Order] = relationship()
