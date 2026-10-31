from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin

LEAD_STATUSES = ("new", "contacted", "qualified", "survey_scheduled", "survey_approved", "quoted", "won", "lost")
SURVEY_STATUSES = ("scheduled", "submitted", "approved", "rejected")


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(160))
    address: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str | None] = mapped_column(String(80))
    pincode: Mapped[str | None] = mapped_column(String(10))
    consumer_no: Mapped[str | None] = mapped_column(String(40))
    aadhaar_name: Mapped[str | None] = mapped_column(String(120))
    bill_name: Mapped[str | None] = mapped_column(String(120))
    bank_account_name: Mapped[str | None] = mapped_column(String(120))
    bank_aadhaar_seeded: Mapped[bool] = mapped_column(Boolean, default=False)
    monthly_bill: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    leads: Mapped[list["Lead"]] = relationship(back_populates="customer")


class Lead(TimestampMixin, Base):
    __tablename__ = "leads"
    __table_args__ = (
        CheckConstraint("source IN ('web','call','whatsapp','referral')", name="ck_leads_source"),
        CheckConstraint("system_type IN ('panel_set','on_grid','off_grid')", name="ck_leads_type"),
        CheckConstraint(f"status IN {LEAD_STATUSES}", name="ck_leads_status"),
        CheckConstraint("requested_kw > 0 AND requested_kw <= 10", name="ck_leads_kw"),
        Index("ix_leads_status_created", "status", "created_at"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    source: Mapped[str] = mapped_column(String(20))
    requested_kw: Mapped[Decimal] = mapped_column(Numeric(4, 1))
    system_type: Mapped[str] = mapped_column(String(20))
    wants_subsidy: Mapped[bool] = mapped_column(Boolean, default=False)
    roof_area_sqft: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    shadow_free: Mapped[bool | None] = mapped_column(Boolean)
    grid_suitable: Mapped[bool | None] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String(20), default="new")
    lost_reason: Mapped[str | None] = mapped_column(String(300))
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": version}

    customer: Mapped[Customer] = relationship(back_populates="leads")
    surveys: Mapped[list["Survey"]] = relationship(back_populates="lead", order_by="Survey.id")


class LeadNote(Base):
    __tablename__ = "lead_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Survey(TimestampMixin, Base):
    __tablename__ = "surveys"
    __table_args__ = (
        CheckConstraint(f"status IN {SURVEY_STATUSES}", name="ck_surveys_status"),
        CheckConstraint("tilt_deg IS NULL OR (tilt_deg >= 0 AND tilt_deg <= 90)", name="ck_surveys_tilt"),
        CheckConstraint("cable_distance_m IS NULL OR cable_distance_m >= 0", name="ck_surveys_cable"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    roof_direction: Mapped[str | None] = mapped_column(String(20))
    tilt_deg: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    cable_distance_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 1))
    usable_area_sqft: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(String(300))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": version}

    lead: Mapped[Lead] = relationship(back_populates="surveys")
