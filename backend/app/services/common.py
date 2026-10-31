"""Small shared helpers used by every service."""
import calendar
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import SEQUENCES, ActivityLog, Setting

DEFAULT_SETTINGS = {
    "company_name": "SunPower Solutions",
    # PM Surya Ghar central subsidy: Rs 30,000/kW for first 2 kW, Rs 18,000 for 3rd kW, cap Rs 78,000
    "subsidy_rates": {"first_2kw_per_kw": 30000, "third_kw": 18000, "cap": 78000},
    "tariff_per_unit": 7.5,          # Rs per kWh saved
    "gen_per_kw_per_day": 4.0,       # kWh generated per kW per day
    "gst_percent": 0,                # keep 0 unless the team decides to model GST
    "ticket_sla_days": 15,           # MNRE defect-rectification deadline
    "subsidy_stage_sla_days": 30,
    "invoice_due_days": 30,
    "default_labour_rate": 450,      # Rs/hour billed for out-of-warranty labour
    "min_advance_percent": 30,       # installers typically collect 30-50% upfront
}


def now() -> datetime:
    return datetime.now(timezone.utc)


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def next_number(db: Session, prefix: str) -> str:
    """ORD-2026-0001 style numbers from a Postgres sequence (safe under concurrency)."""
    value = db.execute(SEQUENCES[prefix].next_value()).scalar_one()
    return f"{prefix}-{now().year}-{value:04d}"


def get_setting(db: Session, key: str):
    row = db.get(Setting, key)
    return row.value if row else DEFAULT_SETTINGS.get(key)


def log_activity(db: Session, user_id: int | None, entity: str, entity_id: int, action: str,
                 details: dict | None = None) -> None:
    db.add(ActivityLog(user_id=user_id, entity=entity, entity_id=entity_id, action=action, details=details))


def paginate(db: Session, stmt, page: int, page_size: int, serializer):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    total = db.execute(select(func.count()).select_from(stmt.order_by(None).subquery())).scalar_one()
    rows = db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).unique().scalars().all()
    return {"items": [serializer(r) for r in rows], "total": total, "page": page, "page_size": page_size}


def normalize_name(name: str | None) -> str:
    return " ".join((name or "").lower().split())


def subsidy_for_kw(db: Session, kw) -> Decimal:
    rates = get_setting(db, "subsidy_rates")
    kw = Decimal(str(kw))
    first = min(kw, Decimal(2)) * Decimal(rates["first_2kw_per_kw"])
    third = min(max(kw - 2, Decimal(0)), Decimal(1)) * Decimal(rates["third_kw"])
    return money(min(first + third, Decimal(rates["cap"])))
