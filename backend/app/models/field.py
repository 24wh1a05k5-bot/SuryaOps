from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
                        UniqueConstraint, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.models.catalog import StockUnit
from app.models.sales import Order

JOB_STATUSES = ("unscheduled", "scheduled", "in_progress", "completed", "customer_accepted", "cancelled")
PHOTO_KINDS = ("roof", "inverter_serial", "wiring", "meter", "after_repair", "other")
SUBSIDY_STAGES = ("applied", "feasibility_approved", "installed", "inspection_submitted",
                  "net_meter_installed", "subsidy_credited")


class Job(TimestampMixin, Base):
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint(f"status IN {JOB_STATUSES}", name="ck_jobs_status"),
        CheckConstraint("scheduled_end IS NULL OR scheduled_end > scheduled_start", name="ck_jobs_sched"),
        CheckConstraint("actual_end IS NULL OR actual_end > actual_start", name="ck_jobs_actual"),
        Index("ix_jobs_tech_start", "technician_id", "scheduled_start"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    scheduled_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scheduled_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    installed_kw: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    status: Mapped[str] = mapped_column(String(20), default="unscheduled")
    signature_path: Mapped[str | None] = mapped_column(String(300))
    signed_by_name: Mapped[str | None] = mapped_column(String(120))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": version}

    order: Mapped[Order] = relationship()


class JobSerial(Base):
    __tablename__ = "job_serials"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    stock_unit_id: Mapped[int] = mapped_column(ForeignKey("stock_units.id"), unique=True)

    unit: Mapped[StockUnit] = relationship()


class Photo(Base):
    __tablename__ = "photos"
    __table_args__ = (
        CheckConstraint("owner_type IN ('job','ticket')", name="ck_photos_owner"),
        CheckConstraint(f"kind IN {PHOTO_KINDS}", name="ck_photos_kind"),
        Index("ix_photos_owner", "owner_type", "owner_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_type: Mapped[str] = mapped_column(String(10))
    owner_id: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20))
    path: Mapped[str] = mapped_column(String(300))
    lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TimeLog(Base):
    __tablename__ = "time_logs"
    __table_args__ = (
        CheckConstraint("source_type IN ('survey','job','ticket')", name="ck_time_logs_source"),
        CheckConstraint("ended_at > started_at", name="ck_time_logs_range"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    source_type: Mapped[str] = mapped_column(String(10))
    source_id: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    hours: Mapped[Decimal] = mapped_column(Numeric(6, 2))


class PayRun(Base):
    __tablename__ = "pay_runs"
    __table_args__ = (UniqueConstraint("technician_id", "month", name="uq_pay_runs_tech_month"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    month: Mapped[date] = mapped_column(Date)
    hours: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class SubsidyCase(TimestampMixin, Base):
    __tablename__ = "subsidy_cases"
    __table_args__ = (CheckConstraint(f"stage IN {SUBSIDY_STAGES}", name="ck_subsidy_stage"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    application_no: Mapped[str | None] = mapped_column(String(60))
    stage: Mapped[str] = mapped_column(String(30), default="applied")
    stage_entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    feasibility_approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    inspection_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    net_meter_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subsidy_credited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": version}

    order: Mapped[Order] = relationship()


class SubsidyEvent(Base):
    __tablename__ = "subsidy_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("subsidy_cases.id", ondelete="CASCADE"), index=True)
    from_stage: Mapped[str | None] = mapped_column(String(30))
    to_stage: Mapped[str] = mapped_column(String(30))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
