from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String,
                        Text, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.models.catalog import Product, StockUnit
from app.models.crm import Customer

TICKET_STATUSES = ("open", "assigned", "in_progress", "resolved", "closed")
INVOICE_STATUSES = ("draft", "sent", "partially_paid", "paid", "cancelled")


class Ticket(TimestampMixin, Base):
    __tablename__ = "tickets"
    __table_args__ = (
        CheckConstraint(f"status IN {TICKET_STATUSES}", name="ck_tickets_status"),
        CheckConstraint("channel IN ('phone','qr','walk_in')", name="ck_tickets_channel"),
        Index("ix_tickets_status_due", "status", "due_by"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    stock_unit_id: Mapped[int | None] = mapped_column(ForeignKey("stock_units.id"), index=True)
    channel: Mapped[str] = mapped_column(String(10), default="phone")
    issue: Mapped[str] = mapped_column(Text)
    fault_code: Mapped[str | None] = mapped_column(String(40))
    in_warranty: Mapped[bool] = mapped_column(Boolean, default=False)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    due_by: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    customer_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": version}

    customer: Mapped[Customer] = relationship()
    unit: Mapped[StockUnit | None] = relationship(foreign_keys=[stock_unit_id])
    lines: Mapped[list["TicketLine"]] = relationship(back_populates="ticket", cascade="all, delete-orphan",
                                                     order_by="TicketLine.id")


class TicketLine(Base):
    __tablename__ = "ticket_lines"
    __table_args__ = (CheckConstraint("qty > 0", name="ck_ticket_lines_qty"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    is_labour: Mapped[bool] = mapped_column(Boolean, default=False)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    replacement_unit_id: Mapped[int | None] = mapped_column(ForeignKey("stock_units.id"))
    description: Mapped[str] = mapped_column(String(200))
    qty: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))   # what the customer is charged
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2))    # what it costs the company
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    ticket: Mapped[Ticket] = relationship(back_populates="lines")
    product: Mapped[Product | None] = relationship()


class Invoice(TimestampMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        CheckConstraint(f"status IN {INVOICE_STATUSES}", name="ck_invoices_status"),
        CheckConstraint("amount_paid >= 0 AND amount_paid <= total", name="ck_invoices_paid_le_total"),
        CheckConstraint("order_id IS NOT NULL OR ticket_id IS NOT NULL", name="ck_invoices_source"),
        Index("ix_invoices_status_due", "status", "due_date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), index=True)
    ticket_id: Mapped[int | None] = mapped_column(ForeignKey("tickets.id"), index=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": version}

    customer: Mapped[Customer] = relationship()
    lines: Mapped[list["InvoiceLine"]] = relationship(back_populates="invoice", cascade="all, delete-orphan",
                                                      order_by="InvoiceLine.id")
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice", order_by="Payment.id")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(String(200))
    qty: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_payments_amount"),
        CheckConstraint("method IN ('cash','upi','bank_transfer','cheque','card')", name="ck_payments_method"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    method: Mapped[str] = mapped_column(String(20))
    reference: Mapped[str | None] = mapped_column(String(80))
    idempotency_key: Mapped[str | None] = mapped_column(String(80), unique=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    recorded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    invoice: Mapped[Invoice] = relationship(back_populates="payments")


class SharedReport(Base):
    __tablename__ = "shared_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    title: Mapped[str] = mapped_column(String(120), default="Business report")
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReportView(Base):
    __tablename__ = "report_views"
    id: Mapped[int] = mapped_column(primary_key=True)
    shared_report_id: Mapped[int] = mapped_column(ForeignKey("shared_reports.id", ondelete="CASCADE"), index=True)
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(Text)
